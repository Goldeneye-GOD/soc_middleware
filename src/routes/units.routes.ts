import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const unitsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

unitsRoutes.get('/', async (c) => {
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident', 'security'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare('SELECT * FROM units WHERE society_id = ?')
    .bind(societyId)
    .all()

  return c.json(results)
})

unitsRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const id = newId()

  await c.env.DB.prepare(
    `INSERT INTO units (id, society_id, block_id, flat_no, floor, type, area_sqft)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.societyId,
      body.blockId ?? null,
      body.flatNo,
      body.floor ?? null,
      body.type ?? null,
      body.areaSqft ?? null,
    )
    .run()

  return c.json({ id }, 201)
})

unitsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident', 'security'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const unit = await c.env.DB.prepare('SELECT * FROM units WHERE id = ? AND society_id = ?')
    .bind(id, societyId)
    .first()

  if (!unit) return c.json({ error: 'Not found' }, 404)
  return c.json(unit)
})

unitsRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `UPDATE units SET occupancy = ?, owner_user_id = ?, tenant_user_id = ? WHERE id = ?`
  )
    .bind(body.occupancy, body.ownerUserId ?? null, body.tenantUserId ?? null, id)
    .run()

  return c.json({ ok: true })
})
