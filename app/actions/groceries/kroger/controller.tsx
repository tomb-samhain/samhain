import { createController } from 'remix/router'
import { routes } from '../../../routes.ts'
const todo = () => new Response('Not implemented', { status: 501 })
export default createController(routes.groceries.kroger, { actions: { connect: todo, callback: todo, products: todo } })
