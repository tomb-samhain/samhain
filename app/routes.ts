import { get, route } from 'remix/routes'

import { groceryRoutes } from './actions/groceries/routes.ts'

export const routes = route({
  assets: get('/assets/*path'),
  home: '/',
  about: get('/about'),
  blog: get('/blog'),
  projects: get('/projects'),
  groceries: route('/groceries', groceryRoutes),
})
