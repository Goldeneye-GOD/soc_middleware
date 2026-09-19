import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth'
import { authRoutes } from './routes/auth.routes'
import { societiesRoutes } from './routes/societies.routes'
import { membersRoutes } from './routes/members.routes'
import { unitsRoutes } from './routes/units.routes'
import { visitorsRoutes } from './routes/visitors.routes'
import { rulesRoutes } from './routes/rules.routes'
import { complaintsRoutes } from './routes/complaints.routes'
import { billingRoutes } from './routes/billing.routes'
import { amenitiesRoutes } from './routes/amenities.routes'
import { noticesRoutes } from './routes/notices.routes'
import { emergencyContactsRoutes } from './routes/emergency-contacts.routes'
import type { Bindings, Variables } from './types'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', cors({
	origin: '*',
	allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
	allowHeaders: ['Content-Type', 'Authorization'],
}))

app.use('/api/*', authMiddleware)

app.route('/api/auth', authRoutes)
app.route('/api/societies', societiesRoutes)
app.route('/api/members', membersRoutes)
app.route('/api/units', unitsRoutes)
app.route('/api/visitors', visitorsRoutes)
app.route('/api/rules', rulesRoutes)
app.route('/api/complaints', complaintsRoutes)
app.route('/api/billing', billingRoutes)
app.route('/api/amenities', amenitiesRoutes)
app.route('/api/notices', noticesRoutes)
app.route('/api/emergency-contacts', emergencyContactsRoutes)

app.get('/health', (c) => c.json({ ok: true }))

app.onError((err, c) => {
	console.error(err)
	return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
