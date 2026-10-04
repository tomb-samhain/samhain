import type { Database } from 'remix/data-table'

import { isUniqueViolation } from './errors.ts'
import { hashPassword, verifyPassword } from './passwords.ts'
import { users, type User } from './tables.ts'

export interface CurrentUser {
  id: number
  email: string
}

// Same rule as the Spring app's AuthService.
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type RegisterResult = { ok: true; user: CurrentUser } | { ok: false; error: string }

export async function registerUser(
  db: Database,
  email: string,
  password: string,
): Promise<RegisterResult> {
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Username must be a valid email address' }
  }
  if (await findUserByEmail(db, email)) {
    return { ok: false, error: 'Username already taken' }
  }

  try {
    let user = await db.create(
      users,
      { email, password_hash: await hashPassword(password) },
      { returnRow: true },
    )
    return { ok: true, user: toCurrentUser(user) }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'Username already taken' }
    throw error
  }
}

export async function authenticateUser(
  db: Database,
  email: string,
  password: string,
): Promise<CurrentUser | null> {
  let user = await findUserByEmail(db, email)
  if (!user || !(await verifyPassword(password, user.password_hash))) return null
  return toCurrentUser(user)
}

export async function getUser(db: Database, id: number): Promise<CurrentUser | null> {
  let user = await db.find(users, id)
  return user ? toCurrentUser(user) : null
}

export async function setPassword(db: Database, email: string, password: string): Promise<boolean> {
  let user = await findUserByEmail(db, email)
  if (!user) return false
  await db.update(users, user.id, { password_hash: await hashPassword(password) })
  return true
}

function findUserByEmail(db: Database, email: string) {
  // The email column is COLLATE NOCASE, so this lookup ignores case.
  return db.findOne(users, { where: { email } })
}

function toCurrentUser(user: User): CurrentUser {
  return { id: user.id, email: user.email }
}
