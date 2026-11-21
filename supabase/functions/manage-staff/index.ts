// Supabase Edge Function: manage-staff
//
// Creates staff logins and resets passwords. This has to run on the server because
// only the service role key may create or change logins, and that key must never
// reach the browser. The function checks who is calling before it does anything.
//
// Body:  { action: 'create', username, password, role }
//        { action: 'reset_password', user_id, password }
// Rule:  only an active administrator may call it, and may manage every account.
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

const ROLES = ['staff', 'admin']
const EMAIL_DOMAIN = 'chada.app' // same as src/auth/AuthProvider.jsx

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // 1) Who is calling? Check the login token, then the role stored in public.users.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Please log in again.' }, 401)
  const callerId = authData.user.id

  const { data: caller } = await admin
    .from('users')
    .select('role, status')
    .eq('user_id', callerId)
    .maybeSingle()
  if (!caller || caller.status !== 'active' || caller.role !== 'admin') {
    return json({ error: 'Only an administrator can do this.' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The request was not understood.' }, 400)
  }

  const password = String(body.password ?? '')
  if (password.length < 8 || password.length > 72) {
    return json({ error: 'The password must be 8 to 72 characters long.' }, 400)
  }

  // 2) Create a login
  if (body.action === 'create') {
    const username = String(body.username ?? '').trim().toLowerCase()
    const role = String(body.role ?? 'staff')

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return json({ error: 'The username must be 3 to 30 letters, numbers, dots, dashes, or underscores.' }, 400)
    }
    if (!ROLES.includes(role)) return json({ error: 'Unknown role.' }, 400)

    const { data: taken } = await admin.from('users').select('user_id').eq('username', username).maybeSingle()
    if (taken) return json({ error: 'That username is already taken.' }, 409)

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: `${username}@${EMAIL_DOMAIN}`,
      password,
      email_confirm: true, // no confirmation email: these are not real mailboxes
    })
    if (createError || !created.user) {
      const exists = /already|exists|registered/i.test(createError?.message ?? '')
      return json(
        { error: exists ? 'That username is already taken.' : (createError?.message ?? 'Could not create the account.') },
        exists ? 409 : 400,
      )
    }

    const { error: rowError } = await admin
      .from('users')
      .insert({ user_id: created.user.id, username, role })
    if (rowError) {
      await admin.auth.admin.deleteUser(created.user.id) // do not leave a login without a profile
      return json({ error: rowError.message }, 400)
    }

    await admin.from('activity_logs').insert({
      user_id: callerId,
      action: 'create_account',
      record_type: 'users',
      details: { username, role },
    })
    return json({ ok: true, username })
  }

  // 3) Reset a password
  if (body.action === 'reset_password') {
    const targetId = String(body.user_id ?? '')
    const { data: target } = await admin
      .from('users')
      .select('username')
      .eq('user_id', targetId)
      .maybeSingle()
    if (!target) return json({ error: 'Account not found.' }, 404)

    const { error } = await admin.auth.admin.updateUserById(targetId, { password })
    if (error) return json({ error: error.message }, 400)

    await admin.from('activity_logs').insert({
      user_id: callerId,
      action: 'reset_password',
      record_type: 'users',
      details: { username: target.username },
    })
    return json({ ok: true })
  }

  return json({ error: 'Unknown action.' }, 400)
})
