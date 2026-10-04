import { fileURLToPath } from 'node:url'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createTestDatabase, createUser } from '../test/db.ts'
import { getMeal, listMeals } from '../app/data/groceries/meals.ts'
import { listRecentOrders } from '../app/data/groceries/orders.ts'
import { UNUSABLE_PASSWORD_HASH } from '../app/data/groceries/passwords.ts'
import { krogerConfigs, krogerTokens, users } from '../app/data/groceries/tables.ts'
import { authenticateUser, setPassword } from '../app/data/groceries/users.ts'
import { importH2Export, parseCsv, timestamp } from './h2-import.ts'

const fixture = fileURLToPath(new URL('../test/fixtures/h2-export/', import.meta.url))

describe('parseCsv', () => {
  it('reads H2 CSVWRITE output, keeping NULL distinct from empty strings', () => {
    assert.deepEqual(parseCsv('"A","B","C"\n"1",,""\n"x ""y"", z",,\n'), [
      { A: '1', B: null, C: '' },
      { A: 'x "y", z', B: null, C: null },
    ])
  })

  it('handles CRLF line endings and a missing final newline', () => {
    assert.deepEqual(parseCsv('"A","B"\r\n"1","2"\r\n"3",'), [
      { A: '1', B: '2' },
      { A: '3', B: null },
    ])
  })
})

describe('timestamp', () => {
  it('converts H2 timestamps with zones to ISO UTC', () => {
    assert.equal(timestamp('2026-10-04 20:01:41.046341+00'), '2026-10-04T20:01:41.046Z')
    assert.equal(timestamp('2026-10-04 14:00:00-06'), '2026-10-04T20:00:00.000Z')
    assert.equal(timestamp('2026-10-04 14:00:00+05:30'), '2026-10-04T08:30:00.000Z')
  })

  it('rejects anything else', () => {
    assert.throws(() => timestamp('yesterday'), /Unrecognized timestamp/)
  })
})

describe('importH2Export', () => {
  it('imports the Spring app data with ids preserved', async () => {
    let db = await createTestDatabase()
    let report = await importH2Export(db, fixture)

    assert.deepEqual(report.imported, {
      users: 1,
      meals: 2,
      ingredients: 8,
      kroger_configs: 1,
      kroger_tokens: 1,
      orders: 1,
      order_meals: 2,
    })
    assert.deepEqual(report.skipped, ['meal 4 (Orphan, "quoted" meal): no owner'])

    let user = await db.find(users, 1)
    assert.equal(user?.email, 'demo@example.com')
    assert.equal(user?.password_hash, UNUSABLE_PASSWORD_HASH)

    assert.deepEqual(
      (await listMeals(db, 1)).map((m) => [m.id, m.name, m.ingredientCount]),
      [
        [2, 'Chili', 3],
        [1, 'Tacos', 5],
      ],
    )
    let tacos = await getMeal(db, 1, 1)
    assert.deepEqual(
      tacos?.ingredients.map((i) => [i.id, i.name, i.quantity]),
      [
        [1, 'ground beef', '2 lb'],
        [2, 'red onion', '1'],
        [3, 'salt', null],
        [4, 'salsa', '1/2 cup'],
        [5, 'garlic', '3 cloves'],
      ],
    )

    let [order] = await listRecentOrders(db, 1)
    assert.deepEqual(order, { id: 1, createdAt: '2026-10-04T20:01:41.046Z', mealNames: ['Tacos', 'Chili'] })

    let config = await db.find(krogerConfigs, 1)
    assert.deepEqual([config?.client_id, config?.location_name], ['cid', 'Kroger Midtown'])
    assert.equal(await db.find(krogerTokens, { user_id: 1, grant_type: 'CLIENT' }), null)
    let token = await db.find(krogerTokens, { user_id: 1, grant_type: 'USER' })
    assert.deepEqual([token?.refresh_token, token?.expires_at], ['user-refresh', '2026-10-04T21:00:00.000Z'])
  })

  it('keeps new ids after the imported ones', async () => {
    let db = await createTestDatabase()
    await importH2Export(db, fixture)
    let next = await createUser(db, 'new@example.com')
    assert.equal(next.id, 2)
  })

  it('requires a password reset before the imported user can sign in', async () => {
    let db = await createTestDatabase()
    await importH2Export(db, fixture)
    assert.equal(await authenticateUser(db, 'demo@example.com', ''), null)
    await setPassword(db, 'demo@example.com', 'new password')
    assert.ok(await authenticateUser(db, 'demo@example.com', 'new password'))
  })

  it('refuses to import into a database that already has data', async () => {
    let db = await createTestDatabase()
    await createUser(db)
    await assert.rejects(importH2Export(db, fixture), /already has groceries_users rows/)
  })

  it('rolls back everything when a row fails', async () => {
    let db = await createTestDatabase()
    let broken = fileURLToPath(new URL('../test/fixtures/h2-export-broken/', import.meta.url))
    await assert.rejects(importH2Export(db, broken))
    assert.deepEqual(await db.findMany(users, {}), [])
  })
})
