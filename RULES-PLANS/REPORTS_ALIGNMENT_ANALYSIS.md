# Reporting & Analytics vs the new inventory and order process: analysis (2026-10-24)

No code changed. This is an analysis of what no longer matches since the October revisions:
- advanced orders;
- soft and hard breads with the 5:00 AM top-up;
- rejects removed and Correct count added;
- the client's notes on weekends and events (Pahiyas).

## 1. What still fits

- **Sales** totals money by the day an order was placed ("Ordered") and the day it was paid ("Collected"). Walk-ins and advanced orders are both paid orders, so the totals are right.
- **Products** ranks products by quantity and revenue from `order_details`. Every order type is included.
- **Transactions** lists paid payments. It is right.
- **Peak ordering periods** (hour and weekday) already shows the weekend peak the client describes, and it is labelled when assumed data is in it.
- **Weekends in the forecast.** All three methods already model the day of the week:
  - seasonal-naïve: same weekday;
  - Holt-Winters: weekly season;
  - regression: a variable for each weekday.

  The assumed history makes weekends busier. So the forecast *already predicts more on Saturday and Sunday*, which matches the client.

## 2. What no longer matches

| # | Where | Problem | Why it matters |
|---|---|---|---|
| A | Inventory report, **"Stock lost"** headline and the per-product **Rejected** figure | Both count `REJECT` rows. Rejects are no longer recorded, so these will always read 0. Losses now appear as **negative Correct counts** (`CORRECTION`), which the report shows only as "Correction (recount)". | The report says "no losses" when bread was in fact thrown away. |
| B | Inventory report, **movement totals** | The 5:00 AM top-up's reason `DAILY_STOCK` has no label, so it shows as the raw code. | It looks broken, and the top-up (the main "automated" step) is not named. |
| C | Inventory report, **"Needs attention"** | It still uses the old minimum rule (stock alerts). Soft breads usually have minimum 0, so they never appear, even when sold out. It does not use the new statuses (About to be sold out / Sold out today / Low stock). | It disagrees with the Products screen and the Dashboard tiles. |
| D | **Forecast → "What to bake"** and the Dashboard tile **"Likely to sell out"** | Both use the old restock rule: *cover 2 days + margin − stock*. The new Production tab uses the client's real rule: *soft = standard − shelf + advanced orders; hard = stop level − stock at the minimum*. | **Two different answers to "how many to bake?"** in two tabs. And "likely to sell out" is expected for soft breads: they are *meant* to sell out daily. |
| E | Forecast **training data** (`analytics_daily_sales`) | Daily sales are read from the stock ledger (`ORDER_PLACED` rows, on the day the order was placed). (1) A soft-bread advanced order writes **no** ledger row, because it is baked on its pickup day, so **it is missing from the sales history entirely**. (2) Any advanced order counts on the day it was *placed*, not the day it was *picked up and eaten*. | Real demand is under-counted, and on the wrong days. A Pahiyas pre-order placed a week early lands in the wrong week. |
| F | Forecast and **sold-out days** | A soft bread that sells out by noon sold its *standard*, not its *demand*. The forecast already treats a stock-out day as "censored" and skips it. With daily standards, many peak days (weekends) will be censored. | Fewer usable days, and **peak days drop out exactly where they matter**. The fix is not bigger, but it is worth stating in the paper's limitations. |
| G | **Events** (Pahiyas and others) | The calendar features know only payday and Christmas/New Year (eve and day). There is nothing for **Pahiyas (May 15)** or other local occasions. The assumed history has no event uplift either, so the model cannot learn one. The daily standard is one fixed number with no event or weekend version. | The client raises the standard for events, and the system cannot express that, or forecast it. |

## 3. Proposal (to confirm before building)

### Reports (small fixes)
1. **Inventory report**
   - Label `DAILY_STOCK` as "5:00 AM top-up (soft breads)".
   - Replace the "Stock lost" headline with **"Corrected down"**: the total of negative counts.
   - Keep older reject rows counted in past date ranges.
2. **"Needs attention"** uses the same statuses as Inventory and the Dashboard: soft *sold out / about to be sold out today*, hard *low stock*. Alternatively, remove it, since the Dashboard already shows these.
3. **New, optional:** a **"Baked vs sold" table** per soft bread per day: topped up, added, sold, left, sold out at. It shows leftover and sold-out days, the bakery's real waste and lost-sales signals.

### Forecast (alignment)
4. **One answer to "how many to bake":**
   - The Forecast tab no longer recommends its own amount.
   - Instead it **suggests the daily standard**. Example: "Pandesal: standard 300, forecast Saturday 345, consider 350 on weekends."
   - The **Production tab stays the only bake list.**
   - The Dashboard "Likely to sell out" tile is dropped, because a soft bread selling out is normal.
5. **Correct the sales history:**
   - Count each advanced order **on its pickup day**, including soft breads that never touched the shelf.
   - Keep walk-in and online sales on the day they were sold.

   This is a change to the analytics view (one migration).

### Weekends and events (new)
6. **Weekend standard:**
   - A soft bread gets an optional **weekend standard**, used by the 5:00 AM top-up on Saturday and Sunday.
   - The client already sees weekend peaks; this lets the system act on them.
   - Alternative: one standard per weekday (7 numbers), which is more flexible but more to fill in.
7. **Events calendar** (admin): **name, dates, and the increase**. Each event:
   - **raises the standard** for soft breads on those days, in the 5:00 AM top-up and the Production list. Example: Pahiyas May 14–15, +50%;
   - is shown on the Production list and the Forecast chart ("Pahiyas: standard raised");
   - becomes an **"event" variable in the forecast regression**, so the model learns how much events add once real data covers one;
   - is filled in ahead, with Lucban and Philippine occasions: **Pahiyas (May 15)**, Christmas Eve / New Year's Eve (already in), **All Saints / Undas (Nov 1–2)**, Holy Week. The admin edits the list.
8. **Assumed history:** add a Pahiyas uplift to the generated year, so the forecast shows the event today, labelled assumed like the rest.

## 4. Questions for the client

1. **Which events, and when?** Pahiyas (May 15, and how many days before?). Any others, such as the Lucban town fiesta, Undas, Holy Week, Christmas season, or school events?
2. **By how much do they raise the standard for an event?** A percentage for all soft breads (for example +50%), or a number per product?
3. **Weekends:** do they already bake more on Saturday and Sunday? If so, one weekend figure, or different for Saturday and Sunday?
4. Is the "Baked vs sold" table useful to them, or is it too much?

## 5. Paper impact

- **Predictive Analytics:**
  - The forecast now feeds the **daily standard and event planning**, not a separate restock number.
  - Weekend and event effects are named variables in the regression.
- **Automated Inventory:** the 5:00 AM top-up follows the weekend and event standards automatically.
- **Limitations:**
  - sold-out (censored) days hide true demand on peak days;
  - the event effect is assumed until a real event has been recorded.

## 6. Client answers and decisions (2026-10-24)

**Events:** Holy Week, Pahiyas, Christmas, New Year and long weekends. On an event, production is **x4**; on weekends (Saturday and Sunday) it is **x2**.

**What gets more:** mostly **hard breads**, bought by tourists as pasalubong. Soft breads keep about 3 days and do not sell much more on these days.

**Lead time:** production is prepared **1 week before** an event.

Further decisions by the user:
- weekend production builds up **from Thursday**;
- **soft breads do not change** on events or weekends;
- **long weekends are added by the admin**, since they change every year.

### Build

1. **Events calendar** (migration 036, `events`): name, start and end dates, multiplier (default x4), applies to (hard / soft / both, default hard), and lead days (default 7).
   - Pre-filled: Holy Week 2027 (Mar 24–28), Pahiyas (May 14–15, 2027), Christmas (Dec 24–25, 2026) and New Year (Dec 31, 2026 – Jan 1, 2027).
   - The admin manages the list in Inventory → Production → Events.
2. **Production list for hard breads:** each day is checked for a boost.
   - The boost comes from an event when the day falls within its lead days or on the event itself, and from the weekend (x2) on Thursday to Sunday. The larger one wins.
   - While boosted, the hard bread is made **up to stop level × factor**, whatever the minimum. Outside a boost, the usual rule applies.
   - The list says why, for example "Pahiyas x4" or "Weekend x2".
3. **Soft breads:** no automatic change. If the admin sets an event to soft or both, the 5:00 AM top-up and the list use standard × multiplier on the event days themselves.
4. **Forecast:**
   - the regression gets an **"event"** variable from the calendar;
   - the generator for the assumed history models hard breads as x4 on events and x2 on weekends. Re-generating the assumed data is a separate step and needs approval.
5. **Report fixes** A, B, C and D from section 2:
   - a label for `DAILY_STOCK`;
   - "Corrected down" instead of "Stock lost";
   - "Needs attention" uses the same statuses as the rest of the app;
   - the Forecast tab's "What to bake" and the Dashboard's "Likely to sell out" are dropped; the Production tab is the bake list.
6. **Later:** E (counting advanced orders on their pickup day in the forecast history) needs an analytics-view rewrite. It waits until real sales history is used.
