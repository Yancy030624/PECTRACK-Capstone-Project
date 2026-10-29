-- PECTRACK PostgreSQL 17 schema
-- Apply this file to an empty database named pectrack.
-- Example: psql -U postgres -d pectrack -f database/schema.sql

BEGIN;

CREATE TYPE user_role AS ENUM ('ADMIN', 'CASHIER', 'CUSTOMER', 'DELIVERY_PERSONNEL');
CREATE TYPE order_type AS ENUM ('PICKUP', 'DELIVERY');
-- Migration 029 (payment first): a paid order starts READY_FOR_PICKUP or
-- READY_FOR_DELIVERY; AWAITING_PAYMENT is an online checkout held for 15
-- minutes while the customer pays. PLACED, CONFIRMED and IN_PRODUCTION are
-- kept for old rows only.
CREATE TYPE order_status AS ENUM (
  'AWAITING_PAYMENT', 'PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP',
  'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'
);
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TYPE delivery_status AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');
CREATE TYPE change_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE change_request_type AS ENUM ('INVENTORY', 'PRODUCT_DETAILS');
CREATE TYPE proof_type AS ENUM ('PHOTO', 'SIGNATURE', 'CONFIRMATION');
-- Why a stock movement happened. CORRECTION covers a physical recount in
-- either direction, which is why inventory_movements.quantity_change is a
-- signed number rather than a magnitude plus a separate direction flag.
-- REJECT (migration 023) is the one loss reason now: the bakery records
-- rejected bread and nothing else (CLIENT_REVISIONS_PLAN.md, R3).
-- SPOILAGE / PRODUCTION_LOSS / EXPIRED / DAMAGED (migration 008) are no
-- longer written; they stay because past ledger rows carry them.
CREATE TYPE stock_movement_reason AS ENUM (
  'ORDER_PLACED', 'ORDER_CANCELLED', 'RESTOCK', 'SPOILAGE', 'CORRECTION',
  'PRODUCTION_LOSS', 'EXPIRED', 'DAMAGED',
  -- Migration 013: finished goods entering stock from an approved
  -- production batch. Production batches were removed (migration 022);
  -- the value stays because past ledger rows carry it.
  'PRODUCTION',
  'REJECT'
);
-- Where an event row came from. The application writes only RECORDED;
-- IMPORTED is client history loaded by a script; ASSUMED is synthetic data
-- if the adviser ever calls for it. A model filters on this, never guesses.
CREATE TYPE data_source AS ENUM ('RECORDED', 'IMPORTED', 'ASSUMED');
-- The security audit trail's fixed vocabulary (migration 015). A fixed
-- list, not free text, so a query for "failed sign-ins this week" cannot
-- miss rows because two call sites spelled the same event differently.
CREATE TYPE security_event_type AS ENUM (
  'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGIN_LOCKED_OUT', 'LOGOUT',
  'OTP_ISSUED', 'OTP_SUCCESS', 'OTP_FAILURE',
  'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_CHANGED',
  'ACCOUNT_CREATED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_REACTIVATED', 'STAFF_PASSWORD_RESET',
  'EMAIL_VERIFICATION_SENT', 'EMAIL_VERIFIED', 'EMAIL_CHANGED',
  'SESSION_EXPIRED'
);

-- Keeps every updated_at column honest. Without this, those columns take
-- their DEFAULT CURRENT_TIMESTAMP on INSERT and are then never touched
-- again, so they permanently equal created_at — which is worse than not
-- having them at all, because they look authoritative while being wrong.
--
-- Enforced by the database rather than by each UPDATE statement so it can
-- never be forgotten: any UPDATE, from any route, written by anyone, in any
-- future phase, maintains it automatically. The triggers themselves are
-- attached at the bottom of this file, after the tables exist.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  user_type user_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  -- Migration 020. The last request made with this session; a staff
  -- session idle for 30 minutes ends (server/lib/auth.js).
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- One-time codes for admin second-factor login (sent via SMS to admins.contact_num).
--
-- challenge_token is what ties the code back to the password step that
-- issued it. /login returns the token only after the password checks out,
-- and /verify-otp will not accept a code without it. Without this column a
-- valid SMS code was a complete admin login on its own, since the endpoint
-- identified the account by username — something anyone can guess — and
-- never re-established that the password had been proved.
--
-- Nullable only so the column could be added to a table that already had
-- rows (see migrations/002). A row with a NULL token can never be matched,
-- since SQL equality against NULL is never true, so pre-existing codes
-- became unusable rather than remaining usable under the old weaker rule —
-- which is the safe direction to fail.
CREATE TABLE otp_codes (
  otp_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  challenge_token TEXT UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX otp_codes_user_id_idx ON otp_codes (user_id);

-- Email password recovery (migration 010) — holds only a SHA-256 hash of
-- the token, which itself exists once, in the email. Single-use
-- (consumed_at), time-bounded (expires_at), at most one live token per
-- user (routes/auth.js replaces earlier unconsumed ones on each request).
CREATE TABLE password_reset_tokens (
  token_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  -- Migration 017: the address the link was mailed to. Completing a reset
  -- confirms a customer's email only when this matches the current one.
  email VARCHAR(254),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);

-- Migration 016. Same shape as password_reset_tokens — a SHA-256 hash,
-- single-use, time-limited — plus the address the link was mailed to, so
-- a link cannot verify an email the account changed to afterwards.
CREATE TABLE email_verification_tokens (
  token_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX email_verification_tokens_user_id_idx ON email_verification_tokens (user_id, created_at DESC);

CREATE TABLE admins (
  admin_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id),
  name VARCHAR(150) NOT NULL,
  contact_num VARCHAR(30) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE
);

CREATE TABLE cashiers (
  cashier_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id),
  name VARCHAR(150) NOT NULL,
  contact_num VARCHAR(30) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE
);

CREATE TABLE customers (
  customer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id),
  -- Migration 026. The full name, kept by the customers_sync_name trigger
  -- from first_name and last_name; every query that shows a customer
  -- reads this one.
  name VARCHAR(150) NOT NULL,
  -- Migration 026. Asked for separately at registration. last_name is
  -- empty only for an older one-word name.
  first_name VARCHAR(70) NOT NULL,
  last_name VARCHAR(70),
  contact_num VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  -- Migration 016. NULL until the customer opens the emailed link; placing
  -- an order requires it. Cleared again when the email is changed.
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE delivery_personnel (
  delivery_personnel_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id),
  name VARCHAR(150) NOT NULL,
  contact_num VARCHAR(30) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE
);

CREATE TABLE customer_addresses (
  address_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  label VARCHAR(50) NOT NULL DEFAULT 'Home',
  recipient_name VARCHAR(150) NOT NULL,
  contact_num VARCHAR(30) NOT NULL,
  address_line_1 VARCHAR(255) NOT NULL,
  address_line_2 VARCHAR(255),
  barangay VARCHAR(100),
  municipality VARCHAR(100) NOT NULL DEFAULT 'Lucban',
  province VARCHAR(100) NOT NULL DEFAULT 'Quezon',
  postal_code VARCHAR(20),
  delivery_notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX customer_addresses_one_default_per_customer
  ON customer_addresses (customer_id) WHERE is_default AND is_active;

CREATE TABLE categories (
  category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE products (
  product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(category_id),
  product_name VARCHAR(150) NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  variant VARCHAR(100),
  availability_status BOOLEAN NOT NULL DEFAULT TRUE,
  -- One optional photo (migration 007). A storage key generated by
  -- server/lib/storage.js, never a client filename. NULL = no photo.
  -- (shelf_life_days was dropped by migration 023: no expiry tracking.)
  image_key VARCHAR(255)
);

-- A plain UNIQUE(category_id, product_name, variant) would not catch duplicate
-- rows when variant IS NULL, since NULL is never equal to NULL in a unique
-- constraint. COALESCE folds that case into a single comparable value.
CREATE UNIQUE INDEX products_category_name_variant_key
  ON products (category_id, product_name, COALESCE(variant, ''));

CREATE TABLE inventory (
  inventory_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL UNIQUE REFERENCES products(product_id) ON DELETE CASCADE,
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock_level INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(customer_id),
  processed_by BIGINT REFERENCES cashiers(cashier_id),
  address_id BIGINT REFERENCES customer_addresses(address_id),
  order_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status order_status NOT NULL DEFAULT 'PLACED',
  order_type order_type NOT NULL,
  instructions TEXT,
  requested_fulfillment_time TIMESTAMPTZ,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  data_source data_source NOT NULL DEFAULT 'RECORDED',
  -- Migration 024 (CLIENT_REVISIONS_PLAN.md, R4). The Asia/Manila day the
  -- order was placed and its number within that day (#1, #2, … restarting
  -- daily) — what people see. order_id stays the key. Both are set by the
  -- orders_daily_number trigger below, never by the caller.
  order_day DATE NOT NULL,
  daily_number INTEGER NOT NULL,
  CONSTRAINT orders_daily_number_unique UNIQUE (order_day, daily_number) DEFERRABLE INITIALLY IMMEDIATE,
  CHECK (
    (order_type = 'PICKUP' AND address_id IS NULL)
    OR (order_type = 'DELIVERY' AND address_id IS NOT NULL)
  )
);

-- Migration 024. The last daily number given out per day. The trigger's
-- upsert locks the day's row until the order's transaction ends, so two
-- orders placed at once never share a number, and a rolled-back order
-- gives its number back.
CREATE TABLE daily_order_numbers (
  day DATE PRIMARY KEY,
  last_number INTEGER NOT NULL CHECK (last_number > 0)
);

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

CREATE TABLE order_details (
  order_detail_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  UNIQUE (order_id, product_id)
);

CREATE TABLE payments (
  payment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(order_id),
  -- users(user_id), not cashiers(cashier_id): an ADMIN can record a payment
  -- and must be able to record a refund (PHASE6_PLAN.md, Decision 8), and
  -- admins have no cashier_id. Same reasoning as order_status_history.
  -- updated_by and inventory_movements.changed_by.
  recorded_by BIGINT REFERENCES users(user_id),
  payment_method VARCHAR(50) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status payment_status NOT NULL DEFAULT 'PENDING',
  gateway_reference VARCHAR(255) UNIQUE,
  payment_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- A refund flips PAID -> REFUNDED. A payment has exactly one status
  -- transition worth auditing, so three columns cover it completely
  -- without a full history table (PHASE6_PLAN.md, Decision 8).
  refunded_by BIGINT REFERENCES users(user_id),
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  -- Migration 009. PayMongo's Payment id (pay_...) learned from the
  -- payment.paid webhook — what its Refunds API refunds; the checkout
  -- session id in gateway_reference cannot be. NULL for cash and
  -- counter-GCash rows. refund_reference is the PayMongo Refund id once
  -- one exists; NULL on a REFUNDED row that has a gateway_payment_id
  -- means the gateway side is still owed (server/lib/refunds.js retries).
  gateway_payment_id VARCHAR(255),
  refund_reference VARCHAR(255),
  -- Migration 043 (QRPH_PLAN.md). A QR Ph payment is confirmed or rejected
  -- by a person: who and when, why it was rejected (shown to the
  -- customer), and the customer's optional screenshot with its MIME type,
  -- kept in the database because Railway's disk is replaced on deploy.
  verified_by BIGINT REFERENCES users(user_id),
  verified_at TIMESTAMPTZ,
  rejected_reason TEXT,
  proof_image BYTEA,
  proof_type VARCHAR(20)
);

CREATE TABLE deliveries (
  delivery_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders(order_id),
  delivery_personnel_id BIGINT REFERENCES delivery_personnel(delivery_personnel_id),
  status delivery_status NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
  assigned_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  note TEXT,
  -- Migration 019. When the delivery became FAILED; cleared when an admin
  -- retries it. Places a failed delivery in the driver's history range.
  failed_at TIMESTAMPTZ
);

-- Added for the required proof-of-delivery upload. Files belong in object storage;
-- this table stores only their references and audit information.
CREATE TABLE delivery_proofs (
  proof_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES deliveries(delivery_id) ON DELETE CASCADE,
  uploaded_by BIGINT NOT NULL REFERENCES delivery_personnel(delivery_personnel_id),
  proof_type proof_type NOT NULL DEFAULT 'PHOTO',
  storage_key VARCHAR(500) NOT NULL UNIQUE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_alerts (
  alert_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
  alert_message TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Added for cashier proposals. Only an approved request may be applied to the
-- product or inventory record by the backend service. Cashiers may only submit
-- INVENTORY requests (stock_quantity/min_stock_level); PRODUCT_DETAILS requests
-- (price/description/availability) are admin-only edits, not a cashier proposal.
CREATE TABLE inventory_change_requests (
  request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  requested_by BIGINT NOT NULL REFERENCES cashiers(cashier_id),
  request_type change_request_type NOT NULL,
  -- What the system showed the cashier at the moment they proposed. Approval
  -- applies the difference THEY observed (proposed - observed) to whatever
  -- stock is current, rather than writing proposed_stock_quantity blindly —
  -- which would erase anything that sold while the request sat pending.
  -- NULL means "apply the absolute value", the behaviour before this existed.
  observed_stock_quantity INTEGER CHECK (observed_stock_quantity >= 0),
  proposed_stock_quantity INTEGER CHECK (proposed_stock_quantity >= 0),
  proposed_min_stock_level INTEGER CHECK (proposed_min_stock_level >= 0),
  proposed_price NUMERIC(12, 2) CHECK (proposed_price >= 0),
  proposed_description TEXT,
  proposed_availability_status BOOLEAN,
  -- A LOSS REPORT (migration 008) is the second shape this table holds:
  -- quantity_change (always negative) plus the structured movement_reason
  -- that approval copies onto the ledger. A row is EITHER a recount
  -- (proposed_stock_quantity set, these two NULL) OR a loss report (these
  -- two set, proposed_stock_quantity NULL) — enforced by
  -- routes/inventory.js's POST /requests, the only writer.
  movement_reason stock_movement_reason,
  quantity_change INTEGER CHECK (quantity_change <> 0),
  reason TEXT NOT NULL,
  status change_request_status NOT NULL DEFAULT 'PENDING',
  reviewed_by BIGINT REFERENCES admins(admin_id),
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_change_requests_check CHECK (
    (request_type = 'INVENTORY' AND (proposed_stock_quantity IS NOT NULL OR proposed_min_stock_level IS NOT NULL OR quantity_change IS NOT NULL))
    OR (request_type = 'PRODUCT_DETAILS' AND (proposed_price IS NOT NULL OR proposed_description IS NOT NULL OR proposed_availability_status IS NOT NULL))
  )
);

-- Every change to inventory.stock_quantity, and why it happened.
--
-- Without this, stock_quantity is a single mutable integer: when it is wrong
-- — and it will be, that is normal for real stock — nothing in the system can
-- answer WHY. Sales can be reconstructed from order_details, but spoilage,
-- deliveries received, and manual corrections are recorded nowhere at all.
-- That is also exactly the data restocking advice needs.
--
-- Same shape as order_status_history: never mutate the number on its own,
-- always write a row alongside it saying what changed and what caused it.
CREATE TABLE inventory_movements (
  movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
  -- Typically exactly one of these is set — or neither, for a direct admin
  -- edit. They let the ledger point at the cause rather than describe it.
  order_id BIGINT REFERENCES orders(order_id),
  request_id BIGINT REFERENCES inventory_change_requests(request_id),
  data_source data_source NOT NULL DEFAULT 'RECORDED',
  -- users(user_id), not a role table: a movement can be caused by a customer
  -- placing an order, a cashier, or an admin — the same reasoning as
  -- order_status_history.updated_by. Migration 028: NULL when the system
  -- made the change.
  changed_by BIGINT REFERENCES users(user_id),
  -- Signed: negative removes stock, positive adds it. One signed column
  -- rather than a magnitude plus a direction flag, because CORRECTION goes
  -- either way and SUM() here must equal the net change to stock_quantity.
  quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
  reason stock_movement_reason NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migration 025 (CLIENT_REVISIONS_PLAN.md, R5). Ingredient stock only — no
-- recipes, batches or costing. Same rule as finished goods: the stock figure
-- never changes without a movement row in the same transaction.
CREATE TYPE ingredient_movement_reason AS ENUM ('RESTOCK', 'USAGE', 'REJECT', 'CORRECTION');

CREATE TABLE ingredients (
  ingredient_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  -- kg, g, L, mL, pc, pack, sack, tray — checked by routes/ingredients.js,
  -- not an enum, so a new unit is a line of code, not a migration.
  unit VARCHAR(20) NOT NULL,
  -- NUMERIC(12,3): flour is 12.5 kg.
  stock_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RESTOCK adds, USAGE and REJECT remove, CORRECTION (a recount) goes
-- either way. data_source keeps the demo seed's rows separable, as on the
-- product ledger.
CREATE TABLE ingredient_movements (
  movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  changed_by BIGINT NOT NULL REFERENCES users(user_id),
  quantity_change NUMERIC(12, 3) NOT NULL CHECK (quantity_change <> 0),
  reason ingredient_movement_reason NOT NULL,
  note TEXT,
  data_source data_source NOT NULL DEFAULT 'RECORDED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (reason = 'RESTOCK' AND quantity_change > 0)
    OR (reason IN ('USAGE', 'REJECT') AND quantity_change < 0)
    OR reason = 'CORRECTION'
  )
);

CREATE TABLE report_logs (
  report_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  generated_by BIGINT NOT NULL REFERENCES admins(admin_id),
  report_type VARCHAR(100) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- What happened to an ACCOUNT, as opposed to what happened to an order.
-- See migration 015 for the three rules this table is built around; the
-- one that matters most: it never holds a secret — no password, no OTP
-- code, no session id, no reset token.
--
-- user_id is nullable and ON DELETE SET NULL on purpose: a failed sign-in
-- against a username nobody owns has no account to point at, and deleting
-- an account must not erase the record that it once did something.
CREATE TABLE security_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type security_event_type NOT NULL,
  user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  username VARCHAR(50),
  ip_address VARCHAR(64),
  user_agent VARCHAR(255),
  detail VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_status_history (
  history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  -- Migration 028: NULL when the system made the change (an order closed
  -- automatically after its day, server/lib/staleOrders.js).
  updated_by BIGINT REFERENCES users(user_id),
  status order_status NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX orders_customer_id_idx ON orders (customer_id);
CREATE INDEX orders_status_order_date_idx ON orders (status, order_date DESC);
-- Migration 024: the Recent orders panel and the new-order poll.
CREATE INDEX orders_order_date_idx ON orders (order_date DESC);
CREATE INDEX order_details_order_id_idx ON order_details (order_id);
CREATE INDEX payments_order_id_idx ON payments (order_id);
CREATE INDEX deliveries_personnel_status_idx ON deliveries (delivery_personnel_id, status);
CREATE INDEX inventory_change_requests_status_idx ON inventory_change_requests (status, created_at);
-- At most one PENDING proposal per product. Approval applies the difference
-- the cashier OBSERVED to current stock, and that arithmetic is only correct
-- while a single proposal is outstanding — two pending rows share one
-- observed baseline, so approving both compounds their deltas. Partial, so
-- the APPROVED/REJECTED history a product accumulates is unaffected.
CREATE UNIQUE INDEX inventory_change_requests_one_pending_per_product_idx
  ON inventory_change_requests (product_id) WHERE status = 'PENDING';
CREATE INDEX order_status_history_order_id_idx ON order_status_history (order_id, updated_at);
CREATE INDEX security_events_user_id_idx ON security_events (user_id, created_at DESC);
CREATE INDEX security_events_type_idx ON security_events (event_type, created_at DESC);
CREATE INDEX security_events_ip_idx ON security_events (ip_address, created_at DESC);
CREATE INDEX inventory_movements_inventory_id_idx ON inventory_movements (inventory_id, created_at DESC);
CREATE INDEX ingredient_movements_ingredient_id_idx ON ingredient_movements (ingredient_id, created_at DESC);
CREATE INDEX ingredient_movements_created_at_idx ON ingredient_movements (created_at DESC);
-- At most one PENDING gateway-initiated payment per order (Phase 6.5 —
-- PayMongo Checkout Sessions). A confirmed gateway payment cannot simply
-- be refused if it would overpay the order the way the manual cash/GCash
-- path can, because by then the customer's money has already moved
-- (PHASE6.5_PLAN.md, Decision 9) — so a double-click creating two PENDING
-- intents has to be stopped here, before either can be completed. Same
-- partial-index shape as inventory_change_requests_one_pending_per_product_idx
-- above, for the same reason: it must not touch the PAID/FAILED/REFUNDED
-- history a payment row accumulates.
CREATE UNIQUE INDEX payments_one_pending_per_order_idx
  ON payments (order_id) WHERE status = 'PENDING';

-- Migration 043. Staff's "Payments to confirm" list: pending QR Ph
-- payments, oldest first.
CREATE INDEX payments_qrph_pending_idx ON payments (created_at) WHERE payment_method = 'QRPH' AND status = 'PENDING';

-- Attach the set_updated_at() function defined at the top of this file to
-- every table that carries an updated_at column. BEFORE UPDATE so the new
-- value is written as part of the same row write, and FOR EACH ROW because
-- the function works on NEW, which only exists per row.
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Migration 026: first_name / last_name and the full name stay in step.
-- {first, last} from a full name. Used by the backfill and by the trigger
-- when only the full name is written (the demo seed, older scripts).
CREATE FUNCTION split_person_name(full_name TEXT) RETURNS TEXT[] AS $$
DECLARE
  cleaned TEXT := regexp_replace(btrim(COALESCE(full_name, '')), '\s+', ' ', 'g');
  parts TEXT[];
BEGIN
  parts := regexp_match(
    cleaned,
    '^(.+?) ((?:(?:de|dela|del|delos|da|di|san|sta\.?|santa|la|las|los|van|von) )*[^ ]+)$',
    'i'
  );
  IF parts IS NULL THEN
    RETURN ARRAY[NULLIF(cleaned, ''), NULL];
  END IF;
  RETURN parts;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Keeps the three columns in step, whichever side was written:
-- - first_name / last_name given (the app): name is built from them;
-- - only name changed (a script): first_name / last_name are split from it.
CREATE FUNCTION customers_sync_name() RETURNS trigger AS $$
DECLARE
  parts TEXT[];
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
     AND NEW.name IS DISTINCT FROM OLD.name THEN
    parts := split_person_name(NEW.name);
    NEW.first_name := parts[1];
    NEW.last_name := parts[2];
  ELSIF NULLIF(btrim(NEW.first_name), '') IS NOT NULL THEN
    NEW.first_name := btrim(NEW.first_name);
    NEW.last_name := NULLIF(btrim(NEW.last_name), '');
  ELSE
    parts := split_person_name(NEW.name);
    NEW.first_name := parts[1];
    NEW.last_name := parts[2];
  END IF;
  NEW.name := concat_ws(' ', NEW.first_name, NEW.last_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_sync_name
  BEFORE INSERT OR UPDATE OF name, first_name, last_name ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_sync_name();

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER customer_addresses_set_updated_at
  BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ingredients_set_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Live stock (migration 041, RULES-PLANS/LIVE_STOCK_PLAN.md): every change
-- to a stock row sends NOTIFY stock_changed with the table's name; the
-- server pushes it to open Inventory screens. Delivered on COMMIT only.
CREATE FUNCTION notify_stock_changed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN
    RETURN NULL;
  END IF;
  PERFORM pg_notify('stock_changed', TG_TABLE_NAME);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_stock_changed
  AFTER INSERT OR UPDATE OR DELETE ON inventory
  FOR EACH ROW EXECUTE FUNCTION notify_stock_changed();

CREATE TRIGGER ingredients_stock_changed
  AFTER INSERT OR UPDATE OR DELETE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION notify_stock_changed();

-- Analytics views (migration 014; the costing and production views were
-- removed with production batches in migration 022). Views, not tables —
-- nothing to keep in sync. Every date is the Asia/Manila calendar day.
-- ---------------------------------------------------------------------------
-- analytics_daily_sales — units and revenue per product per day, from
-- orders that were not cancelled, dated by order_date. stocked_out is the
-- censoring flag INVENTORY_REVIEW.md §8 names as the single most important
-- input for demand work: TRUE when the product's running ledger balance
-- touched zero at any point that day, so that day's sales are a floor on
-- demand, not a measurement of it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics_daily_sales AS
WITH running AS (
  -- The balance AFTER each movement, anchored on today's stock_quantity
  -- and walked backwards: stock now minus everything that moved after
  -- this row. Anchoring on the present rather than summing from zero
  -- means stock that entered before the ledger existed (Phase 4 data,
  -- test fixtures written with a direct UPDATE) does not make every
  -- later day look like a stockout.
  SELECT i.product_id,
         (im.created_at AT TIME ZONE 'Asia/Manila')::date AS local_date,
         i.stock_quantity - COALESCE(SUM(im.quantity_change) OVER (
           PARTITION BY im.inventory_id ORDER BY im.created_at, im.movement_id
           ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING), 0) AS balance_after
    FROM inventory_movements im
    JOIN inventory i ON i.inventory_id = im.inventory_id
),
stockouts AS (
  SELECT product_id, local_date, BOOL_OR(balance_after <= 0) AS stocked_out
    FROM running
   GROUP BY product_id, local_date
),
sales AS (
  SELECT (o.order_date AT TIME ZONE 'Asia/Manila')::date AS local_date,
         od.product_id,
         o.data_source,
         SUM(od.quantity)::int AS units_sold,
         SUM(od.quantity * od.unit_price)::numeric(12, 2) AS revenue,
         COUNT(DISTINCT o.order_id)::int AS orders
    FROM order_details od
    JOIN orders o ON o.order_id = od.order_id
   WHERE o.status <> 'CANCELLED'
   GROUP BY 1, 2, 3
)
SELECT s.local_date, s.product_id, s.data_source, s.units_sold, s.revenue, s.orders,
       COALESCE(so.stocked_out, FALSE) AS stocked_out
  FROM sales s
  LEFT JOIN stockouts so ON so.product_id = s.product_id AND so.local_date = s.local_date;

-- ---------------------------------------------------------------------------
-- analytics_daily_waste — finished goods lost after stocking, per product
-- per day, by cause, as positive magnitudes. correction is the signed net
-- of CORRECTION rows (a recount can go either way).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics_daily_waste AS
SELECT (im.created_at AT TIME ZONE 'Asia/Manila')::date AS local_date,
       i.product_id,
       im.data_source,
       SUM(CASE WHEN im.reason = 'EXPIRED' THEN -im.quantity_change ELSE 0 END)::int AS expired,
       SUM(CASE WHEN im.reason = 'SPOILAGE' THEN -im.quantity_change ELSE 0 END)::int AS spoiled,
       SUM(CASE WHEN im.reason = 'DAMAGED' THEN -im.quantity_change ELSE 0 END)::int AS damaged,
       SUM(CASE WHEN im.reason = 'PRODUCTION_LOSS' THEN -im.quantity_change ELSE 0 END)::int AS production_loss,
       SUM(CASE WHEN im.reason = 'CORRECTION' THEN im.quantity_change ELSE 0 END)::int AS correction,
       SUM(CASE WHEN im.reason = 'REJECT' THEN -im.quantity_change ELSE 0 END)::int AS rejected
  FROM inventory_movements im
  JOIN inventory i ON i.inventory_id = im.inventory_id
 WHERE im.reason IN ('EXPIRED', 'SPOILAGE', 'DAMAGED', 'PRODUCTION_LOSS', 'CORRECTION', 'REJECT')
 GROUP BY 1, 2, 3;

-- ===========================================================================
-- Migration 018 — demand forecasting (Phase 9B). Placed after the analytics
-- views because forecast_training_data reads analytics_daily_sales.
-- ===========================================================================
-- ---------------------------------------------------------------------------
-- Generated history lives HERE, never as orders. A generated year of fake
-- orders would show as revenue in the Sales report, and break the payment
-- and inventory ledgers — exactly the mixing of assumed and real data the
-- thesis and the adviser both rule out. Nothing but the forecaster reads
-- this table.
--
-- One row for EVERY product-day, zeros included: a day that sold nothing is
-- data, and a forecaster cannot tell a missing row from a quiet day.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assumed_daily_demand (
  local_date DATE NOT NULL,
  product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  units INTEGER NOT NULL CHECK (units >= 0),
  -- The generator simulates occasional stock-outs, flagged the same way
  -- analytics_daily_sales flags real ones, so the forecaster's handling of
  -- censored days is exercised too.
  stocked_out BOOLEAN NOT NULL DEFAULT FALSE,
  -- Which generator produced the row, so a change to the assumptions can
  -- be traced to the history it made.
  generator_version VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (local_date, product_id)
);

-- ---------------------------------------------------------------------------
-- The forecaster's only input: real history and generated history, each
-- labelled with where it came from.
--
-- From analytics_daily_sales only RECORDED and IMPORTED rows are taken.
-- The ASSUMED rows there are the demo SEED's orders — placed so the
-- dashboards have something to show — and they overlap the generated
-- year's last three months. Counting both would double those days. The
-- seed's orders still inform the generator (they set each product's
-- relative popularity); they are not training data themselves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW forecast_training_data AS
SELECT s.local_date, s.product_id, s.units_sold AS units, s.stocked_out, s.data_source
  FROM analytics_daily_sales s
 WHERE s.data_source IN ('RECORDED', 'IMPORTED')
UNION ALL
SELECT a.local_date, a.product_id, a.units, a.stocked_out, 'ASSUMED'::data_source
  FROM assumed_daily_demand a;

-- ---------------------------------------------------------------------------
-- A forecast is a deliberate run, stored like a report — not recomputed on
-- every page view. Each run records what it was made from, so a forecast
-- on screen can always answer "what was this trained on?"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forecast_runs (
  run_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days BETWEEN 1 AND 28),
  sources data_source[] NOT NULL,
  history_from DATE,
  history_to DATE,
  -- e.g. {"RECORDED": 2, "ASSUMED": 365}: distinct days of each source used.
  days_by_source JSONB NOT NULL DEFAULT '{}'::jsonb,
  products_forecast INTEGER NOT NULL DEFAULT 0,
  products_skipped INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS forecast_runs_created_at_idx ON forecast_runs (created_at DESC);

-- Per product per run: which method won the backtest and how accurate it
-- was. Kept apart from the daily rows so it is not repeated seven times.
CREATE TABLE IF NOT EXISTS forecast_models (
  run_id BIGINT NOT NULL REFERENCES forecast_runs(run_id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  method VARCHAR(30) NOT NULL,
  -- Average units off per day in the backtest, and total error over total
  -- sales. NULL when the history was too short to backtest.
  mae NUMERIC(10, 3),
  wape NUMERIC(8, 4),
  -- The baseline's error on the same backtest, so the screen can say
  -- whether the chosen method actually beat "same weekday last month".
  baseline_mae NUMERIC(10, 3),
  history_days INTEGER NOT NULL,
  -- Every candidate's error, for the paper's comparison table.
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  note VARCHAR(255),
  PRIMARY KEY (run_id, product_id)
);

CREATE TABLE IF NOT EXISTS forecasts (
  run_id BIGINT NOT NULL REFERENCES forecast_runs(run_id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  predicted NUMERIC(10, 2) NOT NULL CHECK (predicted >= 0),
  -- An ~80% range from the backtest's own errors: most days should land
  -- inside it. Not a guarantee, and labelled as a range, not a promise.
  low NUMERIC(10, 2) NOT NULL CHECK (low >= 0),
  high NUMERIC(10, 2) NOT NULL,
  PRIMARY KEY (run_id, product_id, forecast_date)
);

-- Migration 043 (QRPH_PLAN.md). Settings the admin changes in the app: the
-- bakery's QR Ph image (qrph_image_key) and account name
-- (qrph_account_name). A file setting keeps its bytes in data and its MIME
-- type in value.
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  data BYTEA,
  updated_by BIGINT REFERENCES users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
