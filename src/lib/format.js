export function formatDuration(minutes) {
  const wholeMinutes = Math.floor(Number.isFinite(Number(minutes)) ? Number(minutes) : 0)
  if (wholeMinutes < 1) return 'just now'
  if (wholeMinutes < 60) return `${wholeMinutes} min`
  const hours = Math.floor(wholeMinutes / 60)
  const remainder = String(wholeMinutes % 60).padStart(2, '0')
  return `${hours} h ${remainder} min`
}

export function displayName(name) {
  const value = String(name ?? '')
  if (!/\p{L}/u.test(value) || value !== value.toLocaleUpperCase('en')) return value
  return value
    .toLocaleLowerCase('en')
    .replace(/(^|[\s'-])(\p{L})/gu, (_match, separator, letter) => `${separator}${letter.toLocaleUpperCase('en')}`)
}
