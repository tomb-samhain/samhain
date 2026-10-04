import { createController } from 'remix/router'
import { routes } from '../../routes.ts'
const todo = () => new Response('Not implemented', { status: 501 })
export default createController(routes.groceries, { actions: { orders: todo } })
