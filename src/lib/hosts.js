// Guests and staff use two addresses of the same app:
//   guests  https://meat-me-at-chada.tech           (menu, reservations)
//   staff   https://staff.meat-me-at-chada.tech     (login, dashboard, management)
//
// Set both where Cloudflare reads BUILD variables, then redeploy (VITE_ values are baked in
// at build time, so runtime variables do not reach them):
//   Cloudflare Workers: your project > Settings > Build > Build variables and secrets
//   Cloudflare Pages:   your project > Settings > Variables and Secrets (Production)
//   VITE_PUBLIC_SITE_URL = https://meat-me-at-chada.tech
//   VITE_STAFF_SITE_URL  = https://staff.meat-me-at-chada.tech
//
// If either one is missing (local dev, a pages.dev preview), nothing is split or redirected
// and every page works on every address, as before.
// VITE_PUBLIC_SITE_URL is also what src/lib/siteUrl.js puts inside the printed QR codes, so
// QR codes always point at the guest address, even when they are printed from the staff one.

const clean = (value) => String(value ?? '').trim().replace(/\/+$/, '')

export const siteUrl = clean(import.meta.env.VITE_PUBLIC_SITE_URL)
export const staffUrl = clean(import.meta.env.VITE_STAFF_SITE_URL)

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const siteHostname = hostnameOf(siteUrl)
const staffHostname = hostnameOf(staffUrl)

// The split only switches on when both addresses are valid and different.
export const splitEnabled = Boolean(siteHostname && staffHostname && siteHostname !== staffHostname)

// 'staff' on the staff address, 'guest' on any other address (including www),
// or 'both' when the split is off.
export function currentSide() {
  if (!splitEnabled) return 'both'
  return window.location.hostname.toLowerCase() === staffHostname ? 'staff' : 'guest'
}
