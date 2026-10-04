import { createController } from 'remix/router'

import { listRecentOrders } from '../../data/groceries/orders.ts'
import { requireGroceriesUser } from '../../middleware/groceries-auth.ts'
import { routes } from '../../routes.ts'
import { OrdersPage } from './orders/orders-page.tsx'

export default createController(routes.groceries, {
  middleware: [requireGroceriesUser()],
  actions: {
    async orders(context) {
      let user = context.auth.identity
      return context.render(<OrdersPage user={user} orders={await listRecentOrders(context.db, user.id)} />)
    },
  },
})
