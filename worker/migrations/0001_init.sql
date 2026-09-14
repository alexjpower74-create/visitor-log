-- Visitor Log: one deployment = one home. Instants are ISO strings in UTC (toISOString, so they compare as text);
-- dates are home-local YYYY-MM-DD. No health information about residents; screening answers are never stored.

CREATE TABLE home (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  home_name TEXT NOT NULL,
  sample INTEGER NOT NULL DEFAULT 0,
  phone TEXT NOT NULL DEFAULT '',
  retention_days INTEGER NOT NULL DEFAULT 30,
  max_visitors_per_resident INTEGER,            -- NULL = no limit
  after_hours_message TEXT NOT NULL,
  desk_message TEXT NOT NULL,
  screening_enabled INTEGER NOT NULL DEFAULT 0,
  screening_stop_message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hours TEXT NOT NULL,                          -- JSON [{ "open": "HH:MM", "close": "HH:MM" }], sorted
  position INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE residents (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_initial TEXT NOT NULL,
  room TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  by_arrangement INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
  pin_hash TEXT NOT NULL,                       -- PBKDF2-SHA-256, 100 000 iterations, hex
  pin_salt TEXT NOT NULL,                       -- per staff member, hex
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                  -- SHA-256 of the bearer token; the token itself is never stored
  staff_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE pin_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  at TEXT NOT NULL                              -- one row per wrong PIN
);
CREATE INDEX pin_attempts_ip_at ON pin_attempts (ip, at);

CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  unit_id TEXT,                                 -- NULL = the whole home
  severity TEXT NOT NULL CHECK (severity IN ('info', 'restricted', 'outbreak')),
  message TEXT NOT NULL,                        -- the home's own words
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE screening_questions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE,                       -- SHA-256 of the visitor's sign-out link token; NULL for staff sign-ins
  visitor_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',               -- "709-555-0123", or '' when staff signed in someone without a phone
  resident_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,                        -- the resident's unit at sign-in
  in_at TEXT NOT NULL,
  date TEXT NOT NULL,                           -- home-local date of in_at
  due_at TEXT NOT NULL,
  auto_out_at TEXT NOT NULL,
  out_at TEXT,
  out_kind TEXT CHECK (out_kind IN ('visitor', 'staff', 'auto')),
  method TEXT NOT NULL CHECK (method IN ('qr', 'staff')),
  signed_in_by TEXT,                            -- the staff member's name for method 'staff'
  screened INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX visits_date ON visits (date);
CREATE INDEX visits_out ON visits (out_at, auto_out_at);
CREATE INDEX visits_phone ON visits (phone);
CREATE INDEX visits_resident ON visits (resident_id);

CREATE TABLE roll_calls (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  started_by TEXT NOT NULL,
  ended_at TEXT,
  ended_by TEXT
);

CREATE TABLE roll_call_entries (
  roll_call_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  found INTEGER NOT NULL DEFAULT 0,
  found_at TEXT,
  found_by TEXT,
  PRIMARY KEY (roll_call_id, visit_id)
);
