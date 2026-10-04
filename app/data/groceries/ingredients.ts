// Ported from MealService.parseIngredient / consolidateIngredients in the Spring app.

const UNITS = new Set([
  'lb',
  'lbs',
  'oz',
  'g',
  'kg',
  'cup',
  'cups',
  'tsp',
  'tbsp',
  'ml',
  'l',
  'liter',
  'litre',
  'gallon',
  'gallons',
  'quart',
  'quarts',
  'pint',
  'pints',
  'fl',
  'bunch',
  'clove',
  'cloves',
  'slice',
  'slices',
  'can',
  'cans',
  'pkg',
  'package',
  'packages',
])

export interface ParsedIngredient {
  name: string
  quantity: string | null
}

export function parseIngredient(raw: string): ParsedIngredient {
  let trimmed = raw.trim()
  let parts = trimmed.split(/\s+/)
  if (!/^\d[\d./]*$/.test(parts[0])) return { name: trimmed, quantity: null }

  if (parts.length >= 3 && UNITS.has(parts[1].toLowerCase())) {
    return { name: parts.slice(2).join(' '), quantity: `${parts[0]} ${parts[1]}` }
  }
  if (parts.length >= 2) {
    return { name: parts.slice(1).join(' '), quantity: parts[0] }
  }
  return { name: trimmed, quantity: null }
}

export interface IngredientLike {
  name: string
  quantity: string | null
  kroger_product_id: string | null
  kroger_product_name: string | null
}

export interface ConsolidatedIngredient {
  name: string
  quantity: string | null
  krogerProductId: string | null
  krogerProductName: string | null
}

export function normalizeIngredientName(name: string) {
  return name.trim().toLowerCase()
}

// Ingredients must arrive in meal order, then insertion order. Groups keep first-seen
// order and are named by their normalized key; the last linked product wins.
export function consolidate(items: Iterable<IngredientLike>): ConsolidatedIngredient[] {
  let groups = new Map<
    string,
    { quantities: (string | null)[]; productId: string | null; productName: string | null }
  >()

  for (let item of items) {
    let key = normalizeIngredientName(item.name)
    let group = groups.get(key)
    if (!group) {
      group = { quantities: [], productId: null, productName: null }
      groups.set(key, group)
    }
    group.quantities.push(item.quantity)
    if (item.kroger_product_id != null) {
      group.productId = item.kroger_product_id
      group.productName = item.kroger_product_name
    }
  }

  return Array.from(groups, ([name, group]) => ({
    name,
    quantity: combineQuantities(group.quantities),
    krogerProductId: group.productId,
    krogerProductName: group.productName,
  }))
}

function combineQuantities(quantities: (string | null)[]): string | null {
  let present = quantities.filter((q): q is string => q != null)
  if (present.length === 0) return null
  if (present.every((q) => /^\d+$/.test(q))) {
    return String(present.reduce((sum, q) => sum + Number.parseInt(q, 10), 0))
  }
  return present.join(' + ')
}
