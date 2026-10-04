import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createMealWith } from '../../../../test/db.ts'
import { connectKroger, createTestApp, signIn } from '../../../../test/router.ts'
import { getMeal, linkProductAcrossMeals } from '../../../data/groceries/meals.ts'
import { listRecentOrders } from '../../../data/groceries/orders.ts'
import { routes } from '../../../routes.ts'

const r = routes.groceries.shop

async function setup() {
  let app = await createTestApp()
  let { user, cookie } = await signIn(app)
  let tacos = await createMealWith(app.db, user.id, 'Tacos', ['2 lb ground beef', '1 onion', 'salt'])
  let chili = await createMealWith(app.db, user.id, 'Chili', ['1 lb ground beef', '2 Onion', '1 can beans'])
  return { app, user, cookie, tacos, chili }
}

function shopUrl(...ids: number[]) {
  return `${r.index.href()}?${ids.map((id) => `meal=${id}`).join('&')}`
}

describe('shop page', () => {
  it('lists meals to select with ingredient counts', async () => {
    let { app, cookie } = await setup()
    let html = await (await app.fetch(r.index.href(), { cookie })).text()
    assert.match(html, /<h1[^>]*>Shop<\/h1>/)
    assert.match(html, />Select Meals<\/h2>/)
    assert.match(html, /name="meal" value="\d+"[^>]*\/?>(<!-- -->)?<span[^>]*>Chili<\/span><span[^>]*>3<\/span>/)
    assert.match(html, /Select meals on the left to see consolidated ingredients\./)
    assert.match(html, />Update list<\/button>/)
  })

  it('shows the empty state without meals', async () => {
    let app = await createTestApp()
    let { cookie } = await signIn(app)
    assert.match(await (await app.fetch(r.index.href(), { cookie })).text(), /No meals yet\. Go to Meals to create some\./)
  })

  it('consolidates the selected meals and checks them', async () => {
    let { app, cookie, tacos, chili } = await setup()
    let html = await (await app.fetch(shopUrl(tacos, chili), { cookie })).text()

    assert.equal((html.match(/name="meal" value="\d+"[^>]* checked/g) ?? []).length, 2)
    let cells = [...html.matchAll(/<tr[^>]*><td[^>]*>([^<]+)<\/td><td[^>]*>(?:<span[^>]*>([^<]+)<\/span>)/g)].map((m) => [m[1], m[2]])
    assert.deepEqual(cells, [
      ['ground beef', '2 lb + 1 lb'],
      ['onion', '3'],
      ['salt', '—'],
      ['beans', '1 can'],
    ])
  })

  it('ignores unknown or foreign meal ids in the URL', async () => {
    let { app, cookie, tacos } = await setup()
    let other = await signIn(app, 'other@example.com')
    let secret = await createMealWith(app.db, other.user.id, 'Secret', ['1 truffle'])
    let response = await app.fetch(shopUrl(tacos, 999, secret), { cookie })
    let html = await response.text()
    assert.equal(response.status, 200)
    assert.doesNotMatch(html, /truffle/)
    assert.match(html, /ground beef/)
  })

  it('counts linked items and warns about unlinked ones and a missing Kroger connection', async () => {
    let { app, user, cookie, tacos, chili } = await setup()
    await linkProductAcrossMeals(app.db, user.id, [tacos, chili], 'ground beef', { productId: '0001111', productName: 'Kroger Ground Beef' })
    let html = await (await app.fetch(shopUrl(tacos, chili), { cookie })).text()

    assert.match(html, /Add 1 item to Kroger Cart/)
    assert.match(html, /3 ingredients without a linked product will not be added to cart\./)
    assert.match(html, /Kroger account not connected\. Go to Settings to connect\./)
    assert.match(html, /<button type="submit" disabled/)
  })

  it('enables the cart button once Kroger is connected', async () => {
    let { app, user, cookie, tacos } = await setup()
    await linkProductAcrossMeals(app.db, user.id, [tacos], 'salt', { productId: '0003333', productName: 'Salt' })
    await connectKroger(app, user.id)
    let html = await (await app.fetch(shopUrl(tacos), { cookie })).text()
    assert.doesNotMatch(html, /Kroger account not connected/)
    assert.match(html, /<button type="submit" class="[^"]*">.*Add 1 item to Kroger Cart/s)
  })
})

describe('shop link', () => {
  it('links every matching ingredient across the selected meals', async () => {
    let { app, user, cookie, tacos, chili } = await setup()
    let response = await app.post(
      r.link.href(),
      { name: 'onion', meal: [String(tacos), String(chili)], productId: '0002222', productName: 'Yellow Onion' },
      { cookie, json: true },
    )
    assert.deepEqual(await response.json(), { location: shopUrl(tacos, chili) })

    for (let id of [tacos, chili]) {
      let onion = (await getMeal(app.db, user.id, id))!.ingredients.find((i) => i.name.toLowerCase() === 'onion')
      assert.equal(onion?.kroger_product_name, 'Yellow Onion')
    }
  })

  it("refuses another user's meals", async () => {
    let { app, cookie } = await setup()
    let other = await signIn(app, 'other@example.com')
    let secret = await createMealWith(app.db, other.user.id, 'Secret', ['1 onion'])
    let response = await app.post(r.link.href(), { name: 'onion', meal: String(secret), productId: 'x', productName: 'x' }, { cookie })
    assert.equal(response.status, 404)
  })
})

describe('shop cart', () => {
  it('adds linked, non-excluded items and records an order', async () => {
    let { app, user, cookie, tacos, chili } = await setup()
    await linkProductAcrossMeals(app.db, user.id, [tacos, chili], 'ground beef', { productId: '0001111', productName: 'Beef' })
    await linkProductAcrossMeals(app.db, user.id, [tacos], 'salt', { productId: '0003333', productName: 'Salt' })
    await connectKroger(app, user.id)

    let response = await app.post(
      r.cart.href(),
      { meal: [String(tacos), String(chili)], exclude: 'salt' },
      { cookie, json: true },
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { message: 'Items added to cart' })
    assert.deepEqual(app.kroger.cart, [{ upc: '0001111', quantity: 1 }])

    let [order] = await listRecentOrders(app.db, user.id)
    assert.deepEqual(order.mealNames, ['Tacos', 'Chili'])
  })

  it('reports when nothing is linked', async () => {
    let { app, user, cookie, tacos } = await setup()
    await connectKroger(app, user.id)
    let response = await app.post(r.cart.href(), { meal: String(tacos) }, { cookie, json: true })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'No Kroger products linked to ingredients' })
    assert.deepEqual(await listRecentOrders(app.db, user.id), [])
  })

  it('reports a missing Kroger connection without recording an order', async () => {
    let { app, user, cookie, tacos } = await setup()
    await linkProductAcrossMeals(app.db, user.id, [tacos], 'salt', { productId: '0003333', productName: 'Salt' })
    let response = await app.post(r.cart.href(), { meal: String(tacos) }, { cookie, json: true })
    assert.equal(response.status, 409)
    assert.match((await response.json()).error, /not connected/)
    assert.deepEqual(await listRecentOrders(app.db, user.id), [])
  })

  it('redirects back with a flash message without JavaScript', async () => {
    let { app, user, cookie, tacos } = await setup()
    await linkProductAcrossMeals(app.db, user.id, [tacos], 'salt', { productId: '0003333', productName: 'Salt' })
    await connectKroger(app, user.id)
    let response = await app.post(r.cart.href(), { meal: String(tacos) }, { cookie })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), shopUrl(tacos))

    let next = response.headers.getSetCookie().find((c) => c.startsWith('groceries_session='))!.split(';')[0]
    assert.match(await (await app.fetch(shopUrl(tacos), { cookie: next })).text(), /Items added to cart/)
  })
})
