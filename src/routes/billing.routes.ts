import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const billingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

billingRoutes.get('/bills', async (c) => {
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM bills WHERE society_id = ? ORDER BY generated_at DESC'
  )
    .bind(societyId)
    .all()

  return c.json(results)
})

billingRoutes.post('/bills', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO bills (id, society_id, unit_id, period, sub_total, late_fee, total, paid_amount, balance, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.societyId,
      body.unitId,
      body.period,
      body.subTotal,
      body.lateFee ?? 0,
      body.total,
      body.paidAmount ?? 0,
      body.balance,
      body.dueDate ?? null,
      body.status ?? 'unpaid',
    )
    .run()

  return c.json({ id }, 201)
})

billingRoutes.post('/payments', async (c) => {
  const body = await c.req.json()
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin', 'resident'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO payments (id, bill_id, amount, method, reference) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, body.billId, body.amount, body.method ?? 'upi', body.reference ?? null)
    .run()

  return c.json({ id }, 201)
})
