import { afterEach, describe, expect, it, vi } from 'vitest'
import { newToken } from './token.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newToken', () => {
  it('returns a version 4 UUID', () => {
    expect(newToken()).toMatch(UUID_V4)
  })

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newToken()))
    expect(tokens.size).toBe(200)
  })

  it('still works where crypto.randomUUID is missing (plain http pages)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: (array) => real.getRandomValues(array) })
    expect(newToken()).toMatch(UUID_V4)
  })
})
