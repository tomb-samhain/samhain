import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createMealWith, createTestDatabase, createUser, TEST_PASSWORD } from '../../../test/db.ts'
import { createOrder, listRecentOrders } from './orders.ts'
import { hashPassword, UNUSABLE_PASSWORD_HASH, verifyPassword } from './passwords.ts'
import { authenticateUser, registerUser, setPassword } from './users.ts'

describe('orders data', () => {
  it('records owned meal names in order and skips unknown ids', async () => {
    let db = await createTestDatabase()
    let user = await createUser(db)
    let other = await createUser(db, 'other@example.com')
    let tacos = await createMealWith(db, user.id, 'Tacos')
    let chili = await createMealWith(db, user.id, 'Chili')
    let foreign = await createMealWith(db, other.id, 'Secret')

    let order = await createOrder(db, user.id, [tacos, chili, 99, foreign])
    assert.deepEqual(order.mealNames, ['Tacos', 'Chili'])
    assert.match(order.createdAt, /^\d{4}-\d{2}-\d{2}T/)
  })

  it('lists the five newest orders for the user only', async () => {
    let db = await createTestDatabase()
    let user = await createUser(db)
    let other = await createUser(db, 'other@example.com')
    let meal = await createMealWith(db, user.id, 'Meal')
    for (let i = 0; i < 7; i++) await createOrder(db, user.id, [meal])
    await createOrder(db, other.id, [])

    let recent = await listRecentOrders(db, user.id)
    assert.equal(recent.length, 5)
    assert.deepEqual(
      recent.map((o) => o.id),
      [7, 6, 5, 4, 3],
    )
    assert.deepEqual(recent[0].mealNames, ['Meal'])
    assert.deepEqual(await listRecentOrders(db, 999), [])
  })
})

describe('users data', () => {
  it('validates email the same way as the Spring app', async () => {
    let db = await createTestDatabase()
    assert.deepEqual(await registerUser(db, 'bad', 'x'), {
      ok: false,
      error: 'Username must be a valid email address',
    })
    assert.equal((await registerUser(db, 'a@b', 'x')).ok, false)
    assert.equal((await registerUser(db, 'a@b.co', 'x')).ok, true)
  })

  it('rejects duplicate emails, ignoring case', async () => {
    let db = await createTestDatabase()
    await createUser(db, 'Cook@Example.com')
    assert.deepEqual(await registerUser(db, 'cook@example.com', 'x'), {
      ok: false,
      error: 'Username already taken',
    })
  })

  it('authenticates with the right password only', async () => {
    let db = await createTestDatabase()
    let user = await createUser(db)
    assert.deepEqual(await authenticateUser(db, 'COOK@example.com', TEST_PASSWORD), user)
    assert.equal(await authenticateUser(db, 'cook@example.com', 'nope'), null)
    assert.equal(await authenticateUser(db, 'missing@example.com', TEST_PASSWORD), null)
  })

  it('sets a new password', async () => {
    let db = await createTestDatabase()
    await createUser(db)
    assert.equal(await setPassword(db, 'cook@example.com', 'new password'), true)
    assert.ok(await authenticateUser(db, 'cook@example.com', 'new password'))
    assert.equal(await setPassword(db, 'missing@example.com', 'x'), false)
  })
})

describe('passwords', () => {
  it('hashes with a random salt and verifies', async () => {
    let a = await hashPassword('secret')
    let b = await hashPassword('secret')
    assert.notEqual(a, b)
    assert.match(a, /^scrypt\$16384\$8\$1\$/)
    assert.equal(await verifyPassword('secret', a), true)
    assert.equal(await verifyPassword('Secret', a), false)
  })

  it('never verifies the unusable placeholder or a BCrypt hash', async () => {
    assert.equal(await verifyPassword('', UNUSABLE_PASSWORD_HASH), false)
    assert.equal(
      await verifyPassword('pw', '$2a$10$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012'),
      false,
    )
  })
})
