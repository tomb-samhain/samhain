import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createMealWith, createTestDatabase, createUser } from '../../../test/db.ts'
import {
  addIngredient,
  consolidateMeals,
  createMeal,
  deleteIngredient,
  deleteMeal,
  getMeal,
  linkIngredient,
  linkProductAcrossMeals,
  listMeals,
  renameMeal,
  updateIngredient,
} from './meals.ts'

async function setup() {
  let db = await createTestDatabase()
  let user = await createUser(db)
  let other = await createUser(db, 'other@example.com')
  return { db, user, other }
}

describe('meals data', () => {
  it('lists meals by name, case-insensitively, with ingredient counts', async () => {
    let { db, user } = await setup()
    await createMealWith(db, user.id, 'tacos', ['1 onion', 'salt'])
    await createMealWith(db, user.id, 'Chili', ['2 lb beef'])
    await createMealWith(db, user.id, 'apple pie')

    assert.deepEqual(
      (await listMeals(db, user.id)).map((m) => [m.name, m.ingredientCount]),
      [
        ['apple pie', 0],
        ['Chili', 1],
        ['tacos', 2],
      ],
    )
  })

  it('creates a meal with a trimmed name', async () => {
    let { db, user } = await setup()
    let result = await createMeal(db, user.id, '  Soup  ')
    assert.ok(result.ok)
    assert.equal((await getMeal(db, user.id, result.value.id))?.name, 'Soup')
  })

  it('rejects a blank meal name', async () => {
    let { db, user } = await setup()
    assert.deepEqual(await createMeal(db, user.id, '   '), { ok: false, error: 'Enter a name for the meal.' })
  })

  it('reports a duplicate meal name instead of failing (source returned 500)', async () => {
    let { db, user, other } = await setup()
    await createMealWith(db, user.id, 'Tacos')
    assert.deepEqual(await createMeal(db, user.id, 'Tacos'), {
      ok: false,
      error: 'You already have a meal named "Tacos".',
    })
    // Another user may use the same name.
    assert.ok((await createMeal(db, other.id, 'Tacos')).ok)
  })

  it('renames a meal and reports duplicate names', async () => {
    let { db, user } = await setup()
    let tacos = await createMealWith(db, user.id, 'Tacos')
    await createMealWith(db, user.id, 'Chili')

    assert.deepEqual(await renameMeal(db, user.id, tacos, 'Street Tacos'), { ok: true, value: undefined })
    assert.equal((await getMeal(db, user.id, tacos))?.name, 'Street Tacos')
    assert.equal((await renameMeal(db, user.id, tacos, 'Chili'))?.ok, false)
  })

  it('deletes a meal and its ingredients', async () => {
    let { db, user } = await setup()
    let tacos = await createMealWith(db, user.id, 'Tacos', ['1 onion'])
    assert.equal(await deleteMeal(db, user.id, tacos), true)
    assert.equal(await getMeal(db, user.id, tacos), null)
    assert.equal(await deleteMeal(db, user.id, tacos), false)
  })

  it('parses ingredients and keeps insertion order', async () => {
    let { db, user } = await setup()
    let tacos = await createMealWith(db, user.id, 'Tacos', ['2 lb ground beef', 'salt', '3 cloves garlic'])
    let meal = await getMeal(db, user.id, tacos)
    assert.deepEqual(
      meal?.ingredients.map((i) => [i.name, i.quantity]),
      [
        ['ground beef', '2 lb'],
        ['salt', null],
        ['garlic', '3 cloves'],
      ],
    )
  })

  it('reports a duplicate ingredient instead of failing (source returned 500)', async () => {
    let { db, user } = await setup()
    let tacos = await createMealWith(db, user.id, 'Tacos', ['1 onion'])
    assert.deepEqual(await addIngredient(db, user.id, tacos, '2 onion'), {
      ok: false,
      error: '"onion" is already in this meal.',
    })
  })

  it('updates name and quantity, and clears quantity with an empty string', async () => {
    let { db, user } = await setup()
    let tacos = await createMealWith(db, user.id, 'Tacos', ['1 onion'])
    let [onion] = (await getMeal(db, user.id, tacos))!.ingredients

    await updateIngredient(db, user.id, tacos, onion.id, { name: 'red onion', quantity: '2' })
    let [updated] = (await getMeal(db, user.id, tacos))!.ingredients
    assert.deepEqual([updated.name, updated.quantity], ['red onion', '2'])

    await updateIngredient(db, user.id, tacos, onion.id, { quantity: '' })
    let [cleared] = (await getMeal(db, user.id, tacos))!.ingredients
    assert.deepEqual([cleared.name, cleared.quantity], ['red onion', null])
  })

  it('links a product to an ingredient', async () => {
    let { db, user } = await setup()
    let tacos = await createMealWith(db, user.id, 'Tacos', ['1 onion'])
    let [onion] = (await getMeal(db, user.id, tacos))!.ingredients
    assert.ok(await linkIngredient(db, user.id, tacos, onion.id, { productId: '0002222', productName: 'Yellow Onion' }))
    let [linked] = (await getMeal(db, user.id, tacos))!.ingredients
    assert.deepEqual([linked.kroger_product_id, linked.kroger_product_name], ['0002222', 'Yellow Onion'])
  })

  it('links a product across meals by normalized name', async () => {
    let { db, user } = await setup()
    let tacos = await createMealWith(db, user.id, 'Tacos', ['1 onion', 'salt'])
    let chili = await createMealWith(db, user.id, 'Chili', ['2 Onion '])
    let soup = await createMealWith(db, user.id, 'Soup', ['1 onion'])

    assert.ok(await linkProductAcrossMeals(db, user.id, [tacos, chili], 'onion', { productId: 'u1', productName: 'Onion' }))

    let linked = async (mealId: number) =>
      (await getMeal(db, user.id, mealId))!.ingredients.map((i) => i.kroger_product_id)
    assert.deepEqual(await linked(tacos), ['u1', null])
    assert.deepEqual(await linked(chili), ['u1'])
    assert.deepEqual(await linked(soup), [null])
  })

  it('consolidates meals in the requested order', async () => {
    let { db, user } = await setup()
    let tacos = await createMealWith(db, user.id, 'Tacos', ['2 lb ground beef', '1 onion', 'salt'])
    let chili = await createMealWith(db, user.id, 'Chili', ['1 lb ground beef', '2 Onion', '1 can beans'])

    let result = await consolidateMeals(db, user.id, [chili, tacos])
    assert.deepEqual(
      result?.map((i) => [i.name, i.quantity]),
      [
        ['ground beef', '1 lb + 2 lb'],
        ['onion', '3'],
        ['beans', '1 can'],
        ['salt', null],
      ],
    )
    assert.deepEqual(await consolidateMeals(db, user.id, []), [])
  })

  describe('ownership', () => {
    it("treats another user's meal as missing everywhere", async () => {
      let { db, user, other } = await setup()
      let tacos = await createMealWith(db, user.id, 'Tacos', ['1 onion'])
      let [onion] = (await getMeal(db, user.id, tacos))!.ingredients

      assert.deepEqual(await listMeals(db, other.id), [])
      assert.equal(await getMeal(db, other.id, tacos), null)
      assert.equal(await renameMeal(db, other.id, tacos, 'Mine'), null)
      assert.equal(await deleteMeal(db, other.id, tacos), false)
      assert.equal(await addIngredient(db, other.id, tacos, 'salt'), null)
      assert.equal(await updateIngredient(db, other.id, tacos, onion.id, { quantity: '9' }), null)
      assert.equal(await deleteIngredient(db, other.id, tacos, onion.id), false)
      assert.equal(await linkIngredient(db, other.id, tacos, onion.id, { productId: 'x', productName: 'x' }), false)
      assert.equal(await linkProductAcrossMeals(db, other.id, [tacos], 'onion', { productId: 'x', productName: 'x' }), false)
      assert.equal(await consolidateMeals(db, other.id, [tacos]), null)

      let [unchanged] = (await getMeal(db, user.id, tacos))!.ingredients
      assert.deepEqual([unchanged.quantity, unchanged.kroger_product_id], ['1', null])
    })

    it('rejects an ingredient id that belongs to a different meal', async () => {
      let { db, user } = await setup()
      let tacos = await createMealWith(db, user.id, 'Tacos', ['1 onion'])
      let chili = await createMealWith(db, user.id, 'Chili')
      let [onion] = (await getMeal(db, user.id, tacos))!.ingredients
      assert.equal(await deleteIngredient(db, user.id, chili, onion.id), false)
    })

    it('fails consolidation when any meal is unknown', async () => {
      let { db, user } = await setup()
      let tacos = await createMealWith(db, user.id, 'Tacos')
      assert.equal(await consolidateMeals(db, user.id, [tacos, 999]), null)
    })
  })
})
