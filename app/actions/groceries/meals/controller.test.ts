import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createMealWith } from '../../../../test/db.ts'
import { createTestApp, signIn } from '../../../../test/router.ts'
import { getMeal } from '../../../data/groceries/meals.ts'
import { routes } from '../../../routes.ts'

const r = routes.groceries.meals

async function setup() {
  let app = await createTestApp()
  let { user, cookie } = await signIn(app)
  return { app, user, cookie }
}

describe('meals page', () => {
  it('redirects signed-out visitors to sign in with returnTo', async () => {
    let app = await createTestApp()
    let response = await app.fetch(r.show.href({ mealId: 3 }))
    assert.equal(response.status, 303)
    assert.equal(
      response.headers.get('Location'),
      '/groceries/login?returnTo=%2Fgroceries%2Fmeals%2F3',
    )
  })

  it('shows the empty state', async () => {
    let { app, cookie } = await setup()
    let html = await (await app.fetch(r.index.href(), { cookie })).text()
    assert.match(html, /<h1[^>]*>Meals<\/h1>/)
    assert.match(html, /No meals yet\. Click "New" to get started\./)
    assert.match(html, /Select a meal to manage its ingredients/)
    assert.match(html, /aria-current="page"[^>]*>.*Meals<\/a>/s)
  })

  it('lists meals by name with singular and plural ingredient counts', async () => {
    let { app, user, cookie } = await setup()
    await createMealWith(app.db, user.id, 'Tacos', [
      '2 lb ground beef',
      '1 onion',
      'salt',
      '1/2 cup salsa',
    ])
    await createMealWith(app.db, user.id, 'Chili', ['2 Onion'])
    await createMealWith(app.db, user.id, 'apple pie')
    let html = await (await app.fetch(r.index.href(), { cookie })).text()

    let names = [
      ...html.matchAll(/href="\/groceries\/meals\/\d+"[^>]*><p[^>]*>([^<]+)<\/p><p[^>]*>([^<]+)</g),
    ].map((m) => [m[1], m[2]])
    assert.deepEqual(names, [
      ['apple pie', '0 ingredients'],
      ['Chili', '1 ingredient'],
      ['Tacos', '4 ingredients'],
    ])
  })

  it("shows the selected meal's ingredients and marks it current", async () => {
    let { app, user, cookie } = await setup()
    let tacos = await createMealWith(app.db, user.id, 'Tacos', ['2 lb ground beef', 'salt'])
    let response = await app.fetch(r.show.href({ mealId: tacos }), { cookie })
    let html = await response.text()

    assert.equal(response.status, 200)
    assert.match(html, /<title>Tacos · 5 Minute Groceries<\/title>/)
    assert.match(html, /<h2[^>]*>Tacos<\/h2><p[^>]*>2 ingredients<\/p>/)
    assert.match(html, /href="\/groceries\/meals\/\d+" aria-current="page"/)
    assert.match(html, />2 lb<\/button>/)
    assert.match(html, />ground beef<\/span>/)
    assert.match(html, /title="Add quantity"[^>]*>\+ qty<\/button>/)
    assert.match(html, /Back to meals/)
    assert.match(html, /placeholder="Add ingredient, e\.g\. &quot;2 onions&quot;"/)
  })

  it('shows "No ingredients yet." for an empty meal', async () => {
    let { app, user, cookie } = await setup()
    let soup = await createMealWith(app.db, user.id, 'Soup')
    assert.match(
      await (await app.fetch(r.show.href({ mealId: soup }), { cookie })).text(),
      /No ingredients yet\./,
    )
  })

  it("returns 404 for a missing meal and for another user's meal", async () => {
    let { app, cookie } = await setup()
    let other = await signIn(app, 'other@example.com')
    let secret = await createMealWith(app.db, other.user.id, 'Secret', ['1 truffle'])

    let missing = await app.fetch(r.show.href({ mealId: 999 }), { cookie })
    assert.equal(missing.status, 404)
    assert.match(await missing.text(), /Meal not found\./)

    let foreign = await app.fetch(r.show.href({ mealId: secret }), { cookie })
    assert.equal(foreign.status, 404)
    assert.doesNotMatch(await foreign.text(), /truffle/)
  })
})

describe('meal mutations', () => {
  it('creates a meal and redirects to it', async () => {
    let { app, user, cookie } = await setup()
    let response = await app.post(r.create.href(), { name: ' Soup ' }, { cookie })
    assert.equal(response.status, 303)
    let location = response.headers.get('Location')!
    assert.match(location, /^\/groceries\/meals\/\d+$/)
    let id = Number(location.split('/').pop())
    assert.equal((await getMeal(app.db, user.id, id))?.name, 'Soup')
  })

  it('answers JSON requests with the destination', async () => {
    let { app, cookie } = await setup()
    let response = await app.post(r.create.href(), { name: 'Soup' }, { cookie, json: true })
    assert.equal(response.status, 200)
    assert.match((await response.json()).location, /^\/groceries\/meals\/\d+$/)
  })

  it('reports a duplicate name inline (JSON) or on the page', async () => {
    let { app, user, cookie } = await setup()
    await createMealWith(app.db, user.id, 'Tacos')

    let json = await app.post(r.create.href(), { name: 'Tacos' }, { cookie, json: true })
    assert.equal(json.status, 400)
    assert.deepEqual(await json.json(), { error: 'You already have a meal named "Tacos".' })

    let page = await app.post(r.create.href(), { name: 'Tacos' }, { cookie })
    assert.equal(page.status, 400)
    assert.match(await page.text(), /role="alert"[^>]*>You already have a meal named "Tacos"\.</)
  })

  it('renames a meal and returns to the page the user was on', async () => {
    let { app, user, cookie } = await setup()
    let tacos = await createMealWith(app.db, user.id, 'Tacos')
    let response = await app.post(
      r.rename.href({ mealId: tacos }),
      { name: 'Street Tacos', returnTo: '/groceries' },
      { cookie },
    )
    assert.equal(response.headers.get('Location'), '/groceries')
    assert.equal((await getMeal(app.db, user.id, tacos))?.name, 'Street Tacos')
  })

  it('deletes a meal and leaves its page', async () => {
    let { app, user, cookie } = await setup()
    let tacos = await createMealWith(app.db, user.id, 'Tacos')
    let chili = await createMealWith(app.db, user.id, 'Chili')

    let fromOther = await app.post(
      r.destroy.href({ mealId: tacos }),
      { returnTo: r.show.href({ mealId: chili }) },
      { cookie },
    )
    assert.equal(fromOther.headers.get('Location'), r.show.href({ mealId: chili }))

    let fromSelf = await app.post(
      r.destroy.href({ mealId: chili }),
      { returnTo: r.show.href({ mealId: chili }) },
      { cookie },
    )
    assert.equal(fromSelf.headers.get('Location'), r.index.href())
    assert.equal(await getMeal(app.db, user.id, chili), null)
  })

  it('parses and adds an ingredient', async () => {
    let { app, user, cookie } = await setup()
    let tacos = await createMealWith(app.db, user.id, 'Tacos')
    let response = await app.post(
      r.addIngredient.href({ mealId: tacos }),
      { raw: '3 cloves garlic' },
      { cookie },
    )
    assert.equal(response.headers.get('Location'), r.show.href({ mealId: tacos }))
    let [garlic] = (await getMeal(app.db, user.id, tacos))!.ingredients
    assert.deepEqual([garlic.name, garlic.quantity], ['garlic', '3 cloves'])
  })

  it('updates, clears, links, and deletes an ingredient', async () => {
    let { app, user, cookie } = await setup()
    let tacos = await createMealWith(app.db, user.id, 'Tacos', ['1 onion'])
    let [onion] = (await getMeal(app.db, user.id, tacos))!.ingredients
    let params = { mealId: tacos, ingredientId: onion.id }

    await app.post(
      r.updateIngredient.href(params),
      { name: 'red onion', quantity: '2' },
      { cookie },
    )
    await app.post(r.updateIngredient.href(params), { quantity: '' }, { cookie })
    await app.post(
      r.linkIngredient.href(params),
      { productId: '0002222', productName: 'Yellow Onion' },
      { cookie },
    )
    let [updated] = (await getMeal(app.db, user.id, tacos))!.ingredients
    assert.deepEqual(
      [updated.name, updated.quantity, updated.kroger_product_id, updated.kroger_product_name],
      ['red onion', null, '0002222', 'Yellow Onion'],
    )

    let html = await (await app.fetch(r.show.href({ mealId: tacos }), { cookie })).text()
    assert.match(html, /Yellow Onion/)

    let deleted = await app.post(r.deleteIngredient.href(params), {}, { cookie })
    assert.equal(deleted.status, 303)
    assert.deepEqual((await getMeal(app.db, user.id, tacos))!.ingredients, [])
  })

  it("cannot touch another user's meals", async () => {
    let { app, cookie } = await setup()
    let other = await signIn(app, 'other@example.com')
    let secret = await createMealWith(app.db, other.user.id, 'Secret', ['1 truffle'])
    let [truffle] = (await getMeal(app.db, other.user.id, secret))!.ingredients
    let params = { mealId: secret, ingredientId: truffle.id }

    let attempts = [
      app.post(r.rename.href({ mealId: secret }), { name: 'Mine' }, { cookie }),
      app.post(r.destroy.href({ mealId: secret }), {}, { cookie }),
      app.post(r.addIngredient.href({ mealId: secret }), { raw: 'salt' }, { cookie }),
      app.post(r.updateIngredient.href(params), { quantity: '9' }, { cookie }),
      app.post(r.deleteIngredient.href(params), {}, { cookie }),
      app.post(r.linkIngredient.href(params), { productId: 'x', productName: 'x' }, { cookie }),
    ]
    for (let response of await Promise.all(attempts)) assert.equal(response.status, 404)

    let meal = await getMeal(app.db, other.user.id, secret)
    assert.equal(meal?.name, 'Secret')
    assert.deepEqual(
      meal?.ingredients.map((i) => [i.quantity, i.kroger_product_id]),
      [['1', null]],
    )
  })

  it('returns JSON 401 to signed-out client entries', async () => {
    let app = await createTestApp()
    let response = await app.post(r.create.href(), { name: 'Soup' }, { json: true })
    assert.equal(response.status, 401)
  })
})
