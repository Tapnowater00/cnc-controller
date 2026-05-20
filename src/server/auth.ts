import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// Token-based auth with a single shared password. The password is hashed with
// scrypt and stored in the JSON store; tokens are random and held in memory
// only (a server restart logs everyone out, which is fine for a CNC controller).

const TOKEN_BYTES = 32
const SALT_BYTES = 16
const KEY_LEN = 64

export interface PasswordRecord {
  salt: string  // hex
  hash: string  // hex
}

export function hashPassword(password: string): PasswordRecord {
  const salt = randomBytes(SALT_BYTES)
  const hash = scryptSync(password, salt, KEY_LEN)
  return { salt: salt.toString('hex'), hash: hash.toString('hex') }
}

export function verifyPassword(password: string, record: PasswordRecord): boolean {
  const salt = Buffer.from(record.salt, 'hex')
  const expected = Buffer.from(record.hash, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export class TokenStore {
  private tokens = new Set<string>()

  issue(): string {
    const t = randomBytes(TOKEN_BYTES).toString('base64url')
    this.tokens.add(t)
    return t
  }

  isValid(token: string | undefined | null): boolean {
    if (!token) return false
    return this.tokens.has(token)
  }

  revoke(token: string): void {
    this.tokens.delete(token)
  }
}
