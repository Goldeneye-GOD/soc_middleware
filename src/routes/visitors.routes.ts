import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole, ownsUnit } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const visitorsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

visitorsRoutes.get('/pending', async (c) => {
  const societyId = c.req.query('societyId')
  const unitId = c.req.query('unitId')

  if (!societyId || !unitId) {
    return c.json({ error: 'societyId and unitId are required' }, 400)
  }

  const member = await requireRole(c, societyId, ['resident', 'admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)
  if (!ownsUnit(member, unitId)) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM visitors WHERE unit_id = ? AND status = 'pending' ORDER BY requested_at DESC`
  )
    .bind(unitId)
    .all()

  return c.json(results)
})

visitorsRoutes.get('/inside', async (c) => {
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['security', 'admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM visitors WHERE society_id = ? AND status = 'checkedIn' ORDER BY entry_at DESC`
  )
    .bind(societyId)
    .all()

  return c.json(results)
})

visitorsRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['security', 'admin', 'superAdmin', 'resident'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)
  if (member.role === 'resident' && !ownsUnit(member, body.unitId)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const id = newId()

  await c.env.DB.prepare(
    `INSERT INTO visitors
      (id, society_id, unit_id, name, phone, type, purpose, logged_by_uid, is_pre_approved)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.societyId,
      body.unitId,
      body.name,
      body.phone ?? null,
      body.type ?? 'guest',
      body.purpose ?? null,
      c.get('userId'),
      body.isPreApproved ? 1 : 0,
    )
    .run()

  return c.json({ id }, 201)
})

visitorsRoutes.post('/:id/respond', async (c) => {
  const id = c.req.param('id')
  const { societyId, status } = await c.req.json()

  if (!['approved', 'denied', 'leaveAtGate'].includes(status)) {
    return c.json({ error: 'Invalid status' }, 400)
  }

  const member = await requireRole(c, societyId, ['resident', 'admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const visitor = await c.env.DB.prepare('SELECT unit_id FROM visitors WHERE id = ?')
    .bind(id)
    .first<{ unit_id: string }>()

  if (!visitor) return c.json({ error: 'Not found' }, 404)
  if (!ownsUnit(member, visitor.unit_id)) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `UPDATE visitors SET status = ?, responded_by_uid = ?, responded_at = datetime('now') WHERE id = ?`
  )
    .bind(status, c.get('userId'), id)
    .run()

  return c.json({ ok: true })
})

visitorsRoutes.post('/:id/check-in', async (c) => {
  const id = c.req.param('id')
  const { societyId } = await c.req.json()
  const member = await requireRole(c, societyId, ['security', 'admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `UPDATE visitors SET status = 'checkedIn', entry_at = datetime('now') WHERE id = ?`
  )
    .bind(id)
    .run()

  return c.json({ ok: true })
})

visitorsRoutes.post('/:id/check-out', async (c) => {
  const id = c.req.param('id')
  const { societyId } = await c.req.json()
  const member = await requireRole(c, societyId, ['security', 'admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `UPDATE visitors SET status = 'checkedOut', exit_at = datetime('now') WHERE id = ?`
  )
    .bind(id)
    .run()

  return c.json({ ok: true })
})
