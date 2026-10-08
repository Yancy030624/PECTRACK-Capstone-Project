# Code walkthrough — annotated copies

These files are **annotated study copies** of the server code as it was
when each module was first explained to the team. They are **not run** by
the application and they are **not up to date**: the live code in
`server/lib/` and `server/routes/` has moved on, and each file's header
lists what changed since it was written.

Use them to learn how a module was built and why. For what the system
does today, read the live files — every change there is commented in
place.

| Folder | Annotated copy of |
|---|---|
| `lib/` | `server/lib/*.js` — accounts, auth, billing, inventory, mail, PayMongo, refunds, reporting, storage, validation |
| `routes/` | `server/routes/*.js` — addresses, auth, categories, customers, deliveries, forecasts, inventory, orders, payments, products, reports, staff |

They were moved here from `server/` on 2026-10-08 so they can no longer
be mistaken for running code (RULES-PLANS/PAPER_VS_SYSTEM.md, item H3).
