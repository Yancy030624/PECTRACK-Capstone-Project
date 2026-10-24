-- Migration 036 — events calendar (RULES-PLANS/REPORTS_ALIGNMENT_ANALYSIS.md §6)
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/036_events.sql
--
-- The client, 2026-10-24: on Holy Week, Pahiyas, Christmas, New Year and
-- long weekends the bakery produces x4 — mostly hard breads, the tourists'
-- pasalubong — preparing a week ahead. Each event is a row: its dates, how
-- much more (multiplier), which breads (HARD by default; soft breads keep
-- only ~3 days), and how many days ahead production starts (lead_days).
-- Weekends (x2 for hard breads, from Thursday) are a fixed rule in code,
-- not rows here. The admin adds long weekends as they are proclaimed.
--
-- Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS events (
  event_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  multiplier NUMERIC(4,2) NOT NULL DEFAULT 4 CHECK (multiplier >= 1 AND multiplier <= 10),
  applies_to VARCHAR(4) NOT NULL DEFAULT 'HARD' CHECK (applies_to IN ('HARD', 'SOFT', 'BOTH')),
  lead_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_days BETWEEN 0 AND 30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS events_dates_idx ON events (starts_on, ends_on);

-- The fixed ones: the past year's (so the forecast can learn what an event
-- day sells) and the coming ones. Holy Week moves every year; long weekends
-- are proclaimed — the admin adds those. Each row is added only if missing,
-- so running this again changes nothing.
INSERT INTO events (name, starts_on, ends_on)
SELECT seed.name, seed.starts_on, seed.ends_on
  FROM (VALUES
    ('Christmas', DATE '2025-12-24', DATE '2025-12-25'),
    ('New Year', DATE '2025-12-31', DATE '2026-01-01'),
    ('Holy Week', DATE '2026-04-01', DATE '2026-04-05'),
    ('Pahiyas Festival', DATE '2026-05-14', DATE '2026-05-15'),
    ('Christmas', DATE '2026-12-24', DATE '2026-12-25'),
    ('New Year', DATE '2026-12-31', DATE '2027-01-01'),
    ('Holy Week', DATE '2027-03-24', DATE '2027-03-28'),
    ('Pahiyas Festival', DATE '2027-05-14', DATE '2027-05-15')
  ) AS seed(name, starts_on, ends_on)
 WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.name = seed.name AND e.starts_on = seed.starts_on);

COMMIT;
