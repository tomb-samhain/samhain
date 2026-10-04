import * as assert from 'remix/assert'
import type { Database } from 'remix/data-table'

import { createAppRouter } from '../app/router.ts'
import { routes } from '../app/routes.ts'
import { createTestDatabase, createUser, TEST_PASSWORD } from './db.ts'
import { FakeKroger } from './fake-kroger.ts'

export const ORIGIN = 'https://samhain.test'

export interface TestApp {
  db: Database
  kroger: FakeKroger
  router: ReturnType<typeof createAppRouter>
  // Sends a request as a same-origin browser would (cop() rejects cross-site posts).
  fetch(path: string, init?: RequestInit & { cookie?: string }): Promise<Response>
  post(path: string, fields: Record<string, string | string[]>, init?: { cookie?: string; json?: boolean }): Promise<Response>
}

export async function createTestApp(options: { now?: () => number } = {}): Promise<TestApp> {
  let db = await createTestDatabase()
  let kroger = new FakeKroger()
  let router = createAppRouter({
    db,
    sessionSecret: 'test-secret',
    kroger: { apiBase: 'https://kroger.test/v1', fetch: kroger.fetch, now: options.now },
  })

  async function fetch(path: string, init: RequestInit & { cookie?: string } = {}) {
    let { cookie, ...rest } = init
    let headers = new Headers(rest.headers)
    if (cookie) headers.set('Cookie', cookie)
    if (rest.method && rest.method !== 'GET') headers.set('Sec-Fetch-Site', 'same-origin')
    return router.fetch(new Request(new URL(path, ORIGIN), { ...rest, headers, redirect: 'manual' }))
  }

  async function post(path: string, fields: Record<string, string | string[]>, init: { cookie?: string; json?: boolean } = {}) {
    let body = new FormData()
    for (let [name, value] of Object.entries(fields)) {
      for (let v of Array.isArray(value) ? value : [value]) body.append(name, v)
    }
    return fetch(path, {
      method: 'POST',
      body,
      cookie: init.cookie,
      headers: init.json ? { Accept: 'application/json' } : undefined,
    })
  }

  return { db, kroger, router, fetch, post }
}

export function getResponseCookie(response: Response, name = 'groceries_session'): string {
  let setCookie = response.headers.getSetCookie().find((header) => header.startsWith(`${name}=`))
  assert.ok(setCookie, `Expected a ${name} cookie`)
  return setCookie.split(';', 1)[0]
}

// Creates a user and returns a session cookie for them.
export async function signIn(app: TestApp, email = 'cook@example.com') {
  let user = await createUser(app.db, email)
  let response = await app.post(routes.groceries.auth.loginAction.href(), { email, password: TEST_PASSWORD })
  assert.equal(response.status, 303)
  return { user, cookie: getResponseCookie(response) }
}
