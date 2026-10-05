import type { Database } from 'remix/data-table'
import { createCookie } from 'remix/cookie'
import { auth } from 'remix/middleware/auth'
import { cop } from 'remix/middleware/cop'
import { formData } from 'remix/middleware/form-data'
import { render } from 'remix/middleware/render'
import { session } from 'remix/middleware/session'
import { staticFiles } from 'remix/middleware/static'
import { createRouter, type RouterContext } from 'remix/router'
import { createCookieSessionStorage } from 'remix/session-storage/cookie'

import controller from './actions/controller.tsx'
import groceriesController from './actions/groceries/controller.tsx'
import groceriesAuthController from './actions/groceries/auth/controller.tsx'
import groceriesMealsController from './actions/groceries/meals/controller.tsx'
import groceriesShopController from './actions/groceries/shop/controller.tsx'
import groceriesSettingsController from './actions/groceries/settings/controller.tsx'
import groceriesKrogerController from './actions/groceries/kroger/controller.tsx'
import { assets } from './assets.ts'
import { loadDatabase } from './middleware/database.ts'
import { groceriesSessionAuth } from './middleware/groceries-auth.ts'
import { loadKroger, type KrogerSettings } from './middleware/kroger.ts'
import { stripTrailingSlash } from './middleware/trailing-slash.ts'
import { routes } from './routes.ts'

export interface AppRouterOptions {
  db: Database
  sessionSecret?: string
  kroger?: KrogerSettings
}

const DEV_SESSION_SECRET = 'samhain-dev-session-secret'

export function createAppRouter(options: AppRouterOptions) {
  let { db } = options
  let sessionCookie = createCookie('groceries_session', {
    secrets: [options.sessionSecret ?? readSessionSecret()],
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    // 30 days, matching the Spring app's JWT lifetime.
    maxAge: 60 * 60 * 24 * 30,
  })

  let router = createRouter({
    middleware: [
      staticFiles('./public', { index: false }),
      stripTrailingSlash(),
      cop(),
      loadDatabase(db),
      session(sessionCookie, createCookieSessionStorage()),
      formData(),
      auth({ schemes: [groceriesSessionAuth] }),
      loadKroger(db, {
        redirectUri: process.env.KROGER_REDIRECT_URI,
        apiBase: process.env.KROGER_API_BASE,
        ...options.kroger,
      }),
      render({ assets }),
    ],
  })

  router.map(routes, controller)
  router.map(routes.groceries, groceriesController)
  router.map(routes.groceries.auth, groceriesAuthController)
  router.map(routes.groceries.meals, groceriesMealsController)
  router.map(routes.groceries.shop, groceriesShopController)
  router.map(routes.groceries.settings, groceriesSettingsController)
  router.map(routes.groceries.kroger, groceriesKrogerController)

  return router
}

function readSessionSecret() {
  let secret = process.env.SESSION_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production')
    throw new Error('SESSION_SECRET must be set in production')
  return DEV_SESSION_SECRET
}

export type AppContext = RouterContext<ReturnType<typeof createAppRouter>>

declare module 'remix' {
  interface RouterTypes {
    context: AppContext
  }
}
