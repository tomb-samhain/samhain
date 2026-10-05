import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { KrogerError, type KrogerLocation } from '../../../data/groceries/kroger.ts'
import { requireGroceriesUser } from '../../../middleware/groceries-auth.ts'
import { routes } from '../../../routes.ts'
import { formText } from '../form.ts'
import { SETTINGS_ERROR_FLASH } from '../kroger/controller.tsx'
import { SettingsPage } from './settings-page.tsx'

export default createController(routes.groceries.settings, {
  middleware: [requireGroceriesUser()],
  actions: {
    async index(context) {
      let user = context.auth.identity
      let zip = context.url.searchParams.get('zip')?.trim() ?? ''
      let accountError = context.session.get(SETTINGS_ERROR_FLASH) as string | undefined

      let locations: KrogerLocation[] = []
      let locationError: string | undefined
      if (zip) {
        try {
          locations = await context.kroger.searchLocations(user.id, zip)
        } catch (error) {
          if (!(error instanceof KrogerError)) throw error
          locationError = error.message
        }
      }

      return context.render(
        <SettingsPage
          user={user}
          status={await context.kroger.getStatus(user.id)}
          authSuccess={context.url.searchParams.get('auth') === 'success'}
          zip={zip}
          locations={locations}
          locationError={locationError}
          accountError={accountError}
        />,
      )
    },

    async location(context) {
      let user = context.auth.identity
      let zip = formText(context.formData, 'zip').trim()
      let [locationId, ...nameParts] = formText(context.formData, 'location').split('|')
      let back = `${routes.groceries.settings.index.href()}${zip ? `?${new URLSearchParams({ zip })}` : ''}`

      try {
        if (!locationId) throw new KrogerError('Choose a store')
        await context.kroger.updateLocation(user.id, locationId, nameParts.join('|') || null)
      } catch (error) {
        if (!(error instanceof KrogerError)) throw error
        return context.render(
          <SettingsPage
            user={user}
            status={await context.kroger.getStatus(user.id)}
            authSuccess={false}
            zip={zip}
            locations={[]}
            locationError={error.message}
          />,
          { status: 400 },
        )
      }
      return redirect(back, 303)
    },
  },
})
