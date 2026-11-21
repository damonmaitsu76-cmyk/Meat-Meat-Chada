import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { AuthContext } from './AuthContext.js'

// Supabase Auth needs an email, so the login screen turns "staff1" into "staff1@chada.app".
const EMAIL_DOMAIN = 'chada.app'
const RECHECK_MS = 60000 // how often a logged-in account is checked again

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

  // 2) Load that user's profile (username + role) from public.users, then keep checking it,
  //    so an account that the manager deactivates (or changes) is noticed without a new login.
  const userId = session?.user?.id ?? null
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    function check(first) {
      supabase
        .from('users')
        .select('user_id, username, role, status')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled) return
          if (error && !first) return // a network blip must not log staff out in the middle of service
          if (error || !data || data.status !== 'active') {
            setAuthMessage(
              error
                ? 'Could not load your account. Please try again.'
                : first
                  ? 'This account is not active. Please ask the manager.'
                  : 'This account was deactivated. Please ask the manager.'
            )
            setProfileState({ userId, data: null })
            supabase.auth.signOut()
            return
          }
          // Keep the same object when nothing changed, so screens do not re-render for nothing.
          setProfileState((prev) =>
            prev?.userId === userId &&
            prev.data?.role === data.role &&
            prev.data?.username === data.username
              ? prev
              : { userId, data }
          )
        })
    }

    check(true)
    const timer = setInterval(() => check(false), RECHECK_MS)
    const onVisible = () => {
      if (!document.hidden) check(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [userId])

  const profileReady = !userId || profileState?.userId === userId
  const profile = userId && profileState?.userId === userId ? profileState.data : null
  const loading = !sessionChecked || !profileReady

  const signIn = useCallback(async (username, password) => {
    setAuthMessage('')
    const email = `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return ''
    // Show Supabase's real reason for anything other than a plain wrong password
    // (e.g. "Email not confirmed"), so problems with an account are easy to spot.
    return error.message === 'Invalid login credentials'
      ? 'Wrong username or password.'
      : error.message
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
