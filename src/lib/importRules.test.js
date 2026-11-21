import { describe, expect, it } from 'vitest'
import { planImport } from './importRules.js'

describe('planImport', () => {
  it('fails a row with a blank dish name', () => {
    const result = planImport('menu', [{ item_name: ' ', category: 'meats' }], new Set())

    expect(result.records).toEqual([])
    expect(result.skipped).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ row: 1, reason: 'The dish name is blank.' })
  })

  it('fails a row with a bad category', () => {
    const result = planImport(
      'menu',
      [{ item_name: 'Pork Belly', category: 'dessert' }],
      new Set()
    )

    expect(result.records).toEqual([])
    expect(result.skipped).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({
      row: 1,
      reason: 'The category must be meats, sides, or drinks.',
    })
  })

  it('skips a duplicate row inside the file', () => {
    const result = planImport(
      'menu',
      [
        { item_name: 'Pork Belly', category: 'meats' },
        { item_name: ' pork  belly ', category: 'MEATS' },
      ],
      new Set()
    )

    expect(result.records).toEqual([
      { item_name: 'Pork Belly', category: 'meats', is_available: true },
    ])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]).toMatchObject({
      row: 2,
      reason: 'This dish appears twice in the file.',
    })
    expect(result.failed).toEqual([])
  })

  it('skips a row already in the database', () => {
    const result = planImport(
      'menu',
      [{ item_name: 'Pork Belly', category: 'meats' }],
      new Set(['pork belly|meats'])
    )

    expect(result.records).toEqual([])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]).toMatchObject({
      row: 1,
      reason: 'This dish is already on the menu.',
    })
    expect(result.failed).toEqual([])
  })

  it('imports a good row', () => {
    const result = planImport(
      'menu',
      [{ item_name: 'Pork Belly', category: 'meats', is_available: 'yes' }],
      new Set()
    )

    expect(result.records).toEqual([
      { item_name: 'Pork Belly', category: 'meats', is_available: true },
    ])
    expect(result.skipped).toEqual([])
    expect(result.failed).toEqual([])
  })
})
