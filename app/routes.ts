import { get, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: '/',
  about: get('/about'),
  blog: get('/blog'),
  projects: get('/projects'),
})
