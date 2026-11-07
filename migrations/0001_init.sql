-- NOORIX DIGITAL LAB — initial schema (Cloudflare D1 / SQLite)
-- Money = INTEGER paisa (PKR minor units). Timestamps = UTC ISO-8601 text.
PRAGMA foreign_keys = ON;

-- ───────────── Identity ─────────────
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  is_staff INTEGER NOT NULL DEFAULT 0 CHECK (is_staff IN (0,1)),
  email_verified_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_users_staff ON users(is_staff);
CREATE INDEX idx_users_created ON users(created_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                 -- SHA-256 of the cookie token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  ip TEXT, user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  rotated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_exp ON sessions(expires_at);

CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_prt_user ON password_reset_tokens(user_id);

CREATE TABLE email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_evt_user ON email_verification_tokens(user_id);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL        -- unix seconds
);

-- ───────────── RBAC ─────────────
CREATE TABLE roles (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT
);
CREATE TABLE permissions (
  code TEXT PRIMARY KEY, description TEXT NOT NULL
);
CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);
CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- ───────────── Catalogue ─────────────
CREATE TABLE product_categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE provider_integrations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  config TEXT NOT NULL DEFAULT '{}',          -- non-secret JSON (endpoint paths, timeouts)
  status TEXT NOT NULL DEFAULT 'awaiting_credentials',
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category_id TEXT NOT NULL REFERENCES product_categories(id),
  name TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_key TEXT,                              -- R2 key (optional)
  brand_color TEXT NOT NULL DEFAULT '#087BFF',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','hidden')),
  delivery_type TEXT NOT NULL DEFAULT 'manual' CHECK (delivery_type IN ('automatic','manual','api')),
  features TEXT NOT NULL DEFAULT '[]',         -- JSON string[]
  input_fields TEXT NOT NULL DEFAULT '[]',     -- JSON [{key,label,type,required,help}]
  terms TEXT NOT NULL DEFAULT '',
  refund_eligible INTEGER NOT NULL DEFAULT 0 CHECK (refund_eligible IN (0,1)),
  refund_policy TEXT NOT NULL DEFAULT '',
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  is_trending INTEGER NOT NULL DEFAULT 0 CHECK (is_trending IN (0,1)),
  is_deal INTEGER NOT NULL DEFAULT 0 CHECK (is_deal IN (0,1)),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  sales_count INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT REFERENCES provider_integrations(id),
  seo_title TEXT, seo_description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_products_cat ON products(category_id, status);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_flags ON products(is_featured, is_trending, is_deal);

CREATE TABLE product_plans (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_label TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price > 0),
  compare_price INTEGER CHECK (compare_price IS NULL OR compare_price >= 0),
  stock_limit INTEGER CHECK (stock_limit IS NULL OR stock_limit >= 0),   -- manual/api only; NULL = unlimited
  provider_sku TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_plans_product ON product_plans(product_id, status);

CREATE TABLE product_inventory (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES product_plans(id) ON DELETE CASCADE,
  secret_enc TEXT NOT NULL,                    -- AES-GCM ciphertext (never plaintext)
  secret_hash TEXT NOT NULL,                   -- SHA-256 of plaintext to block duplicates
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','delivered','void')),
  order_item_id TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  delivered_at TEXT,
  UNIQUE (plan_id, secret_hash)
);
CREATE INDEX idx_inv_avail ON product_inventory(plan_id, status);
CREATE UNIQUE INDEX idx_inv_item ON product_inventory(order_item_id, id) WHERE order_item_id IS NOT NULL;

-- ───────────── Marketing ─────────────
CREATE TABLE coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value INTEGER NOT NULL CHECK (value > 0),    -- percent (1-100) or paisa
  min_order INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  per_user_limit INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT, expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (type <> 'percent' OR value <= 100),
  CHECK (max_uses IS NULL OR used_count <= max_uses)
);

CREATE TABLE homepage_banners (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL, subtitle TEXT, image_key TEXT,
  cta_label TEXT, cta_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

-- ───────────── Wallet & payments ─────────────
CREATE TABLE wallet_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('deposit','purchase','refund','adjustment')),
  amount INTEGER NOT NULL CHECK (amount <> 0),          -- signed paisa
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (reference_type, reference_id, kind)           -- idempotency: one ledger row per business event
);
CREATE INDEX idx_wtx_user ON wallet_transactions(user_id, created_at);

-- Ledger is immutable.
CREATE TRIGGER wallet_tx_no_update BEFORE UPDATE ON wallet_transactions
BEGIN SELECT RAISE(ABORT, 'wallet_transactions is immutable'); END;
CREATE TRIGGER wallet_tx_no_delete BEFORE DELETE ON wallet_transactions
BEGIN SELECT RAISE(ABORT, 'wallet_transactions is immutable'); END;

CREATE TABLE payment_methods (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('manual','gateway')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  account_title TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  min_amount INTEGER NOT NULL DEFAULT 10000,
  max_amount INTEGER NOT NULL DEFAULT 50000000,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  method_code TEXT NOT NULL REFERENCES payment_methods(code),
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_reference TEXT,                      -- transaction id / TID entered by the customer
  sender_name TEXT, sender_account TEXT,
  proof_key TEXT,                              -- R2 key of the payment screenshot
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id),
  review_note TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_dep_user ON deposits(user_id, created_at);
CREATE INDEX idx_dep_status ON deposits(status, created_at);
CREATE UNIQUE INDEX idx_dep_ref ON deposits(method_code, payment_reference) WHERE payment_reference IS NOT NULL;

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  signature_valid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (provider, event_id)
);

-- ───────────── Orders ─────────────
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','cancelled','refunded','failed')),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total INTEGER NOT NULL CHECK (total >= 0),
  coupon_id TEXT REFERENCES coupons(id),
  coupon_code TEXT,
  idempotency_key TEXT NOT NULL,
  customer_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX idx_orders_user ON orders(user_id, created_at);
CREATE INDEX idx_orders_status ON orders(status, created_at);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  plan_id TEXT NOT NULL REFERENCES product_plans(id),
  product_name TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL CHECK (unit_price > 0),
  discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
  paid INTEGER NOT NULL CHECK (paid >= 0),         -- unit_price - discount share
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('automatic','manual','api')),
  refund_eligible INTEGER NOT NULL DEFAULT 0,
  customer_input TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed','cancelled','refunded')),
  provider_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);
CREATE INDEX idx_oi_order ON order_items(order_id);
CREATE INDEX idx_oi_plan ON order_items(plan_id);
CREATE INDEX idx_oi_status ON order_items(status, delivery_type);

CREATE TABLE order_deliveries (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('credential','text','file')),
  content_enc TEXT,                         -- AES-GCM ciphertext for text/credential
  file_key TEXT, file_name TEXT,            -- R2 for file deliveries
  note TEXT,
  delivered_by TEXT REFERENCES users(id),   -- NULL = automatic
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_od_item ON order_deliveries(order_item_id);

CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_oe_order ON order_events(order_id, created_at);

CREATE TABLE coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupons(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_cr_coupon_user ON coupon_redemptions(coupon_id, user_id);

CREATE TABLE refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_item_id TEXT NOT NULL REFERENCES order_items(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processed','rejected')),
  requested_by TEXT REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processed_at TEXT
);
CREATE UNIQUE INDEX idx_refund_item_open ON refunds(order_item_id) WHERE status IN ('requested','processed');
CREATE INDEX idx_refund_status ON refunds(status, created_at);

CREATE TABLE provider_order_logs (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  provider_id TEXT REFERENCES provider_integrations(id),
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,                      -- awaiting_credentials | sent | confirmed | failed | retry
  request_summary TEXT, response_summary TEXT, error TEXT,
  next_retry_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_pol_item ON provider_order_logs(order_item_id);
CREATE INDEX idx_pol_retry ON provider_order_logs(status, next_retry_at);

-- Guard table: inserting ok=0 aborts (and rolls back) a whole D1 batch.
CREATE TABLE guards (id INTEGER PRIMARY KEY AUTOINCREMENT, ok INTEGER NOT NULL CHECK (ok = 1), label TEXT);

-- ───────────── Support ─────────────
CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY,
  ticket_no TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_customer','resolved','closed')),
  order_id TEXT REFERENCES orders(id),
  assigned_to TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_tk_user ON support_tickets(user_id, updated_at);
CREATE INDEX idx_tk_status ON support_tickets(status, updated_at);

CREATE TABLE support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  is_staff INTEGER NOT NULL DEFAULT 0,
  is_internal INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  attachment_key TEXT, attachment_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sm_ticket ON support_messages(ticket_id, created_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_nf_user ON notifications(user_id, read_at, created_at);

CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ───────────── Content / settings / audit ─────────────
CREATE TABLE site_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE cms_pages (
  slug TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE faqs (
  id TEXT PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT, entity_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_time ON admin_audit_logs(created_at);
CREATE INDEX idx_audit_actor ON admin_audit_logs(actor_id, created_at);
