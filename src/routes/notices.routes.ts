import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const noticesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

noticesRoutes.get('/', async (c) => {
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident', 'security'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notices WHERE society_id = ? ORDER BY publish_at DESC'
  )
    .bind(societyId)
    .all()

  return c.json(results)
})

noticesRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO notices (id, society_id, title, body, category, is_pinned, publish_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.societyId,
      body.title,
      body.body ?? null,
      body.category ?? null,
      body.isPinned ? 1 : 0,
      body.publishAt ?? new Date().toISOString(),
      body.expiresAt ?? null,
    )
    .run()

  return c.json({ id }, 201)
})
