import { and, inList, type Database } from 'remix/data-table'

import { meals, orderMeals, orders } from './tables.ts'

export interface OrderSummary {
  id: number
  createdAt: string
  mealNames: string[]
}

// Records the names of the user's meals in the requested order. Unknown or foreign
// meal ids are skipped, as in OrderService.createOrder.
export async function createOrder(db: Database, userId: number, mealIds: number[]): Promise<OrderSummary> {
  let rows = mealIds.length
    ? await db.findMany(meals, { where: and({ user_id: userId }, inList('id', mealIds)) })
    : []
  let byId = new Map(rows.map((row) => [row.id, row.name]))
  let mealNames = mealIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))

  return db.transaction(async (tx) => {
    let order = await tx.create(orders, { user_id: userId }, { returnRow: true })
    for (let [position, meal_name] of mealNames.entries()) {
      await tx.create(orderMeals, { order_id: order.id, position, meal_name })
    }
    return { id: order.id, createdAt: order.created_at, mealNames }
  })
}

export async function listRecentOrders(db: Database, userId: number, limit = 5): Promise<OrderSummary[]> {
  let rows = await db.findMany(orders, {
    where: { user_id: userId },
    orderBy: [
      ['created_at', 'desc'],
      ['id', 'desc'],
    ],
    limit,
  })
  if (rows.length === 0) return []

  let names = await db.findMany(orderMeals, {
    where: inList('order_id', rows.map((row) => row.id)),
    orderBy: ['position', 'asc'],
  })
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    mealNames: names.filter((n) => n.order_id === row.id).map((n) => n.meal_name),
  }))
}
