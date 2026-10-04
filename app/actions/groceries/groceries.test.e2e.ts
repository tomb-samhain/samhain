import * as assert from 'remix/assert'
import { createTestServer } from 'remix/node-fetch-server/test'
import { describe, it, type TestContext } from 'remix/test'
import type { Page } from 'playwright'

import { createTestDatabase } from '../../../test/db.ts'
import { FakeKroger } from '../../../test/fake-kroger.ts'
import { Kroger } from '../../data/groceries/kroger.ts'
import { users } from '../../data/groceries/tables.ts'
import { createAppRouter } from '../../router.ts'
import { routes } from '../../routes.ts'

// Serves the real router and a fake Kroger over HTTP so the browser can follow the OAuth
// redirect to Kroger and back.
async function start(t: TestContext) {
  let db = await createTestDatabase()
  let fake = new FakeKroger()
  let kroger = await fake.listen()
  t.after(() => kroger.close())

  let router = createAppRouter({ db, sessionSecret: 'e2e-secret', kroger: { apiBase: kroger.apiBase } })
  let page = await t.serve(await createTestServer(router.fetch))
  let errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  return { db, fake, page, errors }
}

async function register(page: Page, email = 'cook@example.com', password = 'secret') {
  await page.goto(`${routes.groceries.auth.login.href()}?mode=register`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByRole('heading', { name: 'Meals' }).waitFor()
}

// Client-side navigations commit the URL without a load event.
async function waitForPath(page: Page, pathname: string) {
  await page.waitForURL((url) => url.pathname + url.search === pathname, { waitUntil: 'commit' })
}

describe('groceries end to end', () => {
  it('manages meals and ingredients', async (t) => {
    let { page, errors } = await start(t)
    await register(page)
    await page.getByText('No meals yet. Click "New" to get started.').waitFor()

    await page.getByRole('button', { name: 'New' }).click()
    await page.getByPlaceholder('Meal name').fill('Tacos')
    await page.getByPlaceholder('Meal name').press('Enter')
    await page.getByRole('heading', { name: 'Tacos', level: 2 }).waitFor()
    assert.match(new URL(page.url()).pathname, /^\/groceries\/meals\/\d+$/)

    let add = page.getByPlaceholder('Add ingredient, e.g. "2 onions"')
    for (let [raw, name] of [
      ['2 lb ground beef', 'ground beef'],
      ['salt', 'salt'],
      ['3 cloves garlic', 'garlic'],
    ]) {
      await add.fill(raw)
      await add.press('Enter')
      await page.getByText(name, { exact: true }).first().waitFor()
    }
    await page.getByText('3 ingredients').first().waitFor()
    assert.equal(await add.inputValue(), '')

    // Add a quantity to salt inline.
    await page.getByTitle('Add quantity').click()
    await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('1 tsp')
    await page.getByRole('textbox', { name: 'Quantity', exact: true }).press('Enter')
    await page.getByRole('button', { name: '1 tsp' }).waitFor()

    // Duplicate ingredient names are reported, not a server error.
    await add.fill('1 lb ground beef')
    await add.press('Enter')
    await page.getByText('"ground beef" is already in this meal.').waitFor()

    await page.getByRole('button', { name: 'Options for Tacos' }).click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    let rename = page.getByRole('dialog', { name: 'Rename meal' })
    await rename.getByRole('textbox').fill('Street Tacos')
    await rename.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('heading', { name: 'Street Tacos', level: 2 }).waitFor()

    await page.getByRole('button', { name: 'Options for Street Tacos' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog', { name: 'Delete meal' }).getByRole('button', { name: 'Delete' }).click()
    await page.getByText('No meals yet. Click "New" to get started.').waitFor()
    assert.equal(new URL(page.url()).pathname, routes.groceries.meals.index.href())
    assert.deepEqual(errors, [])
  })

  it('connects Kroger, links products, and adds a shopping list to the cart', async (t) => {
    let { db, fake, page, errors } = await start(t)
    await register(page)
    let user = (await db.findOne(users, { where: { email: 'cook@example.com' } }))!
    await new Kroger(db, { redirectUri: '' }).setCredentials(user.id, 'cid', 'csec')

    for (let [name, items] of [
      ['Tacos', ['2 lb ground beef', '1 onion', 'salt']],
      ['Chili', ['1 lb ground beef', '2 Onion']],
    ] as const) {
      await page.getByRole('button', { name: 'New' }).click()
      await page.getByPlaceholder('Meal name').fill(name)
      await page.getByRole('button', { name: 'Create' }).click()
      await page.getByRole('heading', { name, level: 2 }).waitFor()
      for (let raw of items) {
        await page.getByPlaceholder('Add ingredient, e.g. "2 onions"').fill(raw)
        await page.getByPlaceholder('Add ingredient, e.g. "2 onions"').press('Enter')
        await page.getByText(`${items.indexOf(raw as never) + 1} ingredient`, { exact: false }).first().waitFor()
      }
    }

    // Settings: pick a store and connect the Kroger account (OAuth + PKCE via the fake).
    await page.getByRole('link', { name: 'Settings' }).click()
    await page.getByLabel('ZIP code').fill('30306')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByLabel(/Kroger Midtown/).check()
    await page.getByRole('button', { name: 'Save location' }).click()
    await page.getByText('Current:').waitFor()
    await page.getByRole('button', { name: 'Connect with Kroger' }).click()
    await page.getByText('Kroger account connected successfully!').waitFor()
    await page.getByText('Connected', { exact: true }).waitFor()

    // Link beef from the Meals page.
    await page.getByRole('link', { name: 'Meals' }).click()
    await page.getByRole('link', { name: /Tacos/ }).click()
    await page.getByRole('heading', { name: 'Tacos', level: 2 }).waitFor()
    await page.getByRole('button', { name: 'Link product' }).first().click()
    await page.getByRole('button', { name: /Kroger Ground Beef\s*\$5\.99/ }).click()
    await page.getByText('Kroger Ground Beef').first().waitFor()

    // Shop both meals (listed, and so consolidated, by name), link onion across them,
    // exclude salt, add to cart.
    await page.getByRole('link', { name: 'Shop' }).click()
    await page.getByText('Chili', { exact: true }).click()
    await page.getByText('Tacos', { exact: true }).click()
    await page.getByRole('cell', { name: 'onion', exact: true }).waitFor()
    assert.match(new URL(page.url()).search, /^\?meal=\d+&meal=\d+$/)
    await page.getByRole('cell', { name: '1 lb + 2 lb' }).waitFor()
    await page.getByRole('button', { name: 'Add 1 item to Kroger Cart' }).waitFor()

    let onionRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'onion', exact: true }) })
    await onionRow.getByRole('button', { name: 'Link product' }).click()
    await page.getByRole('button', { name: /Yellow Onion/ }).click()
    await page.getByRole('button', { name: 'Add 2 items to Kroger Cart' }).waitFor()

    let saltRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'salt', exact: true }) })
    await saltRow.hover()
    await saltRow.getByTitle('Remove from cart').click()
    await page.getByText('Excluded from cart', { exact: true }).waitFor()

    await page.getByRole('button', { name: 'Add 2 items to Kroger Cart' }).click()
    await page.getByText('Items added to cart').waitFor()
    assert.deepEqual(
      fake.cart.map((item) => item.upc).sort(),
      ['0001111', '0002222'],
    )

    await page.getByRole('link', { name: 'Orders' }).click()
    await page.getByRole('heading', { name: 'Recent Orders' }).waitFor()
    await page.getByText('Chili, Tacos').waitFor()
    assert.deepEqual(errors, [])
  })

  it('sends signed-out visitors to sign in and back', async (t) => {
    let { db, page } = await start(t)
    await register(page)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.getByText('Sign in to your account').waitFor()
    assert.ok(await db.findOne(users, { where: { email: 'cook@example.com' } }))

    await page.goto(routes.groceries.orders.href())
    await page.getByText('Sign in to your account').waitFor()
    await page.getByLabel('Email').fill('cook@example.com')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.getByText('Invalid credentials').waitFor()

    await page.getByLabel('Password').fill('secret')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.getByText('No orders yet. Head to the Shop page to add meals to your cart.').waitFor()
    await waitForPath(page, routes.groceries.orders.href())
  })

  it('works at phone width', async (t) => {
    let { page, errors } = await start(t)
    await page.setViewportSize({ width: 390, height: 844 })
    await register(page)

    await page.getByRole('button', { name: 'New' }).click()
    await page.getByPlaceholder('Meal name').fill('Soup')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByRole('heading', { name: 'Soup', level: 2 }).waitFor()

    // On phones the list hides while a meal is open.
    assert.equal(await page.getByRole('heading', { name: 'Meals' }).isVisible(), false)
    await page.getByRole('link', { name: 'Back to meals' }).click()
    await page.getByRole('heading', { name: 'Meals' }).waitFor()

    assert.equal(await page.getByRole('navigation', { name: 'Main' }).isVisible(), false)
    await page.getByRole('button', { name: 'Open menu' }).click()
    let sheet = page.getByRole('dialog', { name: 'Navigation menu' })
    await sheet.getByRole('link', { name: 'Orders' }).click()
    await page.getByText('No orders yet. Head to the Shop page to add meals to your cart.').waitFor()
    assert.equal(await sheet.isVisible(), false)
    assert.deepEqual(errors, [])
  })
})
