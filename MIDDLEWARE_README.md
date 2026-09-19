# Society Manager API — Middleware (Cloudflare Worker + D1)

This is the **backend/middleware** for the Society Manager app. It's a Cloudflare Worker, written with **Hono**, that sits between the Flutter client and **Cloudflare D1**. D1 has no client SDK, so this Worker is the only thing allowed to read or write it — every request from the app goes through here.

```
Flutter App  ──HTTPS/JSON, Bearer JWT──▶  This Worker (Hono)  ──D1 binding──▶  Cloudflare D1
```

This README is self-contained: follow it top to bottom to generate the whole project from scratch.

---

## 📑 Table of Contents

1. [Responsibilities of this service](#-responsibilities-of-this-service)
2. [Tech Stack](#-tech-stack)
3. [Project Structure](#-project-structure)
4. [Setup — Step by Step](#-setup--step-by-step)
5. [Database Schema](#-database-schema)
6. [Environment Variables & Secrets](#-environment-variables--secrets)
7. [Core Source Files](#-core-source-files)
8. [Route Reference](#-route-reference)
9. [Authorization Pattern](#-authorization-pattern)
10. [Local Development](#-local-development)
11. [Testing Endpoints](#-testing-endpoints)
12. [Deployment](#-deployment)
13. [Multiple Environments (staging/production)](#-multiple-environments-stagingproduction)
14. [Error Handling Conventions](#-error-handling-conventions)
15. [Security Checklist](#-security-checklist)
16. [Roadmap](#-roadmap)

---

## 🎯 Responsibilities of this service

- **Authentication** — email/password signup & login, issuing and verifying JWTs.
- **Authorization** — every route checks the caller's role and unit/society ownership before touching a row. There is no declarative rules engine here (unlike Firestore) — this Worker *is* the security layer.
- **Data access** — all CRUD for societies, units, members, visitors, rules, complaints, billing, amenities and notices, backed by D1.
- **Nothing UI-related.** This service returns JSON only. All rendering, state management and navigation live in the Flutter app.

---

## 🧰 Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Cloudflare Workers |
| Router / framework | [Hono](https://hono.dev) |
| Database | Cloudflare D1 (serverless SQLite) |
| Auth | Custom email/password, JWT via `hono/jwt` |
| Password hashing | `bcryptjs` |
| ID generation | `nanoid` |
| CLI / deploy | `wrangler` |
| Language | TypeScript |

---

## 📂 Project Structure

```
society-manager-api/
├── wrangler.toml
├── package.json
├── tsconfig.json
├── schema.sql                     # D1 table definitions — run once per environment
├── seed.sql                       # optional: sample data for local dev
└── src/
    ├── index.ts                   # Hono app entry — mounts middleware + all routers
    ├── types.ts                   # Bindings (env vars/bindings) & Variables (per-request context)
    ├── middleware/
    │   ├── auth.ts                 # verifies JWT, sets userId on context
    │   └── authorize.ts             # requireRole() + ownership helpers
    ├── utils/
    │   ├── jwt.ts                   # issueToken / verifyToken wrappers
    │   ├── password.ts               # hash / compare wrappers
    │   └── id.ts                     # nanoid wrapper
    └── routes/
        ├── auth.routes.ts
        ├── societies.routes.ts
        ├── members.routes.ts
        ├── units.routes.ts
        ├── visitors.routes.ts
        ├── rules.routes.ts
        ├── complaints.routes.ts
        ├── billing.routes.ts
        ├── amenities.routes.ts
        └── notices.routes.ts
```

---

## 🛠️ Setup — Step by Step

### 1. Prerequisites

- Node.js 18+
- A Cloudflare account
- Wrangler CLI: `npm install -g wrangler`
- Log in once: `wrangler login`

### 2. Scaffold the project

```bash
npm create hono@latest society-manager-api
# When prompted for a template, choose: cloudflare-workers
cd society-manager-api
npm install
npm install hono bcryptjs nanoid
npm install -D @types/bcryptjs wrangler typescript
```

### 3. Create (or confirm) your D1 database

If you haven't already:

```bash
wrangler d1 create society_manager_db
```

This prints a `database_id` — copy it, you'll need it for `wrangler.toml`. If you already created the D1 database (as you mentioned), just fetch its ID:

```bash
wrangler d1 list
```

### 4. Configure `wrangler.toml`

```toml
name = "society-manager-api"
main = "src/index.ts"
compatibility_date = "2026-09-01"

[[d1_databases]]
binding = "DB"                        # accessed in code as env.DB
database_name = "society_manager_db"
database_id = "<paste-your-database-id-here>"
```

> Do **not** put `JWT_SECRET` or any password in `wrangler.toml` — that file is typically committed to git. Secrets go in via `wrangler secret put` (step 6).

### 5. Apply the schema

```bash
# local (creates a local SQLite emulation for `wrangler dev`)
wrangler d1 execute society_manager_db --file=./schema.sql --local

# remote (the real production D1 instance)
wrangler d1 execute society_manager_db --file=./schema.sql --remote
```

### 6. Set the JWT secret

Generate a strong random value:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then store it as a Worker secret (never in code or `wrangler.toml`):

```bash
wrangler secret put JWT_SECRET
# paste the generated string when prompted
```

### 7. Run it locally

```bash
wrangler dev
```

Your API is now live at `http://localhost:8787`.

### 8. Deploy

```bash
wrangler deploy
```

This prints your live URL, e.g. `https://society-manager-api.<your-subdomain>.workers.dev` — this is the `API_BASE_URL` the Flutter app needs.

---

## 🗄️ Database Schema

`schema.sql` — run this against D1 before the API can do anything useful.

```sql
-- ===================== USERS & MEMBERSHIP =====================

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  photo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE societies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE members (
  society_id TEXT NOT NULL REFERENCES societies(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('superAdmin','admin','resident','security')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  unit_id TEXT,
  relation TEXT CHECK (relation IN ('owner','tenant','family')),
  joined_at TEXT DEFAULT (datetime('now')),
  approved_by TEXT,
  PRIMARY KEY (society_id, user_id)
);

-- ===================== BLOCKS & UNITS =====================

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  name TEXT NOT NULL,
  floors INTEGER,
  units_per_floor INTEGER
);

CREATE TABLE units (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  block_id TEXT REFERENCES blocks(id),
  flat_no TEXT NOT NULL,
  floor INTEGER,
  type TEXT,
  area_sqft INTEGER,
  occupancy TEXT DEFAULT 'vacant' CHECK (occupancy IN ('ownerOccupied','rented','vacant','underConstruction')),
  owner_user_id TEXT REFERENCES users(id),
  tenant_user_id TEXT REFERENCES users(id),
  maintenance_rate REAL DEFAULT 0,
  outstanding_amount REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  type TEXT CHECK (type IN ('car','bike','other')),
  plate TEXT NOT NULL,
  parking_slot TEXT
);

-- ===================== SECURITY & VISITORS =====================

CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  type TEXT DEFAULT 'guest' CHECK (type IN ('guest','delivery','cab','serviceStaff','domesticHelp')),
  company TEXT,
  purpose TEXT,
  vehicle_no TEXT,
  person_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','leaveAtGate','checkedIn','checkedOut','expired')),
  logged_by_uid TEXT REFERENCES users(id),
  gate TEXT DEFAULT 'Main Gate',
  is_pre_approved INTEGER DEFAULT 0,
  pass_code TEXT,
  requested_at TEXT DEFAULT (datetime('now')),
  responded_by_uid TEXT,
  responded_at TEXT,
  entry_at TEXT,
  exit_at TEXT
);

CREATE INDEX idx_visitors_unit_status ON visitors(unit_id, status);
CREATE INDEX idx_visitors_society_status ON visitors(society_id, status);

CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  type TEXT,
  description TEXT,
  severity TEXT CHECK (severity IN ('low','medium','high')),
  gate TEXT,
  reported_by_uid TEXT REFERENCES users(id),
  occurred_at TEXT DEFAULT (datetime('now')),
  action_taken TEXT
);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  shift TEXT,
  gate TEXT,
  is_active INTEGER DEFAULT 1
);

-- ===================== RULES =====================

CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  category TEXT CHECK (category IN ('general','parking','pets','noise','waste','amenities','renovation','visitors','fines')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  effective_from TEXT,
  fine_amount REAL DEFAULT 0,
  requires_acknowledgement INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by_uid TEXT REFERENCES users(id),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE rule_acknowledgements (
  rule_id TEXT NOT NULL REFERENCES rules(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL,
  acked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (rule_id, user_id)
);

-- ===================== COMPLAINTS =====================

CREATE TABLE complaints (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  ticket_no TEXT,
  category TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','assigned','inProgress','resolved','closed','reopened')),
  raised_by_uid TEXT NOT NULL REFERENCES users(id),
  unit_id TEXT REFERENCES units(id),
  assigned_to_staff_id TEXT REFERENCES staff(id),
  created_at TEXT DEFAULT (datetime('now')),
  due_at TEXT,
  resolved_at TEXT,
  rating INTEGER,
  feedback TEXT
);

CREATE INDEX idx_complaints_status ON complaints(society_id, status);
CREATE INDEX idx_complaints_raised_by ON complaints(raised_by_uid);

-- ===================== BILLING =====================

CREATE TABLE bills (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  period TEXT NOT NULL,
  sub_total REAL NOT NULL,
  late_fee REAL DEFAULT 0,
  total REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  balance REAL NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','overdue')),
  generated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE bill_line_items (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id),
  label TEXT NOT NULL,
  amount REAL NOT NULL
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id),
  amount REAL NOT NULL,
  method TEXT CHECK (method IN ('upi','cheque','cash','card')),
  reference TEXT,
  paid_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_bills_unit_period ON bills(unit_id, period);
CREATE INDEX idx_bills_status ON bills(society_id, status);

-- ===================== NOTICES, AMENITIES, MISC =====================

CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  title TEXT NOT NULL,
  body TEXT,
  category TEXT,
  is_pinned INTEGER DEFAULT 0,
  publish_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE TABLE amenities (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  name TEXT NOT NULL,
  description TEXT,
  capacity INTEGER,
  slot_minutes INTEGER DEFAULT 60,
  charge REAL DEFAULT 0,
  needs_approval INTEGER DEFAULT 0
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  amenity_id TEXT NOT NULL REFERENCES amenities(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  booked_by_uid TEXT NOT NULL REFERENCES users(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  charge REAL DEFAULT 0
);

CREATE INDEX idx_bookings_amenity_time ON bookings(amenity_id, start_at);

CREATE TABLE emergency_contacts (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES societies(id),
  label TEXT NOT NULL,
  phone TEXT NOT NULL,
  category TEXT
);
```

### Re-running migrations

D1 doesn't auto-migrate. If you change `schema.sql` after tables already exist, write a separate `migrations/00X_description.sql` with `ALTER TABLE` statements and apply it the same way:

```bash
wrangler d1 execute society_manager_db --file=./migrations/002_add_photo_url.sql --remote
```

---

## 🔑 Environment Variables & Secrets

| Name | Where it lives | Purpose |
|---|---|---|
| `DB` | `wrangler.toml` binding | D1 database handle, available as `env.DB` |
| `JWT_SECRET` | `wrangler secret put JWT_SECRET` | Signs/verifies auth tokens — **never commit this** |

Check what secrets are currently set (values are hidden):

```bash
wrangler secret list
```

---

## 📄 Core Source Files

### `src/types.ts`

```ts
export type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export type Variables = {
  userId: string
}
```

### `src/utils/id.ts`

```ts
import { nanoid } from 'nanoid'
export const newId = () => nanoid()
```

### `src/utils/password.ts`

```ts
import { hash, compare } from 'bcryptjs'

export const hashPassword = (plain: string) => hash(plain, 10)
export const verifyPassword = (plain: string, hashed: string) => compare(plain, hashed)
```

### `src/utils/jwt.ts`

```ts
import { sign, verify } from 'hono/jwt'

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30

export function issueToken(userId: string, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + THIRTY_DAYS_SECONDS
  return sign({ sub: userId, exp }, secret)
}

export function verifyToken(token: string, secret: string) {
  return verify(token, secret) // throws if invalid/expired
}
```

### `src/middleware/auth.ts`

```ts
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
```

### `src/middleware/authorize.ts`

```ts
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
```

### `src/routes/auth.routes.ts`

```ts
import { Hono } from 'hono'
import { hashPassword, verifyPassword } from '../utils/password'
import { issueToken } from '../utils/jwt'
import { newId } from '../utils/id'
import type { Bindings, Variables } from '../types'

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

authRoutes.post('/signup', async (c) => {
  const { name, email, phone, password } = await c.req.json()
  if (!name || !email || !password) {
    return c.json({ error: 'name, email and password are required' }, 400)
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email).first()
  if (existing) return c.json({ error: 'Email already registered' }, 409)

  const id = newId()
  const passwordHash = await hashPassword(password)

  await c.env.DB.prepare(
    `INSERT INTO users (id, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, name, email, phone ?? null, passwordHash).run()

  const token = await issueToken(id, c.env.JWT_SECRET)
  return c.json({ token, userId: id }, 201)
})

authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: 'email and password are required' }, 400)

  const user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .bind(email).first<{ id: string; password_hash: string }>()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await issueToken(user.id, c.env.JWT_SECRET)
  return c.json({ token, userId: user.id })
})
```

### `src/routes/units.routes.ts` (example CRUD router)

```ts
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
    .bind(societyId).all()
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
  ).bind(id, body.societyId, body.blockId ?? null, body.flatNo, body.floor ?? null,
         body.type ?? null, body.areaSqft ?? null).run()

  return c.json({ id }, 201)
})

unitsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const societyId = c.req.query('societyId')
  if (!societyId) return c.json({ error: 'societyId is required' }, 400)

  const member = await requireRole(c, societyId, ['admin', 'superAdmin', 'resident', 'security'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const unit = await c.env.DB.prepare('SELECT * FROM units WHERE id = ? AND society_id = ?')
    .bind(id, societyId).first()
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
  ).bind(body.occupancy, body.ownerUserId ?? null, body.tenantUserId ?? null, id).run()

  return c.json({ ok: true })
})
```

### `src/routes/visitors.routes.ts` (example with unit-ownership check)

```ts
import { Hono } from 'hono'
import { newId } from '../utils/id'
import { requireRole, ownsUnit } from '../middleware/authorize'
import type { Bindings, Variables } from '../types'

export const visitorsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

visitorsRoutes.get('/pending', async (c) => {
  const societyId = c.req.query('societyId')!
  const unitId = c.req.query('unitId')!

  const member = await requireRole(c, societyId, ['resident', 'admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)
  if (!ownsUnit(member, unitId)) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM visitors WHERE unit_id = ? AND status = 'pending' ORDER BY requested_at DESC`
  ).bind(unitId).all()
  return c.json(results)
})

visitorsRoutes.get('/inside', async (c) => {
  const societyId = c.req.query('societyId')!
  const member = await requireRole(c, societyId, ['security', 'admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM visitors WHERE society_id = ? AND status = 'checkedIn' ORDER BY entry_at DESC`
  ).bind(societyId).all()
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
  ).bind(
    id, body.societyId, body.unitId, body.name, body.phone ?? null,
    body.type ?? 'guest', body.purpose ?? null, c.get('userId'),
    body.isPreApproved ? 1 : 0,
  ).run()

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
    .bind(id).first<{ unit_id: string }>()
  if (!visitor) return c.json({ error: 'Not found' }, 404)
  if (!ownsUnit(member, visitor.unit_id)) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `UPDATE visitors SET status = ?, responded_by_uid = ?, responded_at = datetime('now') WHERE id = ?`
  ).bind(status, c.get('userId'), id).run()

  return c.json({ ok: true })
})

visitorsRoutes.post('/:id/check-in', async (c) => {
  const id = c.req.param('id')
  const { societyId } = await c.req.json()
  const member = await requireRole(c, societyId, ['security', 'admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `UPDATE visitors SET status = 'checkedIn', entry_at = datetime('now') WHERE id = ?`
  ).bind(id).run()
  return c.json({ ok: true })
})

visitorsRoutes.post('/:id/check-out', async (c) => {
  const id = c.req.param('id')
  const { societyId } = await c.req.json()
  const member = await requireRole(c, societyId, ['security', 'admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare(
    `UPDATE visitors SET status = 'checkedOut', exit_at = datetime('now') WHERE id = ?`
  ).bind(id).run()
  return c.json({ ok: true })
})
```

> Build `rules.routes.ts`, `complaints.routes.ts`, `billing.routes.ts`, `amenities.routes.ts`, `notices.routes.ts` and `members.routes.ts` following the exact same three-part pattern in every handler: **(1)** parse input, **(2)** `requireRole` (+ `ownsUnit` where the resource is unit-scoped), **(3)** run the parameterized SQL query. Never string-concatenate SQL — always use `.bind()`.

### `src/index.ts`

```ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth'
import { authRoutes } from './routes/auth.routes'
import { unitsRoutes } from './routes/units.routes'
import { visitorsRoutes } from './routes/visitors.routes'
// import the rest of your routers as you build them:
// import { membersRoutes } from './routes/members.routes'
// import { rulesRoutes } from './routes/rules.routes'
// import { complaintsRoutes } from './routes/complaints.routes'
// import { billingRoutes } from './routes/billing.routes'
// import { amenitiesRoutes } from './routes/amenities.routes'
// import { noticesRoutes } from './routes/notices.routes'
import type { Bindings, Variables } from './types'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', cors({
  origin: '*',               // restrict to your app's origin(s) in production
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.use('/api/*', authMiddleware)

app.route('/api/auth', authRoutes)
app.route('/api/units', unitsRoutes)
app.route('/api/visitors', visitorsRoutes)
// app.route('/api/members', membersRoutes)
// app.route('/api/rules', rulesRoutes)
// app.route('/api/complaints', complaintsRoutes)
// app.route('/api/billing', billingRoutes)
// app.route('/api/amenities', amenitiesRoutes)
// app.route('/api/notices', noticesRoutes)

app.get('/health', (c) => c.json({ ok: true }))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
```

---

## 📡 Route Reference

Base URL: local `http://localhost:8787`, or your deployed Worker URL. All `/api/*` routes except `/api/auth/*` require `Authorization: Bearer <jwt>`.

| Method | Path | Roles allowed | Notes |
|---|---|---|---|
| POST | `/api/auth/signup` | public | `{ name, email, phone, password }` → `{ token, userId }` |
| POST | `/api/auth/login` | public | `{ email, password }` → `{ token, userId }` |
| GET | `/api/units?societyId=` | admin, superAdmin, resident, security | list units |
| POST | `/api/units` | admin, superAdmin | create unit |
| GET | `/api/units/:id?societyId=` | admin, superAdmin, resident, security | unit detail |
| PATCH | `/api/units/:id` | admin, superAdmin | update unit |
| GET | `/api/visitors/pending?societyId=&unitId=` | resident (own unit), admin, superAdmin | pending approvals |
| GET | `/api/visitors/inside?societyId=` | security, admin, superAdmin | who's on-premises now |
| POST | `/api/visitors` | security, admin, superAdmin, resident (own unit) | log an entry / pre-approve |
| POST | `/api/visitors/:id/respond` | resident (own unit), admin, superAdmin | `{ societyId, status }` |
| POST | `/api/visitors/:id/check-in` | security, admin, superAdmin | mark arrived |
| POST | `/api/visitors/:id/check-out` | security, admin, superAdmin | mark departed |
| GET | `/health` | public | uptime check |

Extend this table as you add `members`, `rules`, `complaints`, `billing`, `amenities`, `notices` routers.

---

## 🛡️ Authorization Pattern

Every protected handler follows the same three steps — copy this shape for every new route:

```ts
someRoutes.post('/something', async (c) => {
  const body = await c.req.json()

  // 1. Confirm the caller is an approved member with an allowed role
  const member = await requireRole(c, body.societyId, ['admin', 'superAdmin'])
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  // 2. If the resource is unit-scoped, confirm the caller owns that unit
  if (!ownsUnit(member, body.unitId)) return c.json({ error: 'Forbidden' }, 403)

  // 3. Run the parameterized query
  // ...
})
```

| Role | Typical access |
|---|---|
| `superAdmin` | Everything, any society |
| `admin` | Full CRUD within their own society |
| `resident` | Read/write limited to rows matching their own `unit_id` |
| `security` | Visitor & incident endpoints only — no billing, no complaints |

Because D1 has no row-level security of its own, **this middleware file is the single most safety-critical piece of the whole backend.** Any new route that skips `requireRole`/`ownsUnit` is a data leak.

---

## 🧪 Local Development

```bash
wrangler dev
```

- Runs on `http://localhost:8787` by default.
- Uses a **local** SQLite file to emulate D1 — safe to break, seed, and reset without touching production data.
- Add `--remote` only if you deliberately want to develop against the live D1 database (rare, and risky).

Reset your local D1 emulation:

```bash
rm -rf .wrangler/state/v3/d1
wrangler d1 execute society_manager_db --file=./schema.sql --local
```

---

## 🧫 Testing Endpoints

With `wrangler dev` running:

```bash
# Sign up
curl -X POST http://localhost:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Arun Menon","email":"arun@example.com","phone":"9876543210","password":"secret123"}'

# Login
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"arun@example.com","password":"secret123"}'

# Use the returned token for a protected call
curl "http://localhost:8787/api/units?societyId=soc_001" \
  -H "Authorization: Bearer <token-from-login>"
```

You'll get `403 Forbidden` on the units call until a `members` row exists for that user in `soc_001` with `status = 'approved'` — see the seeding note below.

### Seeding your first admin

Since only an admin can create a `members` row for someone else, and there's no admin yet, insert the first one directly:

```bash
wrangler d1 execute society_manager_db --local --command \
  "INSERT INTO societies (id, name) VALUES ('soc_001', 'Green Meadows')"

wrangler d1 execute society_manager_db --local --command \
  "INSERT INTO members (society_id, user_id, role, status) VALUES ('soc_001', '<your-user-id-from-signup>', 'superAdmin', 'approved')"
```

Swap `--local` for `--remote` to do the same against production once you're ready to launch.

---

## ☁️ Deployment

```bash
# 1. Make sure the schema is applied remotely
wrangler d1 execute society_manager_db --file=./schema.sql --remote

# 2. Make sure secrets are set
wrangler secret put JWT_SECRET   # if not already set

# 3. Deploy
wrangler deploy
```

Wrangler prints your live URL — that's the `API_BASE_URL` your Flutter app should point at.

---

## 🌎 Multiple Environments (staging/production)

```toml
# wrangler.toml
name = "society-manager-api"
main = "src/index.ts"
compatibility_date = "2026-09-01"

[env.staging]
name = "society-manager-api-staging"
[[env.staging.d1_databases]]
binding = "DB"
database_name = "society_manager_db_staging"
database_id = "<staging-db-id>"

[env.production]
name = "society-manager-api"
[[env.production.d1_databases]]
binding = "DB"
database_name = "society_manager_db"
database_id = "<production-db-id>"
```

```bash
wrangler deploy --env staging
wrangler deploy --env production
wrangler secret put JWT_SECRET --env staging
wrangler secret put JWT_SECRET --env production
```

Use different secrets per environment.

---

## ⚠️ Error Handling Conventions

Keep responses consistent so the Flutter client can handle them uniformly:

| Status | Meaning | Body shape |
|---|---|---|
| `400` | Bad request — missing/invalid fields | `{ "error": "message" }` |
| `401` | Missing/invalid/expired token | `{ "error": "Unauthorized" }` |
| `403` | Authenticated, but not allowed to do this | `{ "error": "Forbidden" }` |
| `404` | Resource doesn't exist (or caller shouldn't know it does) | `{ "error": "Not found" }` |
| `409` | Conflict (e.g. duplicate email) | `{ "error": "message" }` |
| `500` | Unhandled error | `{ "error": "Internal server error" }` (never leak stack traces to the client) |

---

## ✅ Security Checklist

Go through this before shipping any new route:

- [ ] Does the route call `requireRole()` with the correct allowed roles?
- [ ] If the resource is unit-scoped, does it call `ownsUnit()`?
- [ ] Are all SQL values passed via `.bind()` — never string-interpolated into the query?
- [ ] Does `404` vs `403` avoid leaking whether a resource exists to someone who shouldn't see it?
- [ ] Is `JWT_SECRET` only ever read from `c.env`, never hardcoded?
- [ ] Is CORS `origin` restricted to your actual app domains before production launch (not `*`)?
- [ ] Are passwords always hashed with `bcryptjs`, never stored or logged in plaintext?
- [ ] Have you avoided returning `password_hash` or other sensitive columns in any response?

---

## 🗺️ Roadmap

- [ ] Refresh tokens (short-lived access + long-lived refresh) instead of a single 30-day JWT
- [ ] Rate limiting on `/api/auth/*`
- [ ] File uploads (visitor photos, complaint attachments) via Cloudflare R2, URL stored in D1
- [ ] Real-time visitor approvals via Durable Objects + WebSockets, replacing client-side polling
- [ ] Push notifications (FCM) triggered server-side on visitor/complaint events
- [ ] Scheduled monthly bill generation via a Cloudflare Cron Trigger
- [ ] Request validation with `zod` on every route body
