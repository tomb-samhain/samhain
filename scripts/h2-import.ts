import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Database } from 'remix/data-table'

import { UNUSABLE_PASSWORD_HASH } from '../app/data/groceries/passwords.ts'
import {
  ingredients,
  krogerConfigs,
  krogerTokens,
  meals,
  orderMeals,
  orders,
  users,
} from '../app/data/groceries/tables.ts'

// Imports the Spring app's H2 data from CSVWRITE exports (docs/groceries-migration/MIGRATION.md §11).
// IDs are preserved so bookmarked /groceries/meals/:id URLs keep working.

export interface ImportReport {
  imported: Record<string, number>
  skipped: string[]
}

type Row = Record<string, string | null>

export async function importH2Export(db: Database, dir: string): Promise<ImportReport> {
  let read = async (name: string) => parseCsv(await readFile(join(dir, `${name}.csv`), 'utf8'))
  let [userRows, mealRows, ingredientRows, configRows, tokenRows, orderRows, orderMealRows] =
    await Promise.all(
      [
        'app_users',
        'meals',
        'ingredients',
        'kroger_config',
        'kroger_tokens',
        'orders',
        'order_meals',
      ].map(read),
    )

  for (let [name, table] of [
    ['groceries_users', users],
    ['groceries_meals', meals],
    ['groceries_orders', orders],
  ] as const) {
    if ((await db.findMany(table, { limit: 1 })).length > 0) {
      throw new Error(`Refusing to import into a database that already has ${name} rows`)
    }
  }

  let report: ImportReport = { imported: {}, skipped: [] }
  let count = (table: string) => (report.imported[table] = (report.imported[table] ?? 0) + 1)
  let skip = (reason: string) => report.skipped.push(reason)

  await db.transaction(async (tx) => {
    let userIds = new Set<number>()
    for (let row of userRows) {
      let id = int(row.ID)
      await tx.create(users, {
        id,
        email: text(row.USERNAME),
        password_hash: UNUSABLE_PASSWORD_HASH,
      })
      userIds.add(id)
      count('users')
    }

    let mealIds = new Set<number>()
    for (let row of sortById(mealRows)) {
      let userId = row.USER_ID == null ? null : int(row.USER_ID)
      if (userId == null || !userIds.has(userId)) {
        skip(`meal ${row.ID} (${row.NAME}): no owner`)
        continue
      }
      await tx.create(meals, { id: int(row.ID), user_id: userId, name: text(row.NAME) })
      mealIds.add(int(row.ID))
      count('meals')
    }

    for (let row of sortById(ingredientRows)) {
      if (!mealIds.has(int(row.MEAL_ID))) {
        skip(`ingredient ${row.ID} (${row.NAME}): meal ${row.MEAL_ID} was skipped`)
        continue
      }
      await tx.create(ingredients, {
        id: int(row.ID),
        meal_id: int(row.MEAL_ID),
        name: text(row.NAME),
        quantity: row.QUANTITY,
        kroger_product_id: row.KROGER_PRODUCT_ID,
        kroger_product_name: row.KROGER_PRODUCT_NAME,
      })
      count('ingredients')
    }

    for (let row of configRows) {
      let userId = row.USER_ID == null ? null : int(row.USER_ID)
      if (userId == null || !userIds.has(userId)) {
        skip(`kroger_config ${row.ID}: no owner`)
        continue
      }
      await tx.create(krogerConfigs, {
        user_id: userId,
        client_id: text(row.CLIENT_ID),
        client_secret: text(row.CLIENT_SECRET),
        location_id: row.LOCATION_ID,
        location_name: row.LOCATION_NAME,
      })
      count('kroger_configs')
    }

    // Client tokens are re-fetched on demand; user tokens keep accounts connected.
    for (let row of tokenRows) {
      let userId = row.USER_ID == null ? null : int(row.USER_ID)
      if (row.GRANT_TYPE !== 'USER') continue
      if (userId == null || !userIds.has(userId)) {
        skip(`kroger_token ${row.ID}: no owner`)
        continue
      }
      await tx.create(krogerTokens, {
        user_id: userId,
        grant_type: 'USER',
        access_token: text(row.ACCESS_TOKEN),
        refresh_token: row.REFRESH_TOKEN,
        expires_at: timestamp(text(row.EXPIRES_AT)),
      })
      count('kroger_tokens')
    }

    let orderIds = new Set<number>()
    for (let row of sortById(orderRows)) {
      let userId = row.USER_ID == null ? null : int(row.USER_ID)
      if (userId == null || !userIds.has(userId)) {
        skip(`order ${row.ID}: no owner`)
        continue
      }
      await tx.create(orders, {
        id: int(row.ID),
        user_id: userId,
        created_at: timestamp(text(row.CREATED_AT)),
      })
      orderIds.add(int(row.ID))
      count('orders')
    }

    // order_meals had no ordering column; keep the export's row order.
    let positions = new Map<number, number>()
    for (let row of orderMealRows) {
      let orderId = int(row.ORDER_ID)
      if (!orderIds.has(orderId) || row.MEAL_NAME == null) continue
      let position = positions.get(orderId) ?? 0
      positions.set(orderId, position + 1)
      await tx.create(orderMeals, { order_id: orderId, position, meal_name: row.MEAL_NAME })
      count('order_meals')
    }
  })

  return report
}

// H2 CSVWRITE output: a quoted header, quoted values with "" escapes, and NULL as an empty
// unquoted field (an empty string is "").
export function parseCsv(input: string): Row[] {
  let records: (string | null)[][] = []
  let record: (string | null)[] = []
  let i = 0

  while (i < input.length) {
    let value: string | null
    if (input[i] === '"') {
      let end = i + 1
      value = ''
      while (true) {
        let quote = input.indexOf('"', end)
        if (quote === -1) throw new Error('Unterminated quoted field')
        value += input.slice(end, quote)
        if (input[quote + 1] === '"') {
          value += '"'
          end = quote + 2
        } else {
          i = quote + 1
          break
        }
      }
    } else {
      let end = i
      while (end < input.length && input[end] !== ',' && input[end] !== '\n' && input[end] !== '\r')
        end++
      let raw = input.slice(i, end)
      value = raw === '' ? null : raw
      i = end
    }
    record.push(value)

    if (input[i] === ',') {
      i++
      if (i === input.length || input[i] === '\n' || input[i] === '\r') record.push(null)
    }
    if (i >= input.length || input[i] === '\n' || input[i] === '\r') {
      if (input[i] === '\r') i++
      if (input[i] === '\n') i++
      records.push(record)
      record = []
    }
  }

  let [header = [], ...rows] = records.filter((r) => !(r.length === 1 && r[0] === null))
  return rows.map((values) =>
    Object.fromEntries(header.map((name, index) => [name ?? '', values[index] ?? null])),
  )
}

// "2026-10-04 20:01:41.046341+00" → "2026-10-04T20:01:41.046Z"
export function timestamp(value: string): string {
  let match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(
      value.trim(),
    )
  if (!match) throw new Error(`Unrecognized timestamp: ${value}`)
  let [, date, time, zone = 'Z'] = match
  if (zone !== 'Z') {
    let [, sign, hours, minutes = '00'] = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone)!
    zone = `${sign}${hours}:${minutes}`
  }
  let fraction = time.includes('.') ? time.replace(/(\.\d{3})\d*$/, '$1') : time
  let parsed = new Date(`${date}T${fraction}${zone}`)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Unrecognized timestamp: ${value}`)
  return parsed.toISOString()
}

function sortById(rows: Row[]) {
  return [...rows].sort((a, b) => int(a.ID) - int(b.ID))
}

function int(value: string | null): number {
  let n = Number(value)
  if (!Number.isSafeInteger(n)) throw new Error(`Expected an integer, got ${value}`)
  return n
}

function text(value: string | null): string {
  if (value == null) throw new Error('Unexpected NULL')
  return value
}
