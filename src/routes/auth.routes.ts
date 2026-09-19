import { Hono } from 'hono'
import { hashPassword, verifyPassword } from '../utils/password'
import { issueToken } from '../utils/jwt'
import { newId } from '../utils/id'
import type { Bindings, Variables } from '../types'

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

authRoutes.post('/signup', async (c) => {
  const { name, email, phone, password } = await c.req.json()
  if (!name || !email || !password) {
    return c.json({ error: 'name, email and password are required' }, 400)
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email).first()
  if (existing) return c.json({ error: 'Email already registered' }, 409)

  const id = newId()
  const passwordHash = await hashPassword(password)

  await c.env.DB.prepare(
    `INSERT INTO users (id, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, name, email, phone ?? null, passwordHash).run()

  const token = await issueToken(id, c.env.JWT_SECRET)
  return c.json({ token, userId: id }, 201)
})

authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: 'email and password are required' }, 400)

  const user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .bind(email).first<{ id: string; password_hash: string }>()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await issueToken(user.id, c.env.JWT_SECRET)
  return c.json({ token, userId: user.id })
})
