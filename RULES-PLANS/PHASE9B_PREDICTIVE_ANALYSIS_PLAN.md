# PHASE9B_PREDICTIVE_ANALYSIS_PLAN.md — demand forecasting on assumed history

Status: **implemented 2026-09-25** (commits `66c026c`, and the Forecast
tab after it). The four questions in Part 6 were answered with the
recommendations: a 7-day horizon; ADMIN and CASHIER can view, only ADMIN
runs; ingredient needs stay empty until the owner's real recipes are
entered; the assumption values in Decision 2 are used as written, to be
adjusted with the owner later.

One refinement made while building: a run trains on **either** assumed
history **or** real sales, never both blended on the same day. Mixing
them would average an invented number with a real one into something
that is neither. It also gives the defense a clean demonstration — run on
Real sales and the system correctly reports there is not enough history
yet, then run on Assumed history to show the method working.

Builds on Phase 9A (`PHASE9A_DATA_FOUNDATION_PLAN.md`), which created the
data this reads: the `analytics_daily_sales` view with its stock-out
flag, `data_source` on every event, recipes, and ingredient costs.

---

## Part 0 — The situation this plan is written for

**The adviser approved assumed data** (2026-09-25): the client has not
supplied daily production or sales logs, so the forecasting may be built
and demonstrated on synthetic history, with that stated in the
limitations.

What real data exists today, checked against the live database:

| | Count |
|---|---|
| Days of **real** (`RECORDED`) sales | **2** |
| Product-days of seeded demo sales (`ASSUMED`) | 85, across 41 products |
| Products mapped to a recipe | **0** |

So: there is no real history to train on, and the seeded demo orders are
far too thin — under one sale per product per fortnight. Forecasting
needs roughly **6–12 months of daily history per product**. That has to
be generated, and generating it honestly is most of this plan.

---

## Part 1 — What the feature does, in one paragraph

For each product, it forecasts **how many will sell on each of the next
7 days**, with a range, from history. It tests several forecasting
methods against the past, picks the most accurate one per product, and
says which it picked and how accurate it was. The bakery uses this to
decide **how much to bake**. Once products are mapped to recipes, the
same forecast becomes **how much of each ingredient the week needs**.

---

## Part 2 — Decisions

### Decision 1 — Synthetic history lives in its OWN table, never in orders

The tempting shortcut is to generate a year of fake orders. That would
poison everything else: the Sales report would show revenue that never
happened, payments and inventory ledgers would stop reconciling, and the
"never silently mixed" rule the adviser and the thesis both rely on would
be broken at the source.

Instead:

- A new table **`assumed_daily_demand`** `(local_date, product_id, units,
  generator_version)` holds generated history and nothing else.
- A view **`forecast_training_data`** is the forecaster's only input. It
  is the `UNION` of real daily sales from `analytics_daily_sales`
  (`RECORDED`) and `assumed_daily_demand` (`ASSUMED`), each row labelled.
- **Nothing else reads `assumed_daily_demand`.** Sales, Products,
  Inventory, Production, and the analytics CSV are untouched. The
  assumed year exists only inside the forecaster.

When real logs arrive, they are imported as `IMPORTED` (Phase 9A already
reserved that value) and the forecaster's source filter changes. No
model code changes.

### Decision 2 — The generator is deterministic and every assumption is written down

`scripts/generate-assumed-demand.mjs`, seeded, so the same inputs always
produce the same history — the thesis numbers are reproducible.

Each assumption is a named constant in the script **and** a row in the
table below, which goes into the paper verbatim:

| Assumption | Value | Grounds |
|---|---|---|
| Products and prices | The 41 real products, real prices | From the system |
| Base demand per product | 60 ÷ √price per day — about 27/day at ₱5, 11 at ₱30, 4 at ₱270, 2 at ₱850 | Assumed: cheaper everyday bread sells in far larger numbers |
| Popularity | Base nudged by up to ±30%, ranked by the demo seed's orders | The demo orders are assumed too — used only so two same-priced products differ |
| Day of week | Weekend +25%, Monday −10% | Common bakery pattern; to be confirmed with the owner |
| Payday | +15% on the 15th and last day of the month, and the day after | Philippine semi-monthly pay |
| Holidays | +40% on the days before Christmas and New Year; −30% on the holidays themselves | Assumed; bakery may close |
| Trend | +3% per year | Assumed modest growth |
| Randomness | Poisson noise around the expected value | Real daily counts are whole numbers and vary |
| Stock-outs | Occasional, at a fixed low rate, and flagged | So the model is tested on censored days too |
| History length | 12 months, ending yesterday | Enough for two methods that need a season |

**Stated plainly in the paper:** the model is being tested on its ability
to recover *these* patterns. Its accuracy on this data measures the
method, not Pecto's.

### Decision 3 — Three methods, chosen per product by backtest

All implemented in plain JavaScript in `server/lib/forecasting.js` — no
Python service, no ML library, nothing to deploy separately, and every
line explainable to a panel.

1. **Seasonal naive** (baseline) — next Tuesday = the average of the last
   four Tuesdays. Every forecasting paper needs a baseline; a model that
   cannot beat this one is not worth having.
2. **Holt-Winters** (triple exponential smoothing, weekly season) — the
   standard method for level + trend + weekly pattern.
3. **Linear regression on calendar features** — day of week, payday,
   holiday, trend. The one whose reasoning can be read off its
   coefficients ("paydays add 14%").

**Backtest:** train on all but the last 4 weeks, forecast those 4 weeks,
measure error, pick the method with the lowest error for that product.
Retrain the winner on everything and forecast the next 7 days.

**Error measure:** MAE (average units off) as the headline, plus WAPE
(total error ÷ total sales). Not MAPE: MAPE divides by each day's actual,
and a day that sold zero divides by zero.

**Stock-out days** (Phase 9A's flag) are excluded from training and from
scoring. On those days sales measure the shelf, not demand.

### Decision 4 — Every forecast records what it was made from

`forecast_runs` (run id, when, who, which sources were included, how many
days of each, methods tried) and `forecasts` (run, product, date,
predicted units, low, high, method chosen, backtest MAE and WAPE).

So a forecast on screen can always answer *"what was this trained on?"* —
and a run on assumed data can never be mistaken for one on real data.
The screen shows a badge: **"Trained on assumed history"** whenever
`ASSUMED` was included.

### Decision 5 — Ingredient needs follow from the forecast, but only for mapped products

`forecast units × units_per_item ÷ recipe yield × recipe line` gives the
flour, sugar, and eggs the next 7 days need, compared against stock on
hand.

**This produces nothing today**, because no product is mapped to a
recipe. That is deliberate: recipes are real business data only the owner
can give, and inventing them would fabricate the one part of the output
the bakery would act on most directly. The screen says so and points at
Product Management. See Part 6, question 3.

---

## Part 3 — What gets built

| Piece | What |
|---|---|
| Migration 018 | `assumed_daily_demand`, `forecast_runs`, `forecasts`, and the `forecast_training_data` view |
| `scripts/generate-assumed-demand.mjs` | Deterministic generator; `--clear` removes its rows |
| `server/lib/forecasting.js` | The three methods, backtesting, method selection, intervals |
| `server/routes/forecasts.js` | `POST /api/forecasts/run` (admin), `GET /api/forecasts/latest`, `GET /api/forecasts/runs/:id`, CSV export |
| Reporting → **Forecast** tab | Next-7-days table per product, a chart of history + forecast + range for a chosen product, the method chosen and its error, the source badge, and the ingredient-needs table |
| Tests | Each method against series with known answers (a flat series, a pure weekly pattern, a linear trend); backtest selection; that assumed data never reaches the Sales report; that a run records its sources |

---

## Part 4 — What this does NOT do

- No live forecasting on every page load — a forecast is a deliberate
  run, like a report, and is stored.
- No automatic production orders. The forecast suggests; a person bakes.
- No weather, events, or price-elasticity inputs — no data for them.
- No claims of real-world accuracy until real data exists.

---

## Part 5 — Limitations to write into the thesis

1. The model was trained and evaluated on **assumed** history generated
   from the documented assumptions in Decision 2, because the client's
   production and sales logs were not available. Its measured accuracy
   reflects how well the methods recover those assumed patterns, not how
   well they predict Pecto's Bakery's actual demand.
2. Real sales recorded by the system amount to two days at the time of
   writing; the system is built to retrain on real or imported data
   without code changes as it accumulates.
3. Ingredient forecasting depends on products being mapped to recipes,
   which requires the owner's actual recipes.
4. Forecasts do not account for weather, local events, or promotions.
5. Stock-out days are excluded, so demand on those days is unknown rather
   than estimated.

---

## Part 6 — Questions before building

1. **Forecast horizon — 7 days?** Longer is possible, but accuracy falls
   quickly and a bakery plans baking a day to a week ahead.
2. **Who sees it — ADMIN only, or ADMIN and CASHIER?** Recommendation:
   both can view; only ADMIN can start a new forecast run.
3. **Ingredient needs** — (a) leave it empty until the owner's real
   recipes are entered (recommended), or (b) also generate assumed
   recipes, labelled as such, so the demo shows it working?
4. **The assumption values in Decision 2** — do you want to confirm any
   of them with the owner first (day-of-week and payday effects are the
   ones a panel will ask about), or proceed with these and adjust later?
