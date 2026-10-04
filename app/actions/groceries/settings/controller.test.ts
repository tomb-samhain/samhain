import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import {
  connectKroger,
  createTestApp,
  getResponseCookie,
  signIn,
  type TestApp,
} from '../../../../test/router.ts'
import { createCodeChallenge, Kroger } from '../../../data/groceries/kroger.ts'
import { krogerConfigs, krogerTokens } from '../../../data/groceries/tables.ts'
import { routes } from '../../../routes.ts'

const settings = routes.groceries.settings.index.href()
const k = routes.groceries.kroger

async function setup({ configured = true } = {}) {
  let app = await createTestApp()
  let { user, cookie } = await signIn(app)
  if (configured)
    await new Kroger(app.db, { redirectUri: '' }).setCredentials(user.id, 'cid', 'csec')
  return { app, user, cookie }
}

// Session cookies change as the OAuth transaction is written and cleared.
function nextCookie(response: Response, current: string) {
  return response.headers.getSetCookie().some((c) => c.startsWith('groceries_session='))
    ? getResponseCookie(response)
    : current
}

describe('settings page', () => {
  it('shows both cards with a not-connected account', async () => {
    let { app, cookie } = await setup()
    let html = await (await app.fetch(settings, { cookie })).text()
    assert.match(html, /<h1[^>]*>Settings<\/h1>/)
    assert.match(html, />Store Location<\/h3>/)
    assert.match(html, /Find and select your nearest Kroger store\./)
    assert.match(html, />Kroger Account<\/h3>/)
    assert.match(html, /Connect your Kroger account to enable adding items to your cart\./)
    assert.match(html, />Not connected<\/span>/)
    assert.match(html, /Connect with Kroger<\/button>/)
    assert.doesNotMatch(html, /Current:/)
    assert.doesNotMatch(html, /csec/)
  })

  it('shows a connected account and the success banner', async () => {
    let { app, user, cookie } = await setup()
    await connectKroger(app, user.id)
    let html = await (await app.fetch(`${settings}?auth=success`, { cookie })).text()
    assert.match(html, />Connected<\/span>/)
    assert.match(html, /Reconnect with Kroger<\/button>/)
    assert.match(html, /Kroger account connected successfully!/)
  })

  it('searches stores by ZIP and saves one', async () => {
    let { app, cookie } = await setup()
    let html = await (await app.fetch(`${settings}?zip=30306`, { cookie })).text()
    assert.match(html, /Kroger Midtown<\/span><span[^>]*>725 Ponce De Leon Ave<\/span>/)
    assert.match(html, /Save location<\/button>/)

    let saved = await app.post(
      routes.groceries.settings.location.href(),
      { zip: '30306', location: '01400376|Kroger Edgewood' },
      { cookie },
    )
    assert.equal(saved.status, 303)
    assert.equal(saved.headers.get('Location'), `${settings}?zip=30306`)

    let after = await (await app.fetch(`${settings}?zip=30306`, { cookie })).text()
    assert.match(after, /Current:<\/span><span[^>]*>Kroger Edgewood<\/span>/)
    assert.match(after, /value="01400376\|Kroger Edgewood"[^>]* checked/)
  })

  it('explains missing Kroger credentials', async () => {
    let { app, cookie } = await setup({ configured: false })
    let search = await (await app.fetch(`${settings}?zip=30306`, { cookie })).text()
    assert.match(search, /role="alert"[^>]*>Kroger not configured</)

    let save = await app.post(
      routes.groceries.settings.location.href(),
      { location: '1|A' },
      { cookie },
    )
    assert.equal(save.status, 400)
    assert.match(await save.text(), /Kroger config not set/)
  })
})

describe('Kroger account linking', () => {
  async function connect(app: TestApp, cookie: string) {
    let start = await app.post(k.connect.href(), {}, { cookie })
    assert.equal(start.status, 302)
    return { authorize: new URL(start.headers.get('Location')!), cookie: nextCookie(start, cookie) }
  }

  it('redirects to Kroger with PKCE and OAuth parameters', async () => {
    let { app, cookie } = await setup()
    let { authorize } = await connect(app, cookie)
    let params = authorize.searchParams

    assert.equal(
      authorize.origin + authorize.pathname,
      'https://kroger.test/v1/connect/oauth2/authorize',
    )
    assert.equal(params.get('client_id'), 'cid')
    assert.equal(params.get('response_type'), 'code')
    assert.equal(params.get('scope'), 'cart.basic:write profile.compact')
    assert.equal(
      params.get('redirect_uri'),
      'https://samhain.test/groceries/api/kroger/auth/callback',
    )
    assert.equal(params.get('code_challenge_method'), 'S256')
    assert.ok(params.get('state'))
    assert.ok(params.get('code_challenge'))
  })

  it('uses a unique state for each attempt', async () => {
    let { app, cookie } = await setup()
    let first = await connect(app, cookie)
    let second = await connect(app, cookie)
    assert.notEqual(
      first.authorize.searchParams.get('state'),
      second.authorize.searchParams.get('state'),
    )
  })

  it('completes the round trip and stores the user token', async () => {
    let { app, user, cookie } = await setup()
    let started = await connect(app, cookie)
    // The fake approves and bounces back to the callback with ?code&state.
    let approval = await app.kroger.handle(new Request(started.authorize))
    let callback = new URL(approval.headers.get('Location')!)
    assert.equal(callback.pathname, k.callback.href())

    let finished = await app.fetch(callback.pathname + callback.search, { cookie: started.cookie })
    assert.equal(finished.status, 303)
    assert.equal(finished.headers.get('Location'), `${settings}?auth=success`)

    let token = await app.db.find(krogerTokens, { user_id: user.id, grant_type: 'USER' })
    assert.equal(token?.refresh_token, 'refresh-1')

    // The token exchange proved possession of the PKCE verifier.
    let exchange = new URLSearchParams(app.kroger.bodies.at(-1))
    assert.equal(exchange.get('grant_type'), 'authorization_code')
    assert.equal(
      await createCodeChallenge(exchange.get('code_verifier')!),
      started.authorize.searchParams.get('code_challenge'),
    )

    let html = await (
      await app.fetch(`${settings}?auth=success`, { cookie: nextCookie(finished, started.cookie) })
    ).text()
    assert.match(html, />Connected<\/span>/)
  })

  it('rejects a callback whose state does not match the session', async () => {
    let { app, user, cookie } = await setup()
    let started = await connect(app, cookie)
    let response = await app.fetch(`${k.callback.href()}?code=good-code&state=forged`, {
      cookie: started.cookie,
    })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), settings)
    assert.equal(await app.db.find(krogerTokens, { user_id: user.id, grant_type: 'USER' }), null)

    let html = await (
      await app.fetch(settings, { cookie: nextCookie(response, started.cookie) })
    ).text()
    assert.match(html, /Could not connect your Kroger account/)
  })

  it('rejects a callback without a pending transaction', async () => {
    let { app, user, cookie } = await setup()
    let response = await app.fetch(`${k.callback.href()}?code=good-code&state=anything`, { cookie })
    assert.equal(response.headers.get('Location'), settings)
    assert.equal(await app.db.find(krogerTokens, { user_id: user.id, grant_type: 'USER' }), null)
  })

  it('explains missing credentials instead of redirecting to Kroger', async () => {
    let { app, cookie } = await setup({ configured: false })
    let response = await app.post(k.connect.href(), {}, { cookie })
    assert.equal(response.status, 303)
    let html = await (await app.fetch(settings, { cookie: nextCookie(response, cookie) })).text()
    assert.match(html, /role="alert"[^>]*>Kroger not configured</)
  })

  it('requires a signed-in user for the callback', async () => {
    let app = await createTestApp()
    let response = await app.fetch(`${k.callback.href()}?code=good-code&state=x`)
    assert.equal(response.status, 303)
    assert.match(response.headers.get('Location')!, /^\/groceries\/login\?returnTo=/)
  })
})

describe('Kroger product search', () => {
  it('returns products and whether a store is set', async () => {
    let { app, user, cookie } = await setup()
    let response = await app.fetch(`${k.products.href()}?term=beef`, { cookie })
    assert.deepEqual(await response.json(), {
      products: [
        {
          productId: '0001',
          description: 'Kroger Ground Beef',
          upc: '0001111',
          price: null,
          imageUrl: 'https://img.test/beef.jpg',
        },
      ],
      hasLocation: false,
    })

    await app.db.update(krogerConfigs, user.id, {
      location_id: '01400943',
      location_name: 'Kroger Midtown',
    })
    let withStore = await (await app.fetch(`${k.products.href()}?term=beef`, { cookie })).json()
    assert.equal(withStore.hasLocation, true)
    assert.equal(withStore.products[0].price, 5.99)
  })

  it('reports configuration errors as JSON', async () => {
    let { app, cookie } = await setup({ configured: false })
    let response = await app.fetch(`${k.products.href()}?term=beef`, { cookie })
    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), { error: 'Kroger not configured' })
  })

  it('returns 401 JSON when signed out', async () => {
    let app = await createTestApp()
    let response = await app.fetch(`${k.products.href()}?term=beef`)
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized' })
  })
})
