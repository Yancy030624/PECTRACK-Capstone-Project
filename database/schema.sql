-- PECTRACK PostgreSQL 17 schema
-- Apply this file to an empty database named pectrack.
-- Example: psql -U postgres -d pectrack -f database/schema.sql

BEGIN;

CREATE TYPE user_role AS ENUM ('ADMIN', 'CASHIER', 'CUSTOMER', 'DELIVERY_PERSONNEL');
CREATE TYPE order_type AS ENUM ('PICKUP', 'DELIVERY');
CREATE TYPE order_status AS ENUM (
  'PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'
);
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TYPE delivery_status AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');
CREATE TYPE change_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE change_request_type AS ENUM ('INVENTORY', 'PRODUCT_DETAILS');
CREATE TYPE proof_type AS ENUM ('PHOTO', 'SIGNATURE', 'CONFIRMATION');
-- Why a stock movement happened. CORRECTION covers a physical recount in
-- either direction, which is why inventory_movements.quantity_change is a
-- signed number rather than a magnitude plus a separate direction flag.
-- PRODUCTION_LOSS / EXPIRED / DAMAGED (migration 008) split a loss by what
-- an owner would DO about it: fix the oven, bake less, fix handling.
CREATE TYPE stock_movement_reason AS ENUM (
  'ORDER_PLACED', 'ORDER_CANCELLED', 'RESTOCK', 'SPOILAGE', 'CORRECTION',
  'PRODUCTION_LOSS', 'EXPIRED', 'DAMAGED',
  -- Migration 013: finished goods entering stock from an approved
  -- production batch. RESTOCK keeps its narrower meaning — goods received
  -- without a recipe (bought-in).
  'PRODUCTION'
);
-- Phase 9A (migrations 011–013). See PHASE9A_DATA_FOUNDATION_PLAN.md.
CREATE TYPE ingredient_movement_reason AS ENUM ('PURCHASE', 'PRODUCTION_USE', 'WASTE', 'CORRECTION');
CREATE TYPE production_batch_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
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
  'ACCOUNT_CREATED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_REACTIVATED', 'STAFF_PASSWORD_RESET'
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
  expires_at TIMESTAMPTZ NOT NULL
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
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);

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
  name VARCHAR(150) NOT NULL,
  contact_num VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
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

-- Raw materials (migration 011). Not products: not sold, no price,
-- measured in kg/L, so their own table and their own ledger.
CREATE TABLE ingredients (
  ingredient_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  unit VARCHAR(20) NOT NULL,
  stock_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  -- Moving average, updated on every PURCHASE; production consumes at it.
  average_unit_cost NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A recipe is a dough, not a product (migration 012): one yield in a base
-- unit of its own choosing, and products map onto it with units_per_item.
CREATE TABLE recipes (
  recipe_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  base_unit VARCHAR(30) NOT NULL,
  yield_quantity NUMERIC(12, 3) NOT NULL CHECK (yield_quantity > 0),
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recipe_ingredients (
  recipe_id BIGINT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (recipe_id, ingredient_id)
);

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
  image_key VARCHAR(255),
  -- Migration 012: which dough this item is packed from, and how many of
  -- the recipe's base units one item holds. NULL recipe means bought-in
  -- (restockable, not producible). A recipe always has a ratio; a ratio
  -- without a recipe is allowed and inert (ON DELETE SET NULL needs it).
  recipe_id BIGINT REFERENCES recipes(recipe_id) ON DELETE SET NULL,
  units_per_item NUMERIC(12, 3) CHECK (units_per_item > 0),
  shelf_life_days INTEGER CHECK (shelf_life_days > 0),
  CONSTRAINT products_packaging_check CHECK (recipe_id IS NULL OR units_per_item IS NOT NULL)
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
  expiration_date DATE,
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
  requires_admin_approval BOOLEAN NOT NULL DEFAULT FALSE,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  data_source data_source NOT NULL DEFAULT 'RECORDED',
  CHECK (
    (order_type = 'PICKUP' AND address_id IS NULL)
    OR (order_type = 'DELIVERY' AND address_id IS NOT NULL)
  )
);

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
  refund_reference VARCHAR(255)
);

CREATE TABLE deliveries (
  delivery_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders(order_id),
  delivery_personnel_id BIGINT REFERENCES delivery_personnel(delivery_personnel_id),
  status delivery_status NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
  assigned_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  note TEXT
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
-- A production batch (migration 013): runs one recipe, consumes
-- ingredients, packs base units into products. Proposed by the person at
-- the oven, applied on admin approval — only APPROVED batches move stock.
CREATE TABLE production_batches (
  batch_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id BIGINT REFERENCES recipes(recipe_id) ON DELETE SET NULL,
  recipe_name VARCHAR(150) NOT NULL,
  base_unit VARCHAR(30) NOT NULL,
  planned_quantity NUMERIC(12, 3) NOT NULL CHECK (planned_quantity > 0),
  produced_quantity NUMERIC(12, 3) NOT NULL CHECK (produced_quantity >= 0),
  loss_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (loss_quantity >= 0),
  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  status production_batch_status NOT NULL DEFAULT 'PENDING',
  recorded_by BIGINT NOT NULL REFERENCES users(user_id),
  reviewed_by BIGINT REFERENCES users(user_id),
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  produced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  data_source data_source NOT NULL DEFAULT 'RECORDED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE production_batch_ingredients (
  batch_id BIGINT NOT NULL REFERENCES production_batches(batch_id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  quantity_used NUMERIC(12, 3) NOT NULL CHECK (quantity_used > 0),
  unit_cost NUMERIC(12, 4) CHECK (unit_cost >= 0),
  PRIMARY KEY (batch_id, ingredient_id)
);

CREATE TABLE production_batch_outputs (
  batch_id BIGINT NOT NULL REFERENCES production_batches(batch_id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  units_per_item NUMERIC(12, 3) NOT NULL CHECK (units_per_item > 0),
  PRIMARY KEY (batch_id, product_id)
);

-- The ingredient ledger (migration 011). Same invariant as
-- inventory_movements: SUM(quantity_change) per ingredient equals
-- ingredients.stock_quantity, and unit_cost is the cost snapshot.
CREATE TABLE ingredient_movements (
  movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  batch_id BIGINT REFERENCES production_batches(batch_id),
  changed_by BIGINT NOT NULL REFERENCES users(user_id),
  quantity_change NUMERIC(12, 3) NOT NULL CHECK (quantity_change <> 0),
  reason ingredient_movement_reason NOT NULL,
  unit_cost NUMERIC(12, 4) CHECK (unit_cost >= 0),
  note TEXT,
  data_source data_source NOT NULL DEFAULT 'RECORDED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_movements (
  movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
  -- Typically exactly one of these is set — or neither, for a direct admin
  -- edit. They let the ledger point at the cause rather than describe it.
  order_id BIGINT REFERENCES orders(order_id),
  request_id BIGINT REFERENCES inventory_change_requests(request_id),
  batch_id BIGINT REFERENCES production_batches(batch_id),
  data_source data_source NOT NULL DEFAULT 'RECORDED',
  -- users(user_id), not a role table: a movement can be caused by a customer
  -- placing an order, a cashier, or an admin — the same reasoning as
  -- order_status_history.updated_by.
  changed_by BIGINT NOT NULL REFERENCES users(user_id),
  -- Signed: negative removes stock, positive adds it. One signed column
  -- rather than a magnitude plus a direction flag, because CORRECTION goes
  -- either way and SUM() here must equal the net change to stock_quantity.
  quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
  reason stock_movement_reason NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  updated_by BIGINT NOT NULL REFERENCES users(user_id),
  status order_status NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX orders_customer_id_idx ON orders (customer_id);
CREATE INDEX orders_status_order_date_idx ON orders (status, order_date DESC);
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
CREATE INDEX products_recipe_id_idx ON products (recipe_id);
CREATE INDEX production_batches_status_idx ON production_batches (status, created_at DESC);
CREATE INDEX production_batches_produced_at_idx ON production_batches (produced_at DESC);
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

-- Attach the set_updated_at() function defined at the top of this file to
-- every table that carries an updated_at column. BEFORE UPDATE so the new
-- value is written as part of the same row write, and FOR EACH ROW because
-- the function works on NEW, which only exists per row.
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER customer_addresses_set_updated_at
  BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ingredients_set_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER recipes_set_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Costing and analytics views (migration 014). Views, not tables —
-- nothing to keep in sync. Every date is the Asia/Manila calendar day.
-- ---------------------------------------------------------------------------
-- product_costing — each product's cost per item from its most recent
-- APPROVED batch, against its current price. Cost per base unit is the
-- batch's total_cost over its produced_quantity; cost per item multiplies
-- by the packaging ratio snapshotted on the output line, so a gallon of
-- 120 pieces costs ten times a pack of 12 from the same batch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW product_costing AS
WITH latest AS (
  SELECT DISTINCT ON (o.product_id)
         o.product_id, b.batch_id, b.produced_at, b.total_cost, b.produced_quantity, o.units_per_item
    FROM production_batch_outputs o
    JOIN production_batches b ON b.batch_id = o.batch_id
   WHERE b.status = 'APPROVED' AND b.produced_quantity > 0
   ORDER BY o.product_id, b.produced_at DESC, b.batch_id DESC
)
SELECT p.product_id,
       p.product_name,
       p.variant,
       p.price,
       p.recipe_id,
       p.units_per_item,
       l.batch_id AS costed_from_batch_id,
       l.produced_at AS costed_at,
       (l.total_cost / l.produced_quantity * l.units_per_item)::numeric(12, 2) AS unit_cost,
       (p.price - l.total_cost / l.produced_quantity * l.units_per_item)::numeric(12, 2) AS margin,
       CASE WHEN p.price > 0
            THEN ((p.price - l.total_cost / l.produced_quantity * l.units_per_item) / p.price * 100)::numeric(6, 2)
            END AS margin_percent
  FROM products p
  LEFT JOIN latest l ON l.product_id = p.product_id;

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
-- analytics_daily_production — yield per recipe (dough) per day from
-- APPROVED batches: what was planned, what came out, what was lost
-- before packing, what it cost. The production-yield stream.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics_daily_production AS
SELECT (b.produced_at AT TIME ZONE 'Asia/Manila')::date AS local_date,
       b.recipe_id,
       b.recipe_name,
       b.base_unit,
       b.data_source,
       COUNT(*)::int AS batches,
       SUM(b.planned_quantity)::numeric(12, 3) AS planned,
       SUM(b.produced_quantity)::numeric(12, 3) AS produced,
       SUM(b.loss_quantity)::numeric(12, 3) AS loss,
       SUM(b.total_cost)::numeric(12, 2) AS total_cost
  FROM production_batches b
 WHERE b.status = 'APPROVED'
 GROUP BY 1, 2, 3, 4, 5;

-- ---------------------------------------------------------------------------
-- analytics_daily_output — items packed per product per day, with the
-- share of batch cost they carry. This is the supply side a demand model
-- compares against analytics_daily_sales.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics_daily_output AS
SELECT (b.produced_at AT TIME ZONE 'Asia/Manila')::date AS local_date,
       o.product_id,
       b.data_source,
       COUNT(DISTINCT b.batch_id)::int AS batches,
       SUM(o.quantity)::int AS items_produced,
       SUM(o.quantity * o.units_per_item)::numeric(12, 3) AS base_units,
       SUM(CASE WHEN b.produced_quantity > 0
                THEN b.total_cost * (o.quantity * o.units_per_item / b.produced_quantity)
                ELSE 0 END)::numeric(12, 2) AS allocated_cost
  FROM production_batch_outputs o
  JOIN production_batches b ON b.batch_id = o.batch_id
 WHERE b.status = 'APPROVED'
 GROUP BY 1, 2, 3;

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
       SUM(CASE WHEN im.reason = 'CORRECTION' THEN im.quantity_change ELSE 0 END)::int AS correction
  FROM inventory_movements im
  JOIN inventory i ON i.inventory_id = im.inventory_id
 WHERE im.reason IN ('EXPIRED', 'SPOILAGE', 'DAMAGED', 'PRODUCTION_LOSS', 'CORRECTION')
 GROUP BY 1, 2, 3;

COMMIT;
