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
CREATE TYPE stock_movement_reason AS ENUM (
  'ORDER_PLACED', 'ORDER_CANCELLED', 'RESTOCK', 'SPOILAGE', 'CORRECTION'
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
  availability_status BOOLEAN NOT NULL DEFAULT TRUE
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
  recorded_by BIGINT REFERENCES cashiers(cashier_id),
  payment_method VARCHAR(50) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status payment_status NOT NULL DEFAULT 'PENDING',
  gateway_reference VARCHAR(255) UNIQUE,
  payment_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  reason TEXT NOT NULL,
  status change_request_status NOT NULL DEFAULT 'PENDING',
  reviewed_by BIGINT REFERENCES admins(admin_id),
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (request_type = 'INVENTORY' AND (proposed_stock_quantity IS NOT NULL OR proposed_min_stock_level IS NOT NULL))
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
CREATE INDEX inventory_movements_inventory_id_idx ON inventory_movements (inventory_id, created_at DESC);

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

COMMIT;
