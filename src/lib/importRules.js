// Rules for the CSV import (Import Data screen). No React in here, so they are easy to test.
//
// menu_items.csv         columns: item_name, category, is_available (yes/no, optional)
// restaurant_tables.csv  columns: table_number, capacity, is_active (yes/no, optional)

export const CATEGORIES = ['meats', 'sides', 'drinks', 'add-on']
export const MAX_ROWS = 500

export const IMPORT_TYPES = {
  menu: {
    label: 'Menu items',
    table: 'menu_items',
    fileName: 'menu_items.csv',
    columns: ['item_name', 'category', 'is_available'],
    required: ['item_name', 'category'],
  },
  tables: {
    label: 'Tables',
    table: 'restaurant_tables',
    fileName: 'restaurant_tables.csv',
    columns: ['table_number', 'capacity', 'is_active'],
    required: ['table_number', 'capacity'],
  },
}

const text = (v) => String(v ?? '').trim()

// "yes" / "no" (any capitals). Blank means the default.
function readYesNo(raw, fallback) {
  const v = text(raw).toLowerCase()
  if (v === '') return { value: fallback }
  if (v === 'yes') return { value: true }
  if (v === 'no') return { value: false }
  return { error: true }
}

// Each checker returns { record, key } for a good row, or { reason } for a bad one.
// "key" is what makes two rows the same dish or the same table.
function checkMenuRow(row) {
  const name = text(row.item_name).replace(/\s+/g, ' ')
  const category = text(row.category).toLowerCase()
  if (!name) return { reason: 'The dish name is blank.' }
  if (name.length > 80) return { reason: 'The dish name is longer than 80 characters.' }
  if (!CATEGORIES.includes(category)) return { reason: 'The category must be meats, sides, drinks, or add-on.' }
  const available = readYesNo(row.is_available, true)
  if (available.error) return { reason: 'Availability must be yes or no.' }
  return {
    record: { item_name: name, category, is_available: available.value },
    key: `${name.toLowerCase()}|${category}`,
  }
}

function checkTableRow(row) {
  const number = text(row.table_number)
  const capacity = text(row.capacity)
  if (!/^\d{1,5}$/.test(number) || Number(number) < 1) {
    return { reason: 'The table number must be a whole number above zero.' }
  }
  if (!/^\d{1,3}$/.test(capacity) || Number(capacity) < 1) {
    return { reason: 'The capacity must be a whole number above zero.' }
  }
  const active = readYesNo(row.is_active, true)
  if (active.error) return { reason: 'Active must be yes or no.' }
  return {
    record: { table_number: Number(number), capacity: Number(capacity), is_active: active.value },
    key: String(Number(number)),
  }
}

// The key of a row that is already in the database, built the same way as above.
export function existingKey(typeKey, row) {
  return typeKey === 'menu'
    ? `${String(row.item_name).trim().replace(/\s+/g, ' ').toLowerCase()}|${row.category}`
    : String(row.table_number)
}

// Sorts every row of the file into: records to save, rows skipped (already there),
// and rows that failed the checks. "row" counts the data rows, starting at 1.
export function planImport(typeKey, rows, existingKeys) {
  const check = typeKey === 'menu' ? checkMenuRow : checkTableRow
  const seen = new Set(existingKeys)
  const records = []
  const skipped = []
  const failed = []

  rows.forEach((data, i) => {
    const row = i + 1
    const result = check(data)
    if (result.reason) {
      failed.push({ row, data, reason: result.reason })
      return
    }
    if (seen.has(result.key)) {
      const inDb = existingKeys.has(result.key)
      skipped.push({
        row,
        data,
        reason:
          typeKey === 'menu'
            ? inDb
              ? 'This dish is already on the menu.'
              : 'This dish appears twice in the file.'
            : inDb
              ? 'This table number already exists (it may be a removed table).'
              : 'This table number appears twice in the file.',
      })
      return
    }
    seen.add(result.key)
    records.push(result.record)
  })

  return { records, skipped, failed }
}
