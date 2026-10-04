import { createOAuthProvider, type OAuthProvider, type OAuthTokens } from 'remix/auth'
import type { Database } from 'remix/data-table'

import { krogerConfigs, krogerTokens, type KrogerConfig, type KrogerToken } from './tables.ts'

// Ported from KrogerAuthService and KrogerApiService in the Spring app.

export const DEFAULT_KROGER_API_BASE = 'https://api.kroger.com/v1'
const CLIENT_SCOPE = 'product.compact'
const CART_SCOPE = 'cart.basic:write profile.compact'
// Tokens expiring within this window are treated as already expired.
const EXPIRY_MARGIN_MS = 60_000

export class KrogerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KrogerError'
  }
}

export interface KrogerProduct {
  productId: string
  description: string
  upc: string
  price: number | null
  imageUrl: string | null
}

export interface KrogerLocation {
  locationId: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
}

export interface KrogerStatus {
  clientId: string
  locationId: string | null
  locationName: string | null
  hasToken: boolean
}

export interface KrogerOptions {
  apiBase?: string
  fetch?: typeof globalThis.fetch
  redirectUri: string
  now?: () => number
}

export type KrogerProvider = OAuthProvider<{ userId: number }, 'kroger'>

export class Kroger {
  #db: Database
  #apiBase: string
  #fetch: typeof globalThis.fetch
  #now: () => number
  readonly redirectUri: string

  constructor(db: Database, options: KrogerOptions) {
    this.#db = db
    this.#apiBase = (options.apiBase ?? DEFAULT_KROGER_API_BASE).replace(/\/$/, '')
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#now = options.now ?? Date.now
    this.redirectUri = options.redirectUri
  }

  getConfig(userId: number): Promise<KrogerConfig | null> {
    return this.#db.find(krogerConfigs, userId)
  }

  async getStatus(userId: number): Promise<KrogerStatus> {
    let config = await this.getConfig(userId)
    return {
      clientId: config?.client_id ?? '',
      locationId: config?.location_id ?? null,
      locationName: config?.location_name ?? null,
      hasToken: await this.hasUserToken(userId),
    }
  }

  // A stale access token is refreshed now so an expired Kroger session shows up as
  // "Not connected" instead of failing later at checkout.
  async hasUserToken(userId: number): Promise<boolean> {
    let token = await this.#findToken(userId, 'USER')
    if (!token) return false
    if (this.#isFresh(token)) return true
    try {
      await this.getValidUserToken(userId)
      return true
    } catch {
      return false
    }
  }

  async updateLocation(userId: number, locationId: string, locationName: string | null) {
    let config = await this.getConfig(userId)
    if (!config) throw new KrogerError('Kroger config not set')
    await this.#db.update(krogerConfigs, userId, {
      location_id: locationId,
      location_name: locationName,
    })
  }

  async setCredentials(userId: number, clientId: string, clientSecret: string) {
    let existing = await this.getConfig(userId)
    if (existing) {
      await this.#db.update(krogerConfigs, userId, {
        client_id: clientId,
        client_secret: clientSecret,
      })
    } else {
      await this.#db.create(krogerConfigs, {
        user_id: userId,
        client_id: clientId,
        client_secret: clientSecret,
      })
    }
  }

  async searchProducts(userId: number, term: string): Promise<KrogerProduct[]> {
    let config = await this.getConfig(userId)
    let token = await this.getValidClientToken(userId)
    let url = new URL(`${this.#apiBase}/products`)
    url.searchParams.set('filter.term', term)
    if (config?.location_id) url.searchParams.set('filter.locationId', config.location_id)
    url.searchParams.set('filter.limit', '10')

    let body = await this.#getJson<{ data?: KrogerProductData[] }>(url, token)
    return (body.data ?? []).map((product) => {
      let item = product.items?.[0]
      return {
        productId: product.productId,
        description: product.description,
        upc: item?.upc ?? product.productId,
        price: item?.price?.regular ?? null,
        imageUrl:
          product.images
            ?.find((image) => image.perspective === 'front')
            ?.sizes?.find((size) => size.size === 'thumbnail')?.url ?? null,
      }
    })
  }

  async searchLocations(userId: number, zipCode: string): Promise<KrogerLocation[]> {
    let token = await this.getValidClientToken(userId)
    let url = new URL(`${this.#apiBase}/locations`)
    url.searchParams.set('filter.zipCode.near', zipCode)
    url.searchParams.set('filter.limit', '10')

    let body = await this.#getJson<{ data?: KrogerLocationData[] }>(url, token)
    return (body.data ?? []).map((location) => ({
      locationId: location.locationId,
      name: location.name,
      address: location.address?.addressLine1 ?? null,
      city: location.address?.city ?? null,
      state: location.address?.state ?? null,
      zipCode: location.address?.zipCode ?? null,
    }))
  }

  async addToCart(userId: number, items: { upc: string; quantity: number }[]): Promise<string> {
    let token = await this.getValidUserToken(userId)
    let response = await this.#fetch(`${this.#apiBase}/cart/add`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    if (!response.ok) throw new KrogerError(`Kroger cart request failed (${response.status})`)
    return 'Items added to cart'
  }

  async getValidClientToken(userId: number): Promise<string> {
    let config = await this.getConfig(userId)
    if (!config) throw new KrogerError('Kroger not configured')

    let existing = await this.#findToken(userId, 'CLIENT')
    if (existing && this.#isFresh(existing)) return existing.access_token

    let tokens = await this.#requestToken(config, {
      grant_type: 'client_credentials',
      scope: CLIENT_SCOPE,
    })
    await this.#saveToken(userId, 'CLIENT', tokens)
    return tokens.accessToken
  }

  async getValidUserToken(userId: number): Promise<string> {
    let token = await this.#findToken(userId, 'USER')
    if (!token) throw new KrogerError('Kroger account not connected. Go to Settings to connect.')
    if (this.#isFresh(token)) return token.access_token

    if (!token.refresh_token)
      throw new KrogerError('User token expired and no refresh token available')
    let config = await this.getConfig(userId)
    if (!config) throw new KrogerError('Kroger not configured')

    let refreshed: OAuthTokens
    try {
      refreshed = await this.#requestToken(config, {
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
      })
    } catch (error) {
      if (error instanceof KrogerClientError) {
        await this.#db.delete(krogerTokens, { user_id: userId, grant_type: 'USER' })
        throw new KrogerError('Kroger session expired — please reconnect in Settings')
      }
      throw error
    }
    await this.#saveToken(userId, 'USER', {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? token.refresh_token,
    })
    return refreshed.accessToken
  }

  saveUserTokens(userId: number, tokens: OAuthTokens) {
    return this.#saveToken(userId, 'USER', tokens)
  }

  // Credentials are per user, so the provider is built per request from the user's config.
  createOAuthProvider(userId: number, config: KrogerConfig): KrogerProvider {
    return createOAuthProvider<{ userId: number }, 'kroger'>('kroger', {
      createAuthorizationURL: async (transaction) => {
        let url = new URL(`${this.#apiBase}/connect/oauth2/authorize`)
        url.searchParams.set('client_id', config.client_id)
        url.searchParams.set('redirect_uri', this.redirectUri)
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('scope', CART_SCOPE)
        url.searchParams.set('state', transaction.state)
        url.searchParams.set('code_challenge', await createCodeChallenge(transaction.codeVerifier))
        url.searchParams.set('code_challenge_method', 'S256')
        return url
      },
      handleCallback: async (context, transaction) => {
        let code = context.url.searchParams.get('code')
        if (!code) {
          let reason =
            context.url.searchParams.get('error_description') ??
            context.url.searchParams.get('error')
          throw new KrogerError(
            reason ? `Kroger authorization failed: ${reason}` : 'Missing authorization code',
          )
        }
        let tokens = await this.#requestToken(config, {
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
          code_verifier: transaction.codeVerifier,
        })
        return {
          provider: 'kroger',
          account: { provider: 'kroger', providerAccountId: String(userId) },
          profile: { userId },
          tokens,
        }
      },
    })
  }

  #isFresh(token: KrogerToken) {
    return Date.parse(token.expires_at) > this.#now() + EXPIRY_MARGIN_MS
  }

  #findToken(userId: number, grantType: 'CLIENT' | 'USER') {
    return this.#db.find(krogerTokens, { user_id: userId, grant_type: grantType })
  }

  async #saveToken(userId: number, grantType: 'CLIENT' | 'USER', tokens: OAuthTokens) {
    let values = {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? null,
      expires_at: (tokens.expiresAt ?? new Date(this.#now())).toISOString(),
    }
    await this.#db.transaction(async (tx) => {
      await tx.delete(krogerTokens, { user_id: userId, grant_type: grantType })
      await tx.create(krogerTokens, { user_id: userId, grant_type: grantType, ...values })
    })
  }

  async #requestToken(config: KrogerConfig, params: Record<string, string>): Promise<OAuthTokens> {
    let credentials = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64')
    let response = await this.#fetch(`${this.#apiBase}/connect/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
    })
    if (response.status >= 400 && response.status < 500) {
      throw new KrogerClientError(`Kroger token request failed (${response.status})`)
    }
    if (!response.ok) throw new KrogerError(`Kroger token request failed (${response.status})`)

    let body = (await response.json()) as TokenResponse
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? undefined,
      tokenType: body.token_type,
      expiresAt: new Date(this.#now() + body.expires_in * 1000),
    }
  }

  async #getJson<T>(url: URL, token: string): Promise<T> {
    let response = await this.#fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new KrogerError(`Kroger request failed (${response.status})`)
    return (await response.json()) as T
  }
}

// A 4xx from the token endpoint: the refresh token or code was rejected.
class KrogerClientError extends KrogerError {}

export async function createCodeChallenge(codeVerifier: string) {
  let digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  return Buffer.from(digest).toString('base64url')
}

interface TokenResponse {
  access_token: string
  refresh_token?: string | null
  expires_in: number
  token_type?: string
}

interface KrogerProductData {
  productId: string
  description: string
  items?: { upc?: string | null; price?: { regular?: number | null } | null }[] | null
  images?: { perspective: string; sizes?: { size: string; url: string }[] | null }[] | null
}

interface KrogerLocationData {
  locationId: string
  name: string
  address?: {
    addressLine1?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
  } | null
}
