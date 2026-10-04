// Usage: node --import remix/node-tsx scripts/set-password.ts <email>
// Prompts for a new password. Used after the H2 import, which does not carry over BCrypt
// hashes (see docs/groceries-migration/MIGRATION.md §5).
import { createInterface } from 'node:readline/promises'

import { setPassword } from '../app/data/groceries/users.ts'
import { migrateDatabase, openDatabase } from '../app/db.ts'

let [email] = process.argv.slice(2)
if (!email) {
  console.error('Usage: set-password.ts <email>')
  process.exit(1)
}

let password = process.env.NEW_PASSWORD
if (!password) {
  let rl = createInterface({ input: process.stdin, output: process.stdout })
  password = await rl.question('New password: ')
  rl.close()
}
if (!password) {
  console.error('Password must not be empty')
  process.exit(1)
}

let db = openDatabase()
await migrateDatabase(db)
let updated = await setPassword(db, email, password)
await db.close()
if (!updated) {
  console.error(`No user with email ${email}`)
  process.exit(1)
}
console.log(`Password updated for ${email}`)
