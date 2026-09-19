import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth'
import { authRoutes } from './routes/auth.routes'
import type { Bindings, Variables } from './types'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', cors({
	origin: '*',
	allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
	allowHeaders: ['Content-Type', 'Authorization'],
}))

app.use('/api/*', authMiddleware)

app.route('/api/auth', authRoutes)

app.get('/health', (c) => c.json({ ok: true }))

app.onError((err, c) => {
	console.error(err)
	return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
