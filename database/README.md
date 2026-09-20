# PECTRACK database

`schema.sql` is the PostgreSQL 17 schema for PECTRACK. It includes the paper's core tables plus the three approved corrections:

- `delivery_proofs` for proof-of-delivery files;
- `inventory_change_requests` for cashier proposals and admin approval; and
- `customer_addresses` for multiple delivery addresses and delivery notes.

The database is deliberately not connected to the React application yet. A browser application must communicate with PostgreSQL through a backend API; it must never contain database credentials or connect to PostgreSQL directly.

## Create the local database

After PostgreSQL 17 and its command-line tools are installed, run:

```powershell
createdb -U postgres pectrack
psql -U postgres -d pectrack -f database/schema.sql
```

If your PostgreSQL server uses another user, replace `postgres` with that role. Do not commit a real connection string or password.

## Migrations

`schema.sql` describes a **fresh** database. Once a database exists and holds real data, it is changed by the numbered files in `migrations/` instead, so nothing has to be dropped and recreated.

Both are kept in step: every migration's change is also folded into `schema.sql`, so a new machine gets the same result from `schema.sql` alone that an existing one reaches by applying migrations in order.

Apply them oldest first:

```powershell
psql -U postgres -d pectrack -f database/migrations/001_updated_at_triggers.sql
```

Each migration is written to be safe to run twice, so re-running one you've already applied does nothing rather than failing.

| Migration | What it does |
| --- | --- |
| `001_updated_at_triggers.sql` | Adds a trigger so `updated_at` on `users`, `customers`, and `customer_addresses` is maintained automatically. Those columns were set once on insert and never updated, leaving them permanently equal to `created_at`. |
| `002_otp_challenge_token.sql` | Adds `otp_codes.challenge_token`, which ties an admin's OTP back to the password step that issued it. Without it, `verify-otp` identified the account by username alone, so a valid SMS code was a complete admin login on its own. |
| `003_inventory_movements.sql` | Adds the `inventory_movements` ledger recording every stock change and its cause, and `inventory_change_requests.observed_stock_quantity` so approving a stale proposal applies the difference the cashier observed rather than a stale absolute figure. Prepares for Phase 5 — see PHASE5_PLAN.md. |
| `004_one_pending_request_per_product.sql` | Adds a partial unique index enforcing at most one `PENDING` change request per product. The route already refused a second one, but as a `SELECT` then `INSERT` it could be raced — four concurrent proposals produced four pending rows, whose observed baselines then compound on approval. |
| `005_payment_audit.sql` | Repoints `payments.recorded_by` from `cashiers` to `users`, so an admin recording a payment or a refund has an audit trail instead of a forced `NULL`. Adds `refunded_by` / `refunded_at` / `refund_reason` so a `PAID` → `REFUNDED` transition records who and why. Prepares for Phase 6 — see PHASE6_PLAN.md. |
| `006_one_pending_payment_per_order.sql` | Adds a partial unique index enforcing at most one `PENDING` payment per order. A live PayMongo Checkout Session payment can't be refused after the fact if it would overpay the order — the customer's money has already moved by the time the webhook confirms it — so a double-click creating two pending gateway intents has to be stopped before either completes. Prepares for Phase 6.5 — see PHASE6.5_PLAN.md. |
| `007_product_image.sql` | Adds `products.image_key`, a nullable storage key for one product photo, served and uploaded by `routes/products.js`. Prepares for the customer storefront's Menu page — see STOREFRONT_PLAN.md. |
| `008_inventory_loss_reasons.sql` | Adds `PRODUCTION_LOSS`, `EXPIRED`, and `DAMAGED` to `stock_movement_reason`, and gives `inventory_change_requests` a delta-shaped loss report (`quantity_change` + `movement_reason`) alongside the absolute recount, so an approved loss keeps its real cause on the ledger instead of collapsing to `CORRECTION`. See INVENTORY_REVIEW.md. |
| `009_gateway_refunds.sql` | Adds `payments.gateway_payment_id` (PayMongo's `pay_...` id, learned from the `payment.paid` webhook) and `payments.refund_reference` (the PayMongo refund id once issued), so cancelling a paid online order can refund the money at the gateway, not only on the ledger. `server/lib/refunds.js` retries rows whose gateway refund is still owed. |
| `010_password_reset_tokens.sql` | Adds `password_reset_tokens` for email-based password recovery (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`). Holds only a hash of the token; single-use and time-bounded. |
| `011_ingredients.sql` | Adds `ingredients` (stock, minimum, moving-average cost, unit) and the `ingredient_movements` ledger with its own reason enum. Phase 9A — see PHASE9A_DATA_FOUNDATION_PLAN.md. |
| `012_recipes.sql` | Adds `recipes` (a dough with a yield in its own base unit), `recipe_ingredients`, and `products.recipe_id` / `units_per_item` / `shelf_life_days` so several products can pack from one recipe. |
| `013_production.sql` | Adds `production_batches` with ingredient lines and packed outputs, the `data_source` enum (`RECORDED` / `IMPORTED` / `ASSUMED`) on orders, batches and ingredient movements, `PRODUCTION` in `stock_movement_reason`, and `batch_id` on both ledgers. Only an APPROVED batch moves stock. |
| `014_analytics_views.sql` | Adds the `product_costing`, `analytics_daily_sales` (with the stockout flag), `analytics_daily_production`, `analytics_daily_output` and `analytics_daily_waste` views — the analytics-ready shape, computed from the ledgers, never stored. |
