import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const amenitiesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

amenitiesRoutes.get('/', async (c) => {
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM amenities WHERE society_id = ? ORDER BY name ASC'
  )
    .bind(societyId)
    .all()

  return c.json(results)
})

amenitiesRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO amenities (id, society_id, name, description, capacity, slot_minutes, charge, needs_approval)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.societyId,
      body.name,
      body.description ?? null,
      body.capacity ?? null,
      body.slotMinutes ?? 60,
      body.charge ?? 0,
      body.needsApproval ? 1 : 0,
    )
    .run()

  return c.json({ id }, 201)
})

amenitiesRoutes.post('/bookings', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin', 'resident'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO bookings (id, amenity_id, unit_id, booked_by_uid, start_at, end_at, status, charge)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.amenityId,
      body.unitId,
      c.get('userId'),
      body.startAt,
      body.endAt,
      body.status ?? 'confirmed',
      body.charge ?? 0,
    )
    .run()

  return c.json({ id }, 201)
})
