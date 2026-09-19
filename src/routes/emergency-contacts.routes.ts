import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const emergencyContactsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

emergencyContactsRoutes.get('/', async (c) => {
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident', 'security'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM emergency_contacts WHERE society_id = ? ORDER BY label ASC'
  )
    .bind(societyId)
    .all()

  return c.json(results)
})

emergencyContactsRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO emergency_contacts (id, society_id, label, phone, category)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, body.societyId, body.label, body.phone, body.category ?? null)
    .run()

  return c.json({ id }, 201)
})
