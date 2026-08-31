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
CREATE TABLE otp_codes (
  otp_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
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
CREATE INDEX order_status_history_order_id_idx ON order_status_history (order_id, updated_at);

COMMIT;
