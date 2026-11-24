// Pure helpers for the customer tray (no React in here, so they are easy to test).

// Puts the dishes of an earlier request back into the tray ("Order again").
// lines: [{ item_id?, item_name, quantity }]. A dish the menu no longer has, or that is out
// for now, is skipped and counted so the guest can be told. Quantities add to what the tray
// already holds and stop at maxQty.
export function orderAgain(tray, lines, menuItems, maxQty) {
  const byId = new Map(menuItems.map((item) => [item.item_id, item]))
  const byName = new Map(menuItems.map((item) => [item.item_name, item]))
  const next = { ...tray }
  let added = 0
  let skipped = 0
  for (const line of lines) {
    const item = byId.get(line.item_id) ?? byName.get(line.item_name)
    if (!item || !item.is_available) {
      skipped += 1
      continue
    }
    next[item.item_id] = Math.min((next[item.item_id] || 0) + line.quantity, maxQty)
    added += 1
  }
  return { tray: next, added, skipped }
}

// Tray lines grouped under their menu category, in menu order. Empty categories are left out.
export function groupByCategory(lines, categories) {
  return categories
    .map((category) => ({ ...category, lines: lines.filter((line) => line.item.category === category.key) }))
    .filter((group) => group.lines.length > 0)
}
