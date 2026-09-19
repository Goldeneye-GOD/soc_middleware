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
