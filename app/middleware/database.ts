import type { Database } from 'remix/data-table'
import { createContextKey, type Middleware } from 'remix/router'

export const DatabaseKey = createContextKey<Database>()

export function loadDatabase(db: Database): Middleware<{
  key: typeof DatabaseKey
  value: Database
  property: 'db'
}> {
  return (context, next) => {
    context.set(DatabaseKey, db, { property: 'db' })
    return next()
  }
}
