-- Migration 024 — daily order numbers
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/024_daily_order_numbers.sql
--
-- CLIENT_REVISIONS_PLAN.md, R4. The client (2026-10-15): orders are called
-- out as #1, #2, #3… each day, starting again at #1 the next day. The
-- internal order_id stays the key everywhere; only what people see changes.
--
--   - orders.order_day is the Asia/Manila calendar day the order was
--     placed; orders.daily_number is its place in that day.
--   - daily_order_numbers holds the last number given out per day. A
--     BEFORE INSERT trigger takes the next one with an upsert, so every
--     insert path (the API, tests, the demo seed) is numbered the same way.
--     The upsert locks that day's counter row until the order's transaction
--     ends: two orders placed at the same moment wait for each other and
--     never get the same number, and a rolled-back order gives its number
--     back.
--   - renumber_daily_orders() rebuilds the numbers from order_date. Only the
--     demo seed needs it, because it moves orders to earlier days after
--     placing them.

BEGIN;

CREATE TABLE daily_order_numbers (
  day DATE PRIMARY KEY,
  last_number INTEGER NOT NULL CHECK (last_number > 0)
);

ALTER TABLE orders ADD COLUMN order_day DATE;
ALTER TABLE orders ADD COLUMN daily_number INTEGER;

-- Existing orders: numbered per Manila day, in the order they were placed.
UPDATE orders o
   SET order_day = n.day, daily_number = n.number
  FROM (SELECT order_id,
               (order_date AT TIME ZONE 'Asia/Manila')::date AS day,
               ROW_NUMBER() OVER (PARTITION BY (order_date AT TIME ZONE 'Asia/Manila')::date ORDER BY order_date, order_id)::int AS number
          FROM orders) n
 WHERE n.order_id = o.order_id;

INSERT INTO daily_order_numbers (day, last_number)
SELECT order_day, MAX(daily_number) FROM orders GROUP BY order_day;

ALTER TABLE orders ALTER COLUMN order_day SET NOT NULL;
ALTER TABLE orders ALTER COLUMN daily_number SET NOT NULL;
-- DEFERRABLE so renumber_daily_orders() can reshuffle a day's numbers in
-- one UPDATE; an ordinary insert is still checked at once.
ALTER TABLE orders ADD CONSTRAINT orders_daily_number_unique UNIQUE (order_day, daily_number) DEFERRABLE INITIALLY IMMEDIATE;

CREATE FUNCTION assign_daily_order_number() RETURNS trigger AS $$
BEGIN
  NEW.order_day := (COALESCE(NEW.order_date, CURRENT_TIMESTAMP) AT TIME ZONE 'Asia/Manila')::date;
  INSERT INTO daily_order_numbers AS d (day, last_number) VALUES (NEW.order_day, 1)
  ON CONFLICT (day) DO UPDATE SET last_number = d.last_number + 1
  RETURNING d.last_number INTO NEW.daily_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_daily_number
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION assign_daily_order_number();

-- With a day: only the orders placed on that day (by order_date), for a
-- caller that moved orders onto it. Without: every day — the demo seed and
-- clear scripts, run with nothing else writing orders.
CREATE FUNCTION renumber_daily_orders(only_day DATE DEFAULT NULL) RETURNS void AS $$
BEGIN
  SET CONSTRAINTS orders_daily_number_unique DEFERRED;
  UPDATE orders o
     SET order_day = n.day, daily_number = n.number
    FROM (SELECT order_id, day, ROW_NUMBER() OVER (PARTITION BY day ORDER BY order_date, order_id)::int AS number
            FROM (SELECT order_id, order_date, (order_date AT TIME ZONE 'Asia/Manila')::date AS day FROM orders) placed
           WHERE only_day IS NULL OR day = only_day) n
   WHERE n.order_id = o.order_id
     AND (o.order_day IS DISTINCT FROM n.day OR o.daily_number IS DISTINCT FROM n.number);
  DELETE FROM daily_order_numbers WHERE only_day IS NULL OR day = only_day;
  INSERT INTO daily_order_numbers (day, last_number)
  SELECT order_day, MAX(daily_number) FROM orders WHERE only_day IS NULL OR order_day = only_day GROUP BY order_day;
  SET CONSTRAINTS orders_daily_number_unique IMMEDIATE;
END;
$$ LANGUAGE plpgsql;

-- The Recent orders panel and the new-order poll read the newest orders.
CREATE INDEX orders_order_date_idx ON orders (order_date DESC);

COMMIT;
