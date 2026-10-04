import type { Database } from 'remix/data-table'
import { createContextKey, type Middleware } from 'remix/router'

import { Kroger, type KrogerOptions } from '../data/groceries/kroger.ts'
import { routes } from '../routes.ts'

export const KrogerKey = createContextKey<Kroger>()

export type KrogerSettings = Partial<KrogerOptions>

// Without KROGER_REDIRECT_URI the callback URL is derived from the request origin, which
// must also be registered with the Kroger developer app.
export function loadKroger(db: Database, settings: KrogerSettings = {}): Middleware<{
  key: typeof KrogerKey
  value: Kroger
  property: 'kroger'
}> {
  return (context, next) => {
    let redirectUri =
      settings.redirectUri ?? new URL(routes.groceries.kroger.callback.href(), context.url.origin).href
    context.set(KrogerKey, new Kroger(db, { ...settings, redirectUri }), { property: 'kroger' })
    return next()
  }
}
