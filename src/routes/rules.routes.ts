import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const rulesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

rulesRoutes.get('/', async (c) => {
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident', 'security'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM rules WHERE society_id = ? ORDER BY sort_order ASC, updated_at DESC'
  )
    .bind(societyId)
    .all()

  return c.json(results)
})

rulesRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO rules
      (id, society_id, category, title, body, sort_order, version, effective_from, fine_amount, requires_acknowledgement, is_active, created_by_uid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.societyId,
      body.category ?? null,
      body.title,
      body.body,
      body.sortOrder ?? 0,
      body.version ?? 1,
      body.effectiveFrom ?? null,
      body.fineAmount ?? 0,
      body.requiresAcknowledgement ? 1 : 0,
      body.isActive ?? 1,
      c.get('userId'),
    )
    .run()

  return c.json({ id }, 201)
})

rulesRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `UPDATE rules SET title = ?, body = ?, category = ?, sort_order = ?, fine_amount = ?, requires_acknowledgement = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(
      body.title ?? null,
      body.body ?? null,
      body.category ?? null,
      body.sortOrder ?? null,
      body.fineAmount ?? null,
      body.requiresAcknowledgement ?? null,
      id,
    )
    .run()

  return c.json({ ok: true })
})
