# Live stock — plan

The panel asked for inventory that updates without refreshing the browser (mock defense, 2026-10-26). The user chose a live push over faster polling (2026-10-27): **PostgreSQL LISTEN/NOTIFY → Server-Sent Events**. No new library and no outside service.

## How it works

1. **The database announces every stock change.** Migration 041 adds a trigger on `inventory` and on `ingredients`. Whenever a row is inserted, deleted or its stock or levels change, the trigger calls `pg_notify('stock_changed', '<table>')`.
   - It sits in the database, so it catches **every** writer at once: orders, cancellations, released unpaid orders, the 5:00 AM top-up, Add, Correct count, level edits, ingredient restocks, and the demo-data scripts. No route has to remember to announce anything.
   - `NOTIFY` is transactional. A notification is delivered only when the transaction **commits**, so an order that fails and rolls back never announces a change that did not happen.
2. **The server listens.** `server/lib/liveStock.js` keeps one dedicated database connection (not from the pool) running `LISTEN stock_changed`. It starts on the first viewer, and reconnects with a growing delay (1 s up to 30 s) if the connection drops.
3. **The server pushes to open screens.** `GET /api/inventory/live` is a Server-Sent Events stream (admin and cashier only, like the rest of `/api/inventory`). Every notification is forwarded as one event: `event: stock` with `data: inventory` or `data: ingredients`. A comment line every 25 seconds keeps proxies (Railway) from closing a quiet connection.
4. **The screen re-reads.** `src/lib/useLiveStock.js` opens an `EventSource` and, on each event, re-loads the list through the normal API call, quietly (no loading skeleton). Changes that arrive within 300 ms are merged into one reload. After a reconnect it reloads once, to catch anything missed while disconnected.

## Decisions

- **The event carries no stock numbers**, only which table changed. The screen fetches the numbers through the normal, permission-checked API. A stream left open after sign-out learns nothing but "something changed".
- **Server-Sent Events, not WebSockets.** Stock flows one way, server to screen. SSE is plain HTTP, built into every browser (`EventSource`) and Express, and reconnects by itself.
- **Not counted as activity.** The stream is marked as a background request, like the self-refreshing Dashboard, so an open screen does not keep an idle staff session alive.
- **Where it is used:** Inventory → Products, Production and Ingredients. The Dashboard and the notification bell keep their 20-second refresh.
- **One server, many screens.** Each server process holds one `LISTEN` connection, whatever the number of open screens. More server instances would each listen on their own, which also works.

## Files

| File | Change |
|---|---|
| `database/migrations/041_live_stock.sql` | Trigger function `notify_stock_changed()` and triggers on `inventory` and `ingredients` |
| `database/schema.sql` | The same function and triggers, for fresh databases |
| `scripts/check-migrations.mjs` | Recognises 041 by its trigger |
| `server/lib/liveStock.js` | The `LISTEN` connection and the list of open streams |
| `server/routes/inventory.js` | `GET /api/inventory/live` |
| `server/routes/inventory.test.js` | A stock change reaches an open stream; a customer cannot open one |
| `src/lib/useLiveStock.js` | The browser side |
| `src/pages/dashboard/InventoryManagement.jsx`, `ProductionPanel.jsx`, `IngredientsPanel.jsx` | Reload quietly on each event |

## Deploying

Run migration 041 on Railway **before** pushing; without the trigger the stream opens but never fires, and the screens behave as they do today.
