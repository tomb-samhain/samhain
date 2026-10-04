import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createTestDatabase, createUser } from '../../../test/db.ts'
import { FakeKroger } from '../../../test/fake-kroger.ts'
import { createCodeChallenge, Kroger, KrogerError } from './kroger.ts'
import { krogerTokens } from './tables.ts'

const NOW = Date.parse('2026-10-04T12:00:00Z')

async function setup({ configured = true } = {}) {
  let db = await createTestDatabase()
  let user = await createUser(db)
  let fake = new FakeKroger()
  let kroger = new Kroger(db, {
    apiBase: 'https://kroger.test/v1',
    fetch: fake.fetch,
    redirectUri: 'https://app.test/groceries/api/kroger/auth/callback',
    now: () => NOW,
  })
  if (configured) await kroger.setCredentials(user.id, 'cid', 'csec')
  return { db, user, fake, kroger }
}

function inSeconds(seconds: number) {
  return new Date(NOW + seconds * 1000).toISOString()
}

describe('Kroger client token', () => {
  it('returns a cached token when not yet expired', async () => {
    let { db, user, fake, kroger } = await setup()
    await db.create(krogerTokens, {
      user_id: user.id,
      grant_type: 'CLIENT',
      access_token: 'cached-token',
      expires_at: inSeconds(300),
    })
    assert.equal(await kroger.getValidClientToken(user.id), 'cached-token')
    assert.equal(fake.requests.length, 0)
  })

  it('fails with "Kroger not configured" without credentials', async () => {
    let { user, kroger } = await setup({ configured: false })
    await assert.rejects(
      kroger.getValidClientToken(user.id),
      new KrogerError('Kroger not configured'),
    )
  })

  it('treats a token expiring within 60s as expired and fetches a new one', async () => {
    let { db, user, fake, kroger } = await setup()
    await db.create(krogerTokens, {
      user_id: user.id,
      grant_type: 'CLIENT',
      access_token: 'stale-token',
      expires_at: inSeconds(30),
    })

    let token = await kroger.getValidClientToken(user.id)
    assert.equal(token, 'client_credentials-access-1')

    let [request] = fake.requestsTo('/connect/oauth2/token')
    assert.equal(
      request.headers.get('Authorization'),
      `Basic ${Buffer.from('cid:csec').toString('base64')}`,
    )
    assert.equal(fake.bodies[0], 'grant_type=client_credentials&scope=product.compact')

    let saved = await db.find(krogerTokens, { user_id: user.id, grant_type: 'CLIENT' })
    assert.deepEqual([saved?.access_token, saved?.expires_at], [token, inSeconds(1800)])
  })
})

describe('Kroger user token', () => {
  it('returns a cached user token when not yet expired', async () => {
    let { db, user, kroger } = await setup()
    await db.create(krogerTokens, {
      user_id: user.id,
      grant_type: 'USER',
      access_token: 'user-token',
      expires_at: inSeconds(600),
    })
    assert.equal(await kroger.getValidUserToken(user.id), 'user-token')
  })

  it('fails when no user token is stored', async () => {
    let { user, kroger } = await setup()
    await assert.rejects(kroger.getValidUserToken(user.id), /not connected/)
  })

  it('fails when expired with no refresh token', async () => {
    let { db, user, kroger } = await setup()
    await db.create(krogerTokens, {
      user_id: user.id,
      grant_type: 'USER',
      access_token: 'old',
      expires_at: inSeconds(-60),
    })
    await assert.rejects(kroger.getValidUserToken(user.id), /refresh token/)
  })

  it('refreshes an expired token and keeps the refresh token', async () => {
    let { db, user, fake, kroger } = await setup()
    await db.create(krogerTokens, {
      user_id: user.id,
      grant_type: 'USER',
      access_token: 'old',
      refresh_token: 'r-1',
      expires_at: inSeconds(-60),
    })

    assert.equal(await kroger.getValidUserToken(user.id), 'refresh_token-access-1')
    assert.equal(fake.bodies[0], 'grant_type=refresh_token&refresh_token=r-1')
    let saved = await db.find(krogerTokens, { user_id: user.id, grant_type: 'USER' })
    assert.equal(saved?.refresh_token, 'refresh-1')
  })

  it('deletes the token when Kroger rejects the refresh', async () => {
    let { db, user, fake, kroger } = await setup()
    fake.refreshStatus = 400
    await db.create(krogerTokens, {
      user_id: user.id,
      grant_type: 'USER',
      access_token: 'old',
      refresh_token: 'revoked',
      expires_at: inSeconds(-60),
    })

    await assert.rejects(
      kroger.getValidUserToken(user.id),
      /Kroger session expired — please reconnect in Settings/,
    )
    assert.equal(await db.find(krogerTokens, { user_id: user.id, grant_type: 'USER' }), null)
  })

  it('reports hasToken by proactively refreshing a stale token', async () => {
    let { db, user, fake, kroger } = await setup()
    assert.equal(await kroger.hasUserToken(user.id), false)

    await db.create(krogerTokens, {
      user_id: user.id,
      grant_type: 'USER',
      access_token: 'old',
      refresh_token: 'r-1',
      expires_at: inSeconds(-60),
    })
    assert.equal(await kroger.hasUserToken(user.id), true)

    await db.update(
      krogerTokens,
      { user_id: user.id, grant_type: 'USER' },
      { expires_at: inSeconds(-60) },
    )
    fake.refreshStatus = 401
    assert.equal(await kroger.hasUserToken(user.id), false)
  })
})

describe('Kroger API', () => {
  it('maps product search results and passes the saved store', async () => {
    let { user, fake, kroger } = await setup()
    await kroger.updateLocation(user.id, '01400943', 'Kroger Midtown')

    let products = await kroger.searchProducts(user.id, 'beef')
    assert.deepEqual(products, [
      {
        productId: '0001',
        description: 'Kroger Ground Beef',
        upc: '0001111',
        price: 5.99,
        imageUrl: 'https://img.test/beef.jpg',
      },
    ])
    let url = new URL(fake.requestsTo('/products')[0].url)
    assert.equal(url.searchParams.get('filter.term'), 'beef')
    assert.equal(url.searchParams.get('filter.locationId'), '01400943')
    assert.equal(url.searchParams.get('filter.limit'), '10')
  })

  it('falls back to productId when an item has no UPC, and omits price without a store', async () => {
    let { user, fake, kroger } = await setup()
    fake.products = [{ productId: 'p-9', description: 'Mystery Onion' }]
    assert.deepEqual(await kroger.searchProducts(user.id, 'onion'), [
      { productId: 'p-9', description: 'Mystery Onion', upc: 'p-9', price: null, imageUrl: null },
    ])
  })

  it('maps location search results', async () => {
    let { user, fake, kroger } = await setup()
    let [first] = await kroger.searchLocations(user.id, '30306')
    assert.deepEqual(first, {
      locationId: '01400943',
      name: 'Kroger Midtown',
      address: '725 Ponce De Leon Ave',
      city: 'Atlanta',
      state: 'GA',
      zipCode: '30306',
    })
    assert.equal(
      new URL(fake.requestsTo('/locations')[0].url).searchParams.get('filter.zipCode.near'),
      '30306',
    )
  })

  it('adds items to the cart with the user token', async () => {
    let { db, user, fake, kroger } = await setup()
    await db.create(krogerTokens, {
      user_id: user.id,
      grant_type: 'USER',
      access_token: 'user-token',
      expires_at: inSeconds(600),
    })

    assert.equal(
      await kroger.addToCart(user.id, [{ upc: '0001111', quantity: 1 }]),
      'Items added to cart',
    )
    assert.equal(fake.requestsTo('/cart/add')[0].headers.get('Authorization'), 'Bearer user-token')
    assert.deepEqual(fake.cart, [{ upc: '0001111', quantity: 1 }])
  })

  it('refuses to save a location without a config row', async () => {
    let { user, kroger } = await setup({ configured: false })
    await assert.rejects(kroger.updateLocation(user.id, 'x', 'y'), /Kroger config not set/)
  })

  it('reports status without exposing the secret', async () => {
    let { user, kroger } = await setup()
    assert.deepEqual(await kroger.getStatus(user.id), {
      clientId: 'cid',
      locationId: null,
      locationName: null,
      hasToken: false,
    })
  })
})

describe('createCodeChallenge', () => {
  it('matches the RFC 7636 example', async () => {
    assert.equal(
      await createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})
