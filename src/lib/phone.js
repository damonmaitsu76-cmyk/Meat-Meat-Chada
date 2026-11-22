// Philippine mobile numbers only: 09XX XXX XXXX, +63 9XX XXX XXXX or 63 9XX XXX XXXX.
// Guests may type spaces, dashes, dots or brackets between digits; anything else is rejected.
// supabase/sql/11_phone_validation.sql applies the same rule, so change both together.
const SEPARATORS = /[\s().-]/g
const PH_MOBILE = /^(?:\+63|63|0)(9\d{9})$/

// The number as 09XXXXXXXXX, or '' when it is not a valid mobile number.
export function normalizePhone(raw) {
  const match = PH_MOBILE.exec(String(raw ?? '').replace(SEPARATORS, ''))
  return match ? `0${match[1]}` : ''
}

export function isValidPhone(raw) {
  return normalizePhone(raw) !== ''
}
