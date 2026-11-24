import { describe, expect, it } from 'vitest'
import { groupByCategory, orderAgain } from './tray.js'

const menu = [
  { item_id: 1, item_name: 'Pork Belly', category: 'meats', is_available: true },
  { item_id: 2, item_name: 'Beef Bulgogi', category: 'meats', is_available: false },
  { item_id: 3, item_name: 'Kimchi', category: 'sides', is_available: true },
]

describe('orderAgain', () => {
  it('adds the dishes of an earlier request to the tray', () => {
    const result = orderAgain({ 3: 1 }, [{ item_id: 1, item_name: 'Pork Belly', quantity: 4 }], menu, 20)
    expect(result).toEqual({ tray: { 1: 4, 3: 1 }, added: 1, skipped: 0 })
  })

  it('adds to a quantity already in the tray and stops at the maximum', () => {
    const result = orderAgain({ 1: 18 }, [{ item_id: 1, item_name: 'Pork Belly', quantity: 5 }], menu, 20)
    expect(result.tray).toEqual({ 1: 20 })
  })

  it('skips dishes that are out for now or gone, and counts them', () => {
    const result = orderAgain(
      {},
      [
        { item_id: 2, item_name: 'Beef Bulgogi', quantity: 2 },
        { item_id: 99, item_name: 'Deleted dish', quantity: 1 },
        { item_id: 3, item_name: 'Kimchi', quantity: 1 },
      ],
      menu,
      20
    )
    expect(result).toEqual({ tray: { 3: 1 }, added: 1, skipped: 2 })
  })

  it('finds a dish by name when the earlier request has no dish id', () => {
    const result = orderAgain({}, [{ item_name: 'Kimchi', quantity: 2 }], menu, 20)
    expect(result.tray).toEqual({ 3: 2 })
    const nullId = orderAgain({}, [{ item_id: null, item_name: 'Kimchi', quantity: 2 }], menu, 20)
    expect(nullId.tray).toEqual({ 3: 2 })
  })

  it('does not change the tray it was given', () => {
    const tray = { 3: 1 }
    orderAgain(tray, [{ item_id: 1, item_name: 'Pork Belly', quantity: 4 }], menu, 20)
    expect(tray).toEqual({ 3: 1 })
  })
})

describe('groupByCategory', () => {
  const categories = [
    { key: 'meats', label: 'Meats' },
    { key: 'sides', label: 'Sides' },
    { key: 'drinks', label: 'Drinks' },
  ]
  const line = (item) => ({ id: item.item_id, quantity: 1, item })

  it('groups in menu order and leaves out empty categories', () => {
    const groups = groupByCategory([line(menu[2]), line(menu[0])], categories)
    expect(groups.map((group) => group.key)).toEqual(['meats', 'sides'])
    expect(groups[0].lines).toHaveLength(1)
    expect(groups[1].lines[0].item.item_name).toBe('Kimchi')
  })
})
