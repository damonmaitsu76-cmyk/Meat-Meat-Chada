export function getSiteBaseUrl() {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL?.trim()
  return (configured || window.location.origin).replace(/\/+$/, '')
}

export function isLocalAddress(url) {
  let hostname
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  } catch {
    return false
  }

  if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local')) return true

  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false
  const octets = hostname.split('.').map(Number)
  if (octets.some((octet) => octet > 255)) return false

  const [first, second] = octets
  return first === 127 || first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31)
}
