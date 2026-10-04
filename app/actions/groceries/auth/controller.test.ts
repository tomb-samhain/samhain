import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createUser, TEST_PASSWORD } from '../../../../test/db.ts'
import { createTestApp, getResponseCookie, signIn } from '../../../../test/router.ts'
import { routes } from '../../../routes.ts'

const login = routes.groceries.auth.login.href()
const loginAction = routes.groceries.auth.loginAction.href()
const register = routes.groceries.auth.register.href()
const logout = routes.groceries.auth.logout.href()
const meals = routes.groceries.meals.index.href()

describe('groceries sign in page', () => {
  it('renders the sign in form with the source copy', async () => {
    let app = await createTestApp()
    let response = await app.fetch(login)
    let html = await response.text()

    assert.equal(response.status, 200)
    assert.match(html, /<title>5 Minute Groceries<\/title>/)
    assert.match(html, /<h1[^>]*>5 Minute Groceries<\/h1>/)
    assert.match(html, /Sign in to your account/)
    assert.match(html, /<label for="username"[^>]*>Email<\/label>/)
    assert.match(html, /<label for="password"[^>]*>Password<\/label>/)
    assert.match(html, />Sign In<\/button>/)
    assert.match(
      html,
      /No account\? <a href="\/groceries\/login\?mode=register"[^>]*>Register<\/a>/,
    )
    assert.match(html, new RegExp(`<form method="post" action="${loginAction}"`))
  })

  it('switches to register mode with ?mode=register', async () => {
    let app = await createTestApp()
    let html = await (await app.fetch(`${login}?mode=register`)).text()
    assert.match(html, /Create a new account/)
    assert.match(html, />Register<\/button>/)
    assert.match(
      html,
      /Already have an account\? <a href="\/groceries\/login\?mode=signin"[^>]*>Sign In<\/a>/,
    )
    assert.match(html, new RegExp(`action="${register}"`))
  })

  it('carries returnTo through the mode toggle and the form', async () => {
    let app = await createTestApp()
    let html = await (await app.fetch(`${login}?returnTo=%2Fgroceries%2Fshop`)).text()
    assert.match(html, /<input type="hidden" name="returnTo" value="\/groceries\/shop"/)
    assert.match(html, /mode=register&amp;returnTo=%2Fgroceries%2Fshop/)
  })

  it('sends signed-in users on to the app', async () => {
    let app = await createTestApp()
    let { cookie } = await signIn(app)
    let response = await app.fetch(login, { cookie })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), meals)
  })
})

describe('groceries sign in', () => {
  it('signs in and redirects to the meals page', async () => {
    let app = await createTestApp()
    await createUser(app.db)
    let response = await app.post(loginAction, {
      email: 'COOK@example.com',
      password: TEST_PASSWORD,
    })

    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), meals)
    let cookie = getResponseCookie(response)
    let page = await app.fetch(meals, { cookie })
    assert.equal(page.status, 200)
    assert.match(await page.text(), /cook@example\.com/)
  })

  it('sets an httpOnly, SameSite=Lax session cookie', async () => {
    let app = await createTestApp()
    await createUser(app.db)
    let response = await app.post(loginAction, {
      email: 'cook@example.com',
      password: TEST_PASSWORD,
    })
    let setCookie = response.headers.getSetCookie().join('\n')
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /SameSite=Lax/i)
    assert.match(setCookie, /Max-Age=2592000/i)
  })

  it('rejects a wrong password with "Invalid credentials" and keeps the email', async () => {
    let app = await createTestApp()
    await createUser(app.db)
    let response = await app.post(loginAction, { email: 'cook@example.com', password: 'nope' })
    let html = await response.text()

    assert.equal(response.status, 400)
    assert.match(html, /role="alert"[^>]*>Invalid credentials</)
    assert.match(html, /value="cook@example\.com"/)
    assert.doesNotMatch(html, /value="nope"/)
    assert.equal(
      response.headers
        .getSetCookie()
        .some((c) => c.startsWith('groceries_session=') && !/Max-Age=0/.test(c)),
      false,
    )
  })

  it('rejects an unknown email the same way', async () => {
    let app = await createTestApp()
    let response = await app.post(loginAction, { email: 'missing@example.com', password: 'x' })
    assert.equal(response.status, 400)
    assert.match(await response.text(), /Invalid credentials/)
  })

  it('honors a local returnTo and ignores other origins', async () => {
    let app = await createTestApp()
    await createUser(app.db)
    let local = await app.post(loginAction, {
      email: 'cook@example.com',
      password: TEST_PASSWORD,
      returnTo: '/groceries/shop?meal=1',
    })
    assert.equal(local.headers.get('Location'), '/groceries/shop?meal=1')

    let offsite = await app.post(loginAction, {
      email: 'cook@example.com',
      password: TEST_PASSWORD,
      returnTo: '//evil.example/',
    })
    assert.equal(offsite.headers.get('Location'), meals)
  })

  it('rejects cross-site form posts', async () => {
    let app = await createTestApp()
    await createUser(app.db)
    let body = new FormData()
    body.set('email', 'cook@example.com')
    body.set('password', TEST_PASSWORD)
    let response = await app.router.fetch(
      new Request(new URL(loginAction, 'https://samhain.test'), {
        method: 'POST',
        body,
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      }),
    )
    assert.equal(response.status, 403)
  })
})

describe('groceries registration', () => {
  it('creates an account and signs in', async () => {
    let app = await createTestApp()
    let response = await app.post(register, { email: 'new@example.com', password: 'pass' })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), meals)
    let page = await app.fetch(meals, { cookie: getResponseCookie(response) })
    assert.match(await page.text(), /new@example\.com/)
  })

  for (let [email, password, message] of [
    ['bad', 'x', 'Username must be a valid email address'],
    ['cook@example.com', 'x', 'Username already taken'],
    ['new@example.com', '', 'Password is required'],
  ]) {
    it(`shows "${message}"`, async () => {
      let app = await createTestApp()
      await createUser(app.db)
      let response = await app.post(register, { email, password })
      let html = await response.text()
      assert.equal(response.status, 400)
      assert.match(html, new RegExp(`role="alert"[^>]*>${message}<`))
      assert.match(html, /Create a new account/)
    })
  }
})

describe('groceries sign out', () => {
  it('ends the session', async () => {
    let app = await createTestApp()
    let { cookie } = await signIn(app)
    let response = await app.post(logout, {}, { cookie })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), login)

    let cleared = getResponseCookie(response)
    let page = await app.fetch(meals, { cookie: cleared })
    assert.equal(page.status, 303)
  })
})
