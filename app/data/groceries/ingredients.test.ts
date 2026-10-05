import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { consolidate, parseIngredient, type IngredientLike } from './ingredients.ts'

function item(name: string, quantity: string | null, product?: [string, string]): IngredientLike {
  return {
    name,
    quantity,
    kroger_product_id: product?.[0] ?? null,
    kroger_product_name: product?.[1] ?? null,
  }
}

describe('parseIngredient', () => {
  // Cases ported from MealServiceTest.kt
  let cases: [string, string, string | null][] = [
    ['2 onions', 'onions', '2'],
    ['1 lb ground beef', 'ground beef', '1 lb'],
    ['2% milk', '2% milk', null],
    ['salt', 'salt', null],
    ['1/2 cup flour', 'flour', '1/2 cup'],
    ['2.5 apples', 'apples', '2.5'],
    ['3 cups chicken broth', 'chicken broth', '3 cups'],
    ['  4 oz cheddar  ', 'cheddar', '4 oz'],
    // Golden cases captured from the running Spring app
    ['2 lb ground beef', 'ground beef', '2 lb'],
    ['1 onion', 'onion', '1'],
    ['1/2 cup salsa', 'salsa', '1/2 cup'],
    ['3 cloves garlic', 'garlic', '3 cloves'],
    ['1 can beans', 'beans', '1 can'],
    ['2 Onion', 'Onion', '2'],
  ]

  for (let [raw, name, quantity] of cases) {
    it(`parses ${JSON.stringify(raw)}`, () => {
      assert.deepEqual(parseIngredient(raw), { name, quantity })
    })
  }

  it('treats a lone number as the name', () => {
    assert.deepEqual(parseIngredient('3'), { name: '3', quantity: null })
  })

  it('matches units case-insensitively but keeps their spelling', () => {
    assert.deepEqual(parseIngredient('2 LB beef'), { name: 'beef', quantity: '2 LB' })
  })

  it('does not treat a unit as a unit when nothing follows it', () => {
    assert.deepEqual(parseIngredient('2 cups'), { name: 'cups', quantity: '2' })
  })
})

describe('consolidate', () => {
  it('sums integer quantities for the same ingredient across meals', () => {
    let result = consolidate([item('onions', '2'), item('onions', '3')])
    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'onions')
    assert.equal(result[0].quantity, '5')
  })

  it('joins mixed quantities with " + "', () => {
    let result = consolidate([item('flour', '1 cup'), item('flour', '2 cups')])
    assert.equal(result[0].quantity, '1 cup + 2 cups')
  })

  it('groups by lowercased, trimmed name', () => {
    let result = consolidate([item('Onions', '2'), item(' onions ', '3')])
    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'onions')
    assert.equal(result[0].quantity, '5')
  })

  it('keeps the last non-null Kroger product mapping', () => {
    let result = consolidate([
      item('beef', '1 lb', ['upc-old', 'Old Beef']),
      item('beef', '2 lb', ['upc-new', 'New Beef']),
      item('beef', null),
    ])
    assert.equal(result[0].krogerProductId, 'upc-new')
    assert.equal(result[0].krogerProductName, 'New Beef')
  })

  it('carries a product linked in only a later meal', () => {
    let result = consolidate([item('beef', '1 lb'), item('beef', '2 lb', ['upc-1', 'Beef'])])
    assert.equal(result[0].krogerProductId, 'upc-1')
  })

  it('returns a null quantity when all quantities are null', () => {
    let result = consolidate([item('salt', null)])
    assert.equal(result[0].quantity, null)
  })

  it('ignores null quantities when others are present', () => {
    assert.equal(consolidate([item('salt', null), item('salt', '2')])[0].quantity, '2')
    assert.equal(consolidate([item('salt', '1 tsp'), item('salt', null)])[0].quantity, '1 tsp')
  })

  it('keeps distinct ingredients separate', () => {
    assert.equal(consolidate([item('garlic', '3'), item('onions', '1')]).length, 2)
  })

  it('matches the Tacos + Chili golden case from the Spring app', () => {
    let tacos = [
      item('ground beef', '2 lb'),
      item('onion', '1'),
      item('salt', null),
      item('salsa', '1/2 cup'),
      item('garlic', '3 cloves'),
    ]
    let chili = [item('ground beef', '1 lb'), item('Onion', '2'), item('beans', '1 can')]

    assert.deepEqual(
      consolidate([...tacos, ...chili]).map((i) => [i.name, i.quantity]),
      [
        ['ground beef', '2 lb + 1 lb'],
        ['onion', '3'],
        ['salt', null],
        ['salsa', '1/2 cup'],
        ['garlic', '3 cloves'],
        ['beans', '1 can'],
      ],
    )
  })
})
