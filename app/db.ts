import { fileURLToPath } from 'node:url'
import type { Database } from 'remix/data-table'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { createSqliteDatabase } from 'remix/data-table/sqlite'

const migrationsDir = fileURLToPath(new URL('../db/migrations/', import.meta.url))
const defaultFilename = fileURLToPath(new URL('../db/samhain.sqlite', import.meta.url))

export function openDatabase(filename = process.env.DATABASE_PATH ?? defaultFilename): Database {
  return createSqliteDatabase({ filename, foreignKeys: true })
}

export async function migrateDatabase(db: Database) {
  await db.migrate(await loadMigrations(migrationsDir))
}
