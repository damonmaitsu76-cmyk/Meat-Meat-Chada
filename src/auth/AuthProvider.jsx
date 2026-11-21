import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { AuthContext } from './AuthContext.js'

// Supabase Auth needs an email, so the login screen turns "staff1" into "staff1@chada.app".
const EMAIL_DOMAIN = 'chada.app'

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [profileState, setProfileState] = useState(null) // { userId, data } - data is null when not allowed
  const [authMessage, setAuthMessage] = useState('')

  // 1) Who is logged in? (also fires when the token refreshes or the user logs out)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionChecked(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // 2) Load that user's profile (username + role) from public.users.
  const userId = session?.user?.id ?? null
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    supabase
      .from('users')
      .select('user_id, username, role, status')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data || data.status !== 'active') {
          setAuthMessage(
            error
              ? 'Could not load your account. Please try again.'
              : 'This account is not active. Please ask the manager.'
          )
          setProfileState({ userId, data: null })
          supabase.auth.signOut()
        } else {
          setProfileState({ userId, data })
        }
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const profileReady = !userId || profileState?.userId === userId
  const profile = userId && profileState?.userId === userId ? profileState.data : null
  const loading = !sessionChecked || !profileReady

  const signIn = useCallback(async (username, password) => {
    setAuthMessage('')
    const email = `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? 'Wrong username or password.' : ''
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfileState(null)
  }, [])

  const value = useMemo(
    () => ({ profile, loading, authMessage, signIn, signOut }),
    [profile, loading, authMessage, signIn, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
