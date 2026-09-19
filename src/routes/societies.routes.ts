import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const societiesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

societiesRoutes.get('/', async (c) => {
  const userId = c.get('userId')

  const { results } = await c.env.DB.prepare(
    'SELECT s.* FROM societies s INNER JOIN members m ON m.society_id = s.id WHERE m.user_id = ? AND m.status = ? ORDER BY s.created_at DESC'
  )
    .bind(userId, 'approved')
    .all()

  return c.json(results)
})

societiesRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.name) return c.json({ error: 'name is required' }, 400)

  const id = newId()
  const userId = c.get('userId')

  await c.env.DB.prepare(
    'INSERT INTO societies (id, name, address) VALUES (?, ?, ?)'
  )
    .bind(id, body.name, body.address ?? null)
    .run()

  await c.env.DB.prepare(
    `INSERT INTO members (society_id, user_id, role, status, unit_id, relation, approved_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, userId, 'superAdmin', 'approved', null, null, userId)
    .run()

  return c.json({ id }, 201)
})

societiesRoutes.get('/:id', async (c) => {
  const societyId = c.req.param('id')
  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident', 'security'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const society = await c.env.DB.prepare('SELECT * FROM societies WHERE id = ?').bind(societyId).first()
  if (!society) return c.json({ error: 'Not found' }, 404)

  return c.json(society)
})
