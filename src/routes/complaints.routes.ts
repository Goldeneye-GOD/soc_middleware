import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const complaintsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

complaintsRoutes.get('/', async (c) => {
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident', 'security'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM complaints WHERE society_id = ? ORDER BY created_at DESC'
  )
    .bind(societyId)
    .all()

  return c.json(results)
})

complaintsRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin', 'resident'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO complaints
      (id, society_id, ticket_no, category, title, description, priority, status, raised_by_uid, unit_id, assigned_to_staff_id, due_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.societyId,
      body.ticketNo ?? null,
      body.category ?? null,
      body.title,
      body.description ?? '',
      body.priority ?? 'medium',
      body.status ?? 'open',
      c.get('userId'),
      body.unitId ?? null,
      body.assignedToStaffId ?? null,
      body.dueAt ?? null,
    )
    .run()

  return c.json({ id }, 201)
})

complaintsRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin', 'security'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `UPDATE complaints
     SET status = ?, priority = ?, assigned_to_staff_id = ?, resolved_at = ?, rating = ?, feedback = ?
     WHERE id = ?`
  )
    .bind(
      body.status ?? null,
      body.priority ?? null,
      body.assignedToStaffId ?? null,
      body.resolvedAt ?? null,
      body.rating ?? null,
      body.feedback ?? null,
      id,
    )
    .run()

  return c.json({ ok: true })
})
