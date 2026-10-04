import { finishExternalAuth, startExternalAuth } from 'remix/auth'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { KrogerError } from '../../../data/groceries/kroger.ts'
import { currentUser, requireGroceriesUser, requireGroceriesUserJson } from '../../../middleware/groceries-auth.ts'
import { routes } from '../../../routes.ts'

export const SETTINGS_ERROR_FLASH = 'groceriesSettingsError'

const settingsHref = () => routes.groceries.settings.index.href()

export default createController(routes.groceries.kroger, {
  actions: {
    // JSON for the product search popover. The server applies the user's saved store.
    products: {
      middleware: [requireGroceriesUserJson()],
      async handler(context) {
        let userId = currentUser(context).id
        let term = context.url.searchParams.get('term')?.trim() ?? ''
        if (!term) return Response.json({ error: 'Enter a search term' }, { status: 400 })

        try {
          let [config, products] = await Promise.all([
            context.kroger.getConfig(userId),
            context.kroger.searchProducts(userId, term),
          ])
          return Response.json({ products, hasLocation: Boolean(config?.location_id) })
        } catch (error) {
          if (error instanceof KrogerError) return Response.json({ error: error.message }, { status: 409 })
          throw error
        }
      },
    },

    // Starts the Kroger OAuth + PKCE flow; the transaction lives in the session.
    connect: {
      middleware: [requireGroceriesUser()],
      async handler(context) {
        let userId = currentUser(context).id
        let config = await context.kroger.getConfig(userId)
        if (!config) {
          context.session.flash(SETTINGS_ERROR_FLASH, 'Kroger not configured')
          return redirect(settingsHref(), 303)
        }
        return startExternalAuth(context.kroger.createOAuthProvider(userId, config), context)
      },
    },

    // The path registered with Kroger. Linking Kroger is not a sign-in, so the signed-in
    // session is required and kept as is.
    callback: {
      middleware: [requireGroceriesUser()],
      async handler(context) {
        let userId = currentUser(context).id
        let config = await context.kroger.getConfig(userId)
        if (!config) {
          context.session.flash(SETTINGS_ERROR_FLASH, 'Kroger not configured')
          return redirect(settingsHref(), 303)
        }

        try {
          let { result } = await finishExternalAuth(context.kroger.createOAuthProvider(userId, config), context)
          await context.kroger.saveUserTokens(userId, result.tokens)
        } catch (error) {
          let message = error instanceof Error ? error.message : 'Unknown error'
          context.session.flash(SETTINGS_ERROR_FLASH, `Could not connect your Kroger account: ${message}`)
          return redirect(settingsHref(), 303)
        }
        return redirect(`${settingsHref()}?auth=success`, 303)
      },
    },
  },
})
