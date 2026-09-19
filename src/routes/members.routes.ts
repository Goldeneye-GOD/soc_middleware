import { Hono } from 'hono'
import { requireRole } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const membersRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

membersRoutes.get('/', async (c) => {
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM members WHERE society_id = ? ORDER BY joined_at DESC'
  )
    .bind(societyId)
    .all()

  return c.json(results)
})

membersRoutes.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.societyId || !body.userId) {
    return c.json({ error: 'societyId and userId are required' }, 400)
  }

  const requester = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!requester) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `INSERT INTO members (society_id, user_id, role, status, unit_id, relation, approved_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.societyId,
      body.userId,
      body.role ?? 'resident',
      body.status ?? 'pending',
      body.unitId ?? null,
      body.relation ?? null,
      c.get('userId'),
    )
    .run()

  return c.json({ ok: true }, 201)
})

membersRoutes.patch('/:userId', async (c) => {
  const societyId = c.req.query('societyId')
  const userId = c.req.param('userId')

  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const requester = await requireRole(c, societyId, ['admin', 'superAdmin'])
  if (!requester) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()

  await c.env.DB.prepare(
    `UPDATE members
     SET role = ?, status = ?, unit_id = ?, relation = ?, approved_by = ?
     WHERE society_id = ? AND user_id = ?`
  )
    .bind(
      body.role ?? null,
      body.status ?? null,
      body.unitId ?? null,
      body.relation ?? null,
      c.get('userId'),
      societyId,
      userId,
    )
    .run()

  return c.json({ ok: true })
})
