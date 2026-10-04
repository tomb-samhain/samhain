import { createSessionAuthScheme, requireAuth } from 'remix/middleware/auth'
import { redirect } from 'remix/response/redirect'

import { getUser, type CurrentUser } from '../data/groceries/users.ts'
import { DatabaseKey } from './database.ts'
import { routes } from '../routes.ts'

export interface SessionAuth {
  userId: number
}

export const AUTH_SESSION_KEY = 'groceriesAuth'

export const groceriesSessionAuth = createSessionAuthScheme<CurrentUser, SessionAuth>({
  name: 'groceries-session',
  read(session) {
    return session.get(AUTH_SESSION_KEY) as SessionAuth | undefined
  },
  verify(value, context) {
    let db = context.get(DatabaseKey)
    if (!db) throw new Error('loadDatabase() must run before auth()')
    return getUser(db, value.userId)
  },
  invalidate(session) {
    session.unset(AUTH_SESSION_KEY)
  },
})

// Signed-out page requests go to the login page and come back afterward.
export function requireGroceriesUser() {
  return requireAuth<CurrentUser>({
    onFailure(context) {
      if (context.request.headers.get('Accept')?.includes('application/json')) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
      let login = new URL(routes.groceries.auth.login.href(), context.url)
      if (context.method === 'GET') login.searchParams.set('returnTo', context.url.pathname + context.url.search)
      return redirect(login.pathname + login.search, 303)
    },
  })
}

// Resource routes fetched by client code get a status they can act on instead of a redirect.
export function requireGroceriesUserJson() {
  return requireAuth<CurrentUser>({
    onFailure() {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    },
  })
}

// Only same-site paths are honored as post-login destinations.
export function safeReturnTo(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}
