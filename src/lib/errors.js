// Customer screens show only messages the database wrote for guests (error code P0001, like
// "That time slot is no longer available"). Anything else, such as a missing function, a dropped
// connection or a constraint name, becomes one plain sentence, so schema details never reach a
// guest's phone.
const GENERIC = 'Something went wrong on our side. Please try again, or ask a staff member for help.'
const OFFLINE = 'We could not reach the server. Check your internet connection and try again.'

export function friendlyError(error) {
  if (!error) return ''
  const message = String(error.message || '')
  if (error.code === 'P0001' && message) return message
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) return OFFLINE
  return GENERIC
}
