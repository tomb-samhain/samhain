import { get, post, route } from 'remix/routes'

// Mounted at /groceries in app/routes.ts, matching the production URLs of the Spring app
// (including the Kroger OAuth redirect URI registered with Kroger).
export const groceryRoutes = route({
  auth: {
    login: get('/login'),
    loginAction: post('/login'),
    register: post('/register'),
    logout: post('/logout'),
  },
  meals: {
    index: get('/'),
    create: post('/meals'),
    show: get('/meals/:mealId'),
    rename: post('/meals/:mealId/rename'),
    destroy: post('/meals/:mealId/delete'),
    addIngredient: post('/meals/:mealId/ingredients'),
    updateIngredient: post('/meals/:mealId/ingredients/:ingredientId'),
    deleteIngredient: post('/meals/:mealId/ingredients/:ingredientId/delete'),
    linkIngredient: post('/meals/:mealId/ingredients/:ingredientId/link'),
  },
  shop: {
    index: get('/shop'),
    link: post('/shop/link'),
    cart: post('/shop/cart'),
  },
  orders: get('/orders'),
  settings: {
    index: get('/settings'),
    location: post('/settings/location'),
  },
  kroger: {
    connect: post('/kroger/connect'),
    callback: get('/api/kroger/auth/callback'),
    products: get('/kroger/products'),
  },
})
