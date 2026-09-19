import { sign, verify } from 'hono/jwt'

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30

export function issueToken(userId: string, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + THIRTY_DAYS_SECONDS
  return sign({ sub: userId, exp }, secret)
}

export function verifyToken(token: string, secret: string) {
  return verify(token, secret, 'HS256')
}
