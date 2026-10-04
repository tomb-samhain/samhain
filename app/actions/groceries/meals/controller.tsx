import type { RemixNode } from 'remix/component'
import type { Database } from 'remix/data-table'
import { createController } from 'remix/router'

import {
  addIngredient,
  createMeal,
  deleteIngredient,
  deleteMeal,
  getMeal,
  linkIngredient,
  listMeals,
  renameMeal,
  updateIngredient,
} from '../../../data/groceries/meals.ts'
import type { CurrentUser } from '../../../data/groceries/users.ts'
import { requireGroceriesUser, safeReturnTo } from '../../../middleware/groceries-auth.ts'
import { routes } from '../../../routes.ts'
import { done, failJson, formText, parseId, wantsJson } from '../form.ts'
import { MealsPage } from './meals-page.tsx'

// The parts of an action's context the helpers below use.
interface Context {
  db: Database
  request: Request
  params: object
  formData?: FormData
  auth: { identity: CurrentUser }
  render(node: RemixNode, init?: ResponseInit): Response | Promise<Response>
}

const notFound = () => new Response('Meal not found', { status: 404 })

export default createController(routes.groceries.meals, {
  middleware: [requireGroceriesUser()],
  actions: {
    async index(context) {
      return renderMeals(context, null)
    },

    async show(context) {
      return renderMeals(context, parseId(context.params.mealId))
    },

    async create(context) {
      let user = context.auth.identity
      let result = await createMeal(context.db, user.id, formText(context.formData, 'name'))
      if (!result.ok) return fail(context, result.error, null)
      return done(context.request, routes.groceries.meals.show.href({ mealId: result.value.id }))
    },

    async rename(context) {
      let mealId = parseId(context.params.mealId)
      let result =
        mealId &&
        (await renameMeal(
          context.db,
          context.auth.identity.id,
          mealId,
          formText(context.formData, 'name'),
        ))
      if (!result) return notFound()
      if (!result.ok) return fail(context, result.error, mealId)
      return done(context.request, backTo(context, mealId!))
    },

    async destroy(context) {
      let mealId = parseId(context.params.mealId)
      if (!mealId || !(await deleteMeal(context.db, context.auth.identity.id, mealId)))
        return notFound()
      // Leave the deleted meal's URL; otherwise go back to the page the user was on.
      let returnTo = safeReturnTo(context.formData.get('returnTo'))
      let deletedHref = routes.groceries.meals.show.href({ mealId })
      let location =
        !returnTo || returnTo === deletedHref ? routes.groceries.meals.index.href() : returnTo
      return done(context.request, location)
    },

    async addIngredient(context) {
      let mealId = parseId(context.params.mealId)
      let result =
        mealId &&
        (await addIngredient(
          context.db,
          context.auth.identity.id,
          mealId,
          formText(context.formData, 'raw'),
        ))
      if (!result) return notFound()
      if (!result.ok) return fail(context, result.error, mealId)
      return done(context.request, routes.groceries.meals.show.href({ mealId: mealId! }))
    },

    async updateIngredient(context) {
      let mealId = parseId(context.params.mealId)
      let ingredientId = parseId(context.params.ingredientId)
      let changes: { name?: string; quantity?: string } = {}
      if (context.formData.has('name')) changes.name = formText(context.formData, 'name')
      if (context.formData.has('quantity'))
        changes.quantity = formText(context.formData, 'quantity')

      let result =
        mealId &&
        ingredientId &&
        (await updateIngredient(
          context.db,
          context.auth.identity.id,
          mealId,
          ingredientId,
          changes,
        ))
      if (!result) return notFound()
      if (!result.ok) return fail(context, result.error, mealId)
      return done(context.request, routes.groceries.meals.show.href({ mealId: mealId! }))
    },

    async deleteIngredient(context) {
      let mealId = parseId(context.params.mealId)
      let ingredientId = parseId(context.params.ingredientId)
      if (
        !mealId ||
        !ingredientId ||
        !(await deleteIngredient(context.db, context.auth.identity.id, mealId, ingredientId))
      ) {
        return notFound()
      }
      return done(context.request, routes.groceries.meals.show.href({ mealId }))
    },

    async linkIngredient(context) {
      let mealId = parseId(context.params.mealId)
      let ingredientId = parseId(context.params.ingredientId)
      let productId = formText(context.formData, 'productId').trim()
      let productName = formText(context.formData, 'productName').trim()
      if (!productId || !productName) return fail(context, 'Choose a product to link.', mealId)

      let linked =
        mealId &&
        ingredientId &&
        (await linkIngredient(context.db, context.auth.identity.id, mealId, ingredientId, {
          productId,
          productName,
        }))
      if (!linked) return notFound()
      return done(context.request, routes.groceries.meals.show.href({ mealId: mealId! }))
    },
  },
})

async function renderMeals(
  context: Context,
  mealId: number | null,
  init?: { error?: string; status?: number },
) {
  let user = context.auth.identity
  let meals = await listMeals(context.db, user.id)
  let requested = 'mealId' in context.params
  let selected = mealId ? await getMeal(context.db, user.id, mealId) : null
  let missing = Boolean(requested && !selected)

  return context.render(
    <MealsPage
      user={user}
      meals={meals}
      selected={selected}
      notFound={missing}
      error={init?.error}
    />,
    { status: init?.status ?? (missing ? 404 : 200) },
  )
}

// Validation failures: inline JSON for client entries, the page with an error otherwise.
function fail(context: Context, error: string, mealId: number | null) {
  if (wantsJson(context.request)) return failJson(error)
  return renderMeals(context, mealId, { error, status: 400 })
}

function backTo(context: Context, mealId: number) {
  return (
    safeReturnTo(context.formData?.get('returnTo')) ?? routes.groceries.meals.show.href({ mealId })
  )
}
