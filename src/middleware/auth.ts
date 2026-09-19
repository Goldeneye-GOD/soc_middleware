import type { MiddlewareHandler } from 'hono'
import { verifyToken } from '../utils/jwt'
import type { Bindings, Variables } from '../types'

export const authMiddleware: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> =
  async (c, next) => {
    if (c.req.path.startsWith('/api/auth/')) return next()

    const header = c.req.header('Authorization')
    if (!header?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    try {
      const payload = await verifyToken(header.slice(7), c.env.JWT_SECRET)
      c.set('userId', payload.sub as string)
      await next()
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }
  }
