import type { Context } from 'hono'
import type { Bindings, Variables } from '../types'

type Member = { role: string; status: string; unit_id: string | null }

/** Looks up the caller's membership for a society and checks role + approval. */
export async function requireRole(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  societyId: string,
  allowedRoles: string[],
): Promise<Member | null> {
  const userId = c.get('userId')
  const member = await c.env.DB.prepare(
    `SELECT role, status, unit_id FROM members WHERE society_id = ? AND user_id = ?`
  ).bind(societyId, userId).first<Member>()

  if (!member || member.status !== 'approved') return null
  if (!allowedRoles.includes(member.role)) return null
  return member
}

/** For resident-scoped resources: confirms the target unit belongs to this member. */
export function ownsUnit(member: Member, unitId: string): boolean {
  return member.role !== 'resident' || member.unit_id === unitId
}
