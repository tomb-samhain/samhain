import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// Stored as scrypt$N$r$p$salt$hash (base64url) so parameters can change later.
const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 64

// Written by the H2 import for accounts whose BCrypt hash was not carried over.
export const UNUSABLE_PASSWORD_HASH = '!'

function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 256 * n * r }, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  let salt = randomBytes(16)
  let key = await derive(password, salt, N, R, P)
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  let [algorithm, n, r, p, salt, hash] = stored.split('$')
  if (algorithm !== 'scrypt' || !hash) return false

  let expected = Buffer.from(hash, 'base64url')
  let key = await derive(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p))
  return key.length === expected.length && timingSafeEqual(key, expected)
}
