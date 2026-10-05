import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createMealWith } from '../../../test/db.ts'
import { createTestApp, signIn } from '../../../test/router.ts'
import { formatUtc } from './orders/public/local-time.tsx'
import { createOrder } from '../../data/groceries/orders.ts'
import { routes } from '../../routes.ts'

const orders = routes.groceries.orders.href()

describe('orders page', () => {
  it('shows the empty state', async () => {
    let app = await createTestApp()
    let { cookie } = await signIn(app)
    let html = await (await app.fetch(orders, { cookie })).text()
    assert.match(html, /No orders yet\. Head to the Shop page to add meals to your cart\./)
    assert.doesNotMatch(html, /Recent Orders/)
  })

  it('lists the five newest orders with meal names', async () => {
    let app = await createTestApp()
    let { user, cookie } = await signIn(app)
    let tacos = await createMealWith(app.db, user.id, 'Tacos')
    let chili = await createMealWith(app.db, user.id, 'Chili')
    await createOrder(app.db, user.id, [])
    for (let i = 0; i < 5; i++) await createOrder(app.db, user.id, [tacos, chili])

    let html = await (await app.fetch(orders, { cookie })).text()
    assert.match(html, /<h1[^>]*>Recent Orders<\/h1>/)
    assert.equal((html.match(/Tacos, Chili/g) ?? []).length, 5)
    assert.doesNotMatch(html, /No meals recorded/)
  })

  it('marks orders without meals and renders a machine-readable time', async () => {
    let app = await createTestApp()
    let { user, cookie } = await signIn(app)
    let order = await createOrder(app.db, user.id, [])
    let html = await (await app.fetch(orders, { cookie })).text()
    assert.match(html, /No meals recorded/)
    assert.match(
      html,
      new RegExp(`<time datetime="${order.createdAt}"[^>]*>${formatUtc(order.createdAt)}</time>`),
    )
  })

  it("does not show another user's orders", async () => {
    let app = await createTestApp()
    let { cookie } = await signIn(app)
    let other = await signIn(app, 'other@example.com')
    let secret = await createMealWith(app.db, other.user.id, 'Secret')
    await createOrder(app.db, other.user.id, [secret])
    assert.doesNotMatch(await (await app.fetch(orders, { cookie })).text(), /Secret/)
  })
})

describe('groceries access control', () => {
  let pages = [
    routes.groceries.meals.index.href(),
    routes.groceries.shop.index.href(),
    routes.groceries.orders.href(),
    routes.groceries.settings.index.href(),
  ]

  for (let page of pages) {
    it(`redirects ${page} to sign in when signed out`, async () => {
      let app = await createTestApp()
      let response = await app.fetch(page)
      assert.equal(response.status, 303)
      assert.equal(
        response.headers.get('Location'),
        `/groceries/login?returnTo=${encodeURIComponent(page)}`,
      )
    })
  }

  it('highlights the current section in the nav', async () => {
    let app = await createTestApp()
    let { cookie } = await signIn(app)
    for (let [page, label] of [
      [routes.groceries.shop.index.href(), 'Shop'],
      [routes.groceries.orders.href(), 'Orders'],
      [routes.groceries.settings.index.href(), 'Settings'],
    ]) {
      let html = await (await app.fetch(page, { cookie })).text()
      let current = [
        ...html.matchAll(/<a href="[^"]+" aria-current="page"[^>]*>.*?<\/svg>([^<]+)<\/a>/g),
      ].map((m) => m[1])
      assert.ok(
        current.length > 0 && current.every((text) => text === label),
        `${page}: ${current}`,
      )
    }
  })

  it("redirects the Spring app's trailing-slash URLs", async () => {
    let app = await createTestApp()
    for (let [from, to] of [
      ['/groceries/', '/groceries'],
      ['/groceries/settings/?auth=success', '/groceries/settings?auth=success'],
    ]) {
      let response = await app.fetch(from)
      assert.equal(response.status, 308)
      assert.equal(response.headers.get('Location'), to)
    }
  })

  it('uses the October Rust theme like the rest of the site', async () => {
    let app = await createTestApp()
    let html = await (await app.fetch(routes.groceries.auth.login.href())).text()
    assert.match(html, /<body class="groceries rmxc-[^"]+">/)
    assert.match(html, /<meta name="color-scheme" content="dark"/)
    assert.match(html, /fonts\.googleapis\.com\/css2\?family=Syncopate/)
    assert.match(html, /href="\/groceries\/theme\.css"/)
  })
})
