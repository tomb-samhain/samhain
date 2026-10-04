import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { KrogerError } from '../../../data/groceries/kroger.ts'
import { consolidateMeals, linkProductAcrossMeals, listMeals } from '../../../data/groceries/meals.ts'
import { createOrder } from '../../../data/groceries/orders.ts'
import { requireGroceriesUser } from '../../../middleware/groceries-auth.ts'
import { routes } from '../../../routes.ts'
import { done, failJson, formIds, formText, wantsJson } from '../form.ts'
import { ShopPage } from './shop-page.tsx'

const CART_RESULT_FLASH = 'groceriesCartResult'
const CART_ERROR_FLASH = 'groceriesCartError'

function shopHref(mealIds: number[]) {
  let search = new URLSearchParams(mealIds.map((id) => ['meal', String(id)]))
  return `${routes.groceries.shop.index.href()}${mealIds.length ? `?${search}` : ''}`
}

export default createController(routes.groceries.shop, {
  middleware: [requireGroceriesUser()],
  actions: {
    async index(context) {
      let user = context.auth.identity
      let meals = await listMeals(context.db, user.id)
      // Unknown ids in the URL are dropped rather than failing the page.
      let owned = new Set(meals.map((meal) => meal.id))
      let selectedIds = formIds(context.url.searchParams.getAll('meal')).filter((id) => owned.has(id))
      let items = (await consolidateMeals(context.db, user.id, selectedIds)) ?? []

      return context.render(
        <ShopPage
          user={user}
          meals={meals}
          selectedIds={selectedIds}
          items={items}
          hasKrogerAuth={await context.kroger.hasUserToken(user.id)}
          result={context.session.get(CART_RESULT_FLASH) as string | undefined}
          error={context.session.get(CART_ERROR_FLASH) as string | undefined}
        />,
      )
    },

    // Links a product to every ingredient with this name in the selected meals.
    async link(context) {
      let user = context.auth.identity
      let mealIds = formIds(context.formData.getAll('meal'))
      let name = formText(context.formData, 'name')
      let productId = formText(context.formData, 'productId').trim()
      let productName = formText(context.formData, 'productName').trim()
      if (!name.trim() || !productId || !productName) return failJson('Choose a product to link.')

      let linked = await linkProductAcrossMeals(context.db, user.id, mealIds, name, { productId, productName })
      if (!linked) return new Response('Meal not found', { status: 404 })
      return done(context.request, shopHref(mealIds))
    },

    // Recomputes the list on the server, so only the user's own linked products are sent.
    async cart(context) {
      let user = context.auth.identity
      let mealIds = formIds(context.formData.getAll('meal'))
      let excluded = new Set(context.formData.getAll('exclude').map(String))
      let back = shopHref(mealIds)

      let reply = (body: { message: string } | { error: string }, status = 200) => {
        if (wantsJson(context.request)) return Response.json(body, { status })
        context.session.flash('message' in body ? CART_RESULT_FLASH : CART_ERROR_FLASH, 'message' in body ? body.message : body.error)
        return redirect(back, 303)
      }

      let items = await consolidateMeals(context.db, user.id, mealIds)
      if (!items) return new Response('Meal not found', { status: 404 })
      let cartItems = items
        .filter((item) => !excluded.has(item.name) && item.krogerProductId)
        .map((item) => ({ upc: item.krogerProductId!, quantity: 1 }))
      if (cartItems.length === 0) return reply({ error: 'No Kroger products linked to ingredients' }, 400)

      let message: string
      try {
        message = await context.kroger.addToCart(user.id, cartItems)
      } catch (error) {
        if (!(error instanceof KrogerError)) throw error
        return reply({ error: error.message }, 409)
      }

      // Order history is best-effort, as in the source app.
      try {
        await createOrder(context.db, user.id, mealIds)
      } catch (error) {
        console.error('Failed to record order', error)
      }
      return reply({ message })
    },
  },
})
