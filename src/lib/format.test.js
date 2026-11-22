import { describe, expect, it } from 'vitest'
import { displayName, formatDuration } from './format.js'

describe('formatDuration', () => {
  it('uses just now for less than one minute', () => {
    expect(formatDuration(0)).toBe('just now')
    expect(formatDuration(0.9)).toBe('just now')
  })

  it('shows whole minutes under an hour', () => {
    expect(formatDuration(12.8)).toBe('12 min')
    expect(formatDuration(59)).toBe('59 min')
  })

  it('shows hours and zero-padded remaining minutes', () => {
    expect(formatDuration(60)).toBe('1 h 00 min')
    expect(formatDuration(125)).toBe('2 h 05 min')
  })
})

describe('displayName', () => {
  it('title-cases only names that are entirely uppercase', () => {
    expect(displayName('MARIA DELA CRUZ')).toBe('Maria Dela Cruz')
    expect(displayName("ANNE-MARIE O'NEIL")).toBe("Anne-Marie O'Neil")
  })

  it('preserves mixed and lowercase names', () => {
    expect(displayName('Mary Ann')).toBe('Mary Ann')
    expect(displayName('jose rizal')).toBe('jose rizal')
    expect(displayName('')).toBe('')
  })
})
