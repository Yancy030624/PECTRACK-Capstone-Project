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
