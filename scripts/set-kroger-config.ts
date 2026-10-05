// Usage: node --import remix/node-tsx scripts/set-kroger-config.ts <email> <clientId> <clientSecret>
// Stores a user's Kroger developer credentials. The app has no UI for this (neither did
// the Spring app); see docs/groceries-migration/MIGRATION.md §6.
import { Kroger } from '../app/data/groceries/kroger.ts'
import { users } from '../app/data/groceries/tables.ts'
import { migrateDatabase, openDatabase } from '../app/db.ts'

let [email, clientId, clientSecret] = process.argv.slice(2)
if (!email || !clientId || !clientSecret) {
  console.error('Usage: set-kroger-config.ts <email> <clientId> <clientSecret>')
  process.exit(1)
}

let db = openDatabase()
await migrateDatabase(db)
let user = await db.findOne(users, { where: { email } })
if (!user) {
  console.error(`No user with email ${email}`)
  process.exit(1)
}
await new Kroger(db, { redirectUri: '' }).setCredentials(user.id, clientId, clientSecret)
await db.close()
console.log(`Saved Kroger credentials for ${user.email}`)
