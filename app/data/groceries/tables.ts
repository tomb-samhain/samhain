import { column as c, table } from 'remix/data-table'
import type { TableRow } from 'remix/data-table'

// Keep in sync with db/migrations. Every read or write of user-owned rows must be
// scoped by user_id (see docs/groceries-migration/MIGRATION.md §4).

export const users = table({
  name: 'groceries_users',
  columns: {
    id: c.integer(),
    email: c.text(),
    password_hash: c.text(),
    created_at: c.text(),
  },
})

export const meals = table({
  name: 'groceries_meals',
  columns: {
    id: c.integer(),
    user_id: c.integer(),
    name: c.text(),
  },
})

export const ingredients = table({
  name: 'groceries_ingredients',
  columns: {
    id: c.integer(),
    meal_id: c.integer(),
    name: c.text(),
    quantity: c.text().nullable(),
    kroger_product_id: c.text().nullable(),
    kroger_product_name: c.text().nullable(),
  },
})

export const krogerConfigs = table({
  name: 'groceries_kroger_configs',
  primaryKey: 'user_id',
  columns: {
    user_id: c.integer(),
    client_id: c.text(),
    client_secret: c.text(),
    location_id: c.text().nullable(),
    location_name: c.text().nullable(),
  },
})

export const krogerTokens = table({
  name: 'groceries_kroger_tokens',
  primaryKey: ['user_id', 'grant_type'],
  columns: {
    user_id: c.integer(),
    grant_type: c.enum(['CLIENT', 'USER']),
    access_token: c.text(),
    refresh_token: c.text().nullable(),
    expires_at: c.text(),
  },
})

export const orders = table({
  name: 'groceries_orders',
  columns: {
    id: c.integer(),
    user_id: c.integer(),
    created_at: c.text(),
  },
})

export const orderMeals = table({
  name: 'groceries_order_meals',
  primaryKey: ['order_id', 'position'],
  columns: {
    order_id: c.integer(),
    position: c.integer(),
    meal_name: c.text(),
  },
})

export type User = TableRow<typeof users>
export type Meal = TableRow<typeof meals>
export type Ingredient = TableRow<typeof ingredients>
export type KrogerConfig = TableRow<typeof krogerConfigs>
export type KrogerToken = TableRow<typeof krogerTokens>
