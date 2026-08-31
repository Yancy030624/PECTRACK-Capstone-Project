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
