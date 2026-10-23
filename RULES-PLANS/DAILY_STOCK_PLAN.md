# Soft breads and hard breads: daily stock plan (client, 2026-10-23)

## The client's process

The bakery treats its two kinds of bread differently.

### Soft breads (keep about 3 days)
- Each day starts with a **standard stock**.
- Nothing is restocked during the day. When a product sells out, it stays off sale until tomorrow.
- The next day's production is the standard stock again.

### Hard breads (keep much longer)
- Stock carries over from day to day.
- Production continues while stock is at or below a **minimum of about 200**.
- Once stock reaches **about 500–700**, production stops, typically for about a week.

### Both kinds
- Extra stock is added only for a bulk order or an advanced order (reservation).

## What the user approved (2026-10-23)

| # | Change | Answer |
|---|---|---|
| 1 | A standard daily stock per product | Yes |
| 2 | An automatic morning reset at 5:00 AM | Yes, **soft breads only** |
| 3 | Advanced orders count toward their pickup day | Yes |
| 4 | A list of tomorrow's production | Yes |
| 5 | Dashboard wording ("Selling out today" and "Sold out" instead of "go restock") | Yes |

## Design

### Bread type on each product (migration 035)
- `products.stock_type` is `SOFT` or `HARD`. The admin sets it in **Edit Products** on the product form, as **Bread type: Soft / Hard**.
- It is a product attribute, separate from the menu categories (Breads, Ensaymada, …). Those stay as they are for customers.
- Existing products default to `SOFT` until the admin changes them.
- Fields on `inventory`:
  - `standard_stock`: the daily standard. Soft breads only.
  - `min_stock_level`: already exists. For hard breads it is the reorder point (for example 200).
  - `target_stock`: new. For hard breads it is the stop level (for example 600).

### Soft breads
- **Morning reset.** At 5:00 AM Manila (the opening time), a job sets each soft bread's shelf stock to its standard stock.
  - The job runs once per day. A `daily_stock_resets` row records which days were done, so a restart never resets twice.
  - Each reset writes a ledger row with the new reason `DAILY_STOCK`.
- **During the day.** Sales deduct stock as now. At 0 the product is sold out, refused by checkout, and shown as "Sold out" until tomorrow's reset.
- **Advanced orders for a soft bread** do **not** touch today's shelf stock. They are baked on their pickup day, on top of the standard, so walk-in stock is never emptied by next week's reservation.
- **Leftovers at the reset:** see open question A.

### Hard breads
- No reset. Stock carries over.
- **Status:**
  - **Low stock** at or below the minimum: start production.
  - **Stocked** at or above the target: stop production.
- Advanced orders deduct from stock when they are placed, as now. There is plenty on hand.

### Tomorrow's production (Inventory, new tab: Production)
- **Soft bread:** standard stock + pieces in advanced orders picked up tomorrow.
- **Hard bread:** if stock is at or below the minimum, *target − stock + advanced orders due within the week*. Otherwise "Not needed (stock N)".
- The forecast's prediction for tomorrow is shown beside each line, for reference.
- The list is printable.

### Dashboard
- Soft breads: "Selling out today" (under 20% of the standard left) and "Sold out today".
- Hard breads: "Low stock (produce)" at or below the minimum.
- Nothing says "restock" for soft breads.

## Decisions (the user, 2026-10-23)

- **A. Leftovers: top up.**
  - At 5:00 AM a soft bread's stock becomes the larger of *what is left* and *the standard*. Leftovers are sold first; the bakery bakes only the difference.
  - The reset logs `+(standard − left)` as `DAILY_STOCK`. Nothing is logged when the leftovers already meet the standard.
  - Example: standard 300, 40 left, so 260 are baked and the shelf has 300.
- **B. Hard-bread levels: per product.** Each hard bread has its own minimum and stop level. They default to 200 and 600 when a product is first set to Hard.
- **C. Stop rule: until it falls to the minimum.**
  - At or below the minimum, the production list says *produce target − stock*.
  - Above the minimum, it says "Not needed".
- **D. Bread type: a field on the product** ("Bread type: Soft / Hard" in Edit Products). Menu categories are unchanged.

## Build notes

- **Cancelling an order** now returns only what the order actually took off the shelf, read from its `ORDER_PLACED` ledger rows. The reason: a soft-bread advanced order never took any stock, so returning its quantity on a cancel would add bread that was never there.
- **Soft-bread advanced orders:**
  - They are baked on their pickup day, outside the shelf stock. The production list adds them to that day's bake.
  - At pickup the staff hand them over, and no shelf stock moves.
- **Limitation:** the system does not track how old a leftover soft bread is. Top up assumes leftovers are sold within their ~3-day life. Pulling stale ones is a reject (Edit Products → Rejects).
