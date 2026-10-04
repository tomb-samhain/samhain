import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequestListener } from 'remix/node-fetch-server'

export interface FakeProduct {
  productId: string
  description: string
  upc?: string
  price?: number
  imageUrl?: string
}

export interface FakeLocation {
  locationId: string
  name: string
  addressLine1?: string
  city?: string
  state?: string
  zipCode?: string
}

// An in-memory stand-in for the Kroger API. Tests never call the real service.
export class FakeKroger {
  requests: Request[] = []
  bodies: string[] = []
  products: FakeProduct[] = [
    {
      productId: '0001',
      description: 'Kroger Ground Beef',
      upc: '0001111',
      price: 5.99,
      imageUrl: 'https://img.test/beef.jpg',
    },
    { productId: '0002', description: 'Yellow Onion', upc: '0002222', price: 0.89 },
  ]
  locations: FakeLocation[] = [
    {
      locationId: '01400943',
      name: 'Kroger Midtown',
      addressLine1: '725 Ponce De Leon Ave',
      city: 'Atlanta',
      state: 'GA',
      zipCode: '30306',
    },
    {
      locationId: '01400376',
      name: 'Kroger Edgewood',
      addressLine1: '1225 Caroline St',
      city: 'Atlanta',
      state: 'GA',
      zipCode: '30307',
    },
  ]
  cart: { upc: string; quantity: number }[] = []
  tokenCounter = 0
  expiresIn = 1800
  // Status to return for refresh_token grants (e.g. 400 to simulate a revoked session).
  refreshStatus = 200
  productStatus = 200
  cartStatus = 200

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return this.handle(new Request(input, init))
  }

  handle = async (request: Request): Promise<Response> => {
    let body = request.method === 'GET' ? '' : await request.clone().text()
    this.requests.push(request)
    this.bodies.push(body)
    let url = new URL(request.url)
    let path = url.pathname.replace(/^\/v1/, '')

    if (path === '/connect/oauth2/token' && request.method === 'POST') {
      let params = new URLSearchParams(body)
      let grant = params.get('grant_type')
      if (grant === 'refresh_token' && this.refreshStatus !== 200) {
        return Response.json({ error: 'invalid_grant' }, { status: this.refreshStatus })
      }
      if (grant === 'authorization_code' && params.get('code') !== 'good-code') {
        return Response.json({ error: 'invalid_grant' }, { status: 400 })
      }
      let n = ++this.tokenCounter
      return Response.json({
        access_token: `${grant}-access-${n}`,
        refresh_token: grant === 'client_credentials' ? undefined : `refresh-${n}`,
        expires_in: this.expiresIn,
        token_type: 'bearer',
      })
    }

    if (path === '/connect/oauth2/authorize') {
      // Simulates the user approving access: bounce straight back to the app.
      let redirect = new URL(url.searchParams.get('redirect_uri')!)
      redirect.searchParams.set('code', 'good-code')
      redirect.searchParams.set('state', url.searchParams.get('state')!)
      return new Response(null, { status: 302, headers: { Location: redirect.href } })
    }

    if (path === '/products' && request.method === 'GET') {
      if (this.productStatus !== 200) return new Response('error', { status: this.productStatus })
      let term = (url.searchParams.get('filter.term') ?? '').toLowerCase()
      let words = term.split(/\s+/).filter(Boolean)
      let matches = this.products.filter((p) =>
        words.some((w) => p.description.toLowerCase().includes(w)),
      )
      return Response.json({
        data: matches.map((p) => ({
          productId: p.productId,
          description: p.description,
          items: [
            {
              upc: p.upc,
              price: url.searchParams.has('filter.locationId') ? { regular: p.price } : undefined,
            },
          ],
          images: p.imageUrl
            ? [{ perspective: 'front', sizes: [{ size: 'thumbnail', url: p.imageUrl }] }]
            : [],
        })),
      })
    }

    if (path === '/locations' && request.method === 'GET') {
      return Response.json({
        data: this.locations.map((l) => ({
          locationId: l.locationId,
          name: l.name,
          address: {
            addressLine1: l.addressLine1,
            city: l.city,
            state: l.state,
            zipCode: l.zipCode,
          },
        })),
      })
    }

    if (path === '/cart/add' && request.method === 'PUT') {
      if (this.cartStatus !== 200) return new Response('error', { status: this.cartStatus })
      this.cart.push(...(JSON.parse(body).items as { upc: string; quantity: number }[]))
      return new Response(null, { status: 204 })
    }

    return new Response('Not Found', { status: 404 })
  }

  requestsTo(path: string) {
    return this.requests.filter((r) => new URL(r.url).pathname.replace(/^\/v1/, '') === path)
  }

  // For e2e tests: serve the fake over HTTP so the browser can follow the OAuth redirect.
  async listen(): Promise<{ apiBase: string; close(): Promise<void> }> {
    let server = http.createServer(createRequestListener(this.handle))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    let { port } = server.address() as AddressInfo
    return {
      apiBase: `http://127.0.0.1:${port}/v1`,
      close: () => new Promise((resolve) => server.close(() => resolve())),
    }
  }
}
