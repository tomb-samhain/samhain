import type { Database } from 'remix/data-table'

import { migrateDatabase, openDatabase } from '../app/db.ts'
import { addIngredient, createMeal } from '../app/data/groceries/meals.ts'
import { registerUser } from '../app/data/groceries/users.ts'

export async function createTestDatabase(): Promise<Database> {
  let db = openDatabase(':memory:')
  await migrateDatabase(db)
  return db
}

export const TEST_PASSWORD = 'correct horse'

export async function createUser(
  db: Database,
  email = 'cook@example.com',
  password = TEST_PASSWORD,
) {
  let result = await registerUser(db, email, password)
  if (!result.ok) throw new Error(result.error)
  return result.user
}

export async function createMealWith(
  db: Database,
  userId: number,
  name: string,
  items: string[] = [],
) {
  let result = await createMeal(db, userId, name)
  if (!result.ok) throw new Error(result.error)
  for (let raw of items) {
    let added = await addIngredient(db, userId, result.value.id, raw)
    if (!added?.ok) throw new Error(`Could not add ${raw}`)
  }
  return result.value.id
}
