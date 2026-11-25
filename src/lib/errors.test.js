import { describe, expect, it } from 'vitest'
import { friendlyError } from './errors.js'

describe('friendlyError', () => {
  it('keeps messages the database wrote for guests', () => {
    const error = { code: 'P0001', message: 'That time slot is no longer available' }
    expect(friendlyError(error)).toBe('That time slot is no longer available')
  })

  it('hides schema and function names', () => {
    const text = friendlyError({
      code: 'PGRST202',
      message: 'Could not find the function public.submit_refill_request(p_client_token) in the schema cache',
    })
    expect(text).not.toMatch(/function|schema|public\./i)
    expect(text).toMatch(/Something went wrong/)
  })

  it('explains a dropped connection', () => {
    expect(friendlyError({ code: '', message: 'TypeError: Failed to fetch' })).toMatch(/internet connection/)
  })

  it('is empty when there is no error', () => {
    expect(friendlyError(null)).toBe('')
    expect(friendlyError(undefined)).toBe('')
  })
})
