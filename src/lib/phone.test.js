import { describe, expect, it } from 'vitest'
import { isValidPhone, normalizePhone } from './phone.js'

describe('normalizePhone', () => {
  it('accepts the local, international and bare-country forms', () => {
    expect(normalizePhone('09171234567')).toBe('09171234567')
    expect(normalizePhone('+639171234567')).toBe('09171234567')
    expect(normalizePhone('639171234567')).toBe('09171234567')
  })

  it('ignores spaces, dashes, dots and brackets', () => {
    expect(normalizePhone('0917 123 4567')).toBe('09171234567')
    expect(normalizePhone('0917-123-4567')).toBe('09171234567')
    expect(normalizePhone('+63 (917) 123.4567')).toBe('09171234567')
    expect(normalizePhone('  09171234567  ')).toBe('09171234567')
  })

  it('rejects text, empty values and non-strings', () => {
    expect(normalizePhone('sadsadadadsdaadsdasd')).toBe('')
    expect(normalizePhone('0917abc4567')).toBe('')
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('   ')).toBe('')
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
  })

  it('rejects the wrong number of digits', () => {
    expect(normalizePhone('0917123456')).toBe('')
    expect(normalizePhone('091712345678')).toBe('')
    expect(normalizePhone('+63917123456')).toBe('')
    expect(normalizePhone('+6391712345678')).toBe('')
  })

  it('rejects numbers that are not mobile numbers or have a misplaced plus', () => {
    expect(normalizePhone('0841234567')).toBe('')
    expect(normalizePhone('0817123456')).toBe('')
    expect(normalizePhone('+09171234567')).toBe('')
    expect(normalizePhone('0917+1234567')).toBe('')
    expect(normalizePhone('+14155552671')).toBe('')
  })
})

describe('isValidPhone', () => {
  it('mirrors normalizePhone', () => {
    expect(isValidPhone('0917 123 4567')).toBe(true)
    expect(isValidPhone('hello')).toBe(false)
  })
})
