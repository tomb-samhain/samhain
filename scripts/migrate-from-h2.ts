// Usage: node --import remix/node-tsx scripts/migrate-from-h2.ts <csv-export-dir>
// Imports the Spring app's H2 CSV export into the SQLite database at DATABASE_PATH
// (default db/samhain.sqlite). See docs/groceries-migration/MIGRATION.md §11.
import { migrateDatabase, openDatabase } from '../app/db.ts'
import { importH2Export } from './h2-import.ts'

let [dir] = process.argv.slice(2)
if (!dir) {
  console.error('Usage: migrate-from-h2.ts <csv-export-dir>')
  process.exit(1)
}

let db = openDatabase()
await migrateDatabase(db)
try {
  let report = await importH2Export(db, dir)
  for (let [table, count] of Object.entries(report.imported)) console.log(`${table}: ${count}`)
  for (let reason of report.skipped) console.log(`skipped ${reason}`)
  console.log("Import complete. Set the imported users' passwords with scripts/set-password.ts.")
} finally {
  await db.close()
}
