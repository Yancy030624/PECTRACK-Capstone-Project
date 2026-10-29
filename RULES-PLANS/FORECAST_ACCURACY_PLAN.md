# Forecast accuracy on the Forecast tab (2026-10-30)

**Why:** the panel's major revision at the mock defense (2026-10-26) asked how the
group can be sure the forecast is reliable after the switch to real sales at
56 days. The answer agreed in the paper grill (docs/papers-fix/CHAPTER_GRILL.md,
Round 11) is: the system **measures** each product's accuracy and **shows** it
beside the same-day-last-week benchmark. Nothing waits on "trust us after 56 days".

**Needs the adviser's OK before building** (it changes the Forecast tab).

**Decisions (confirmed with the user, 2026-10-30):**
- The switch rule does **not** change. The nightly run still trains on ONE source
  for every product (`nightlySourceFor` in `server/lib/forecastRun.js`): ASSUMED
  until 56 days of real sales, REAL after. No per-product switching, because a
  run must never mix assumed and real data.
- The rejected idea, "switch a product only when it beats seasonal naïve", is
  not built: the benchmark is one of the candidates, so the chosen method can
  never be worse than it, and a product whose best method IS the benchmark
  would never switch.
- No backend change. `GET /api/forecasts/latest` already returns `mae`,
  `baselineMae` and `wape` per product (`server/routes/forecasts.js:94-96`), and
  `forecast_models.candidates` keeps every method's score.

Build in the order F1–F3, one commit each. Run `npm test` and `npx vite build`
after each.

## F1. Accuracy column in "Expected sales, day by day"

File: `src/pages/dashboard/ForecastPanel.jsx`.

- Add a column **"Usual miss"** after "This week": `±{whole(Math.max(1, mae))} a day`,
  or "Not measured" when `mae` is null (history shorter than 56 days, see
  `forecastProduct` in `server/lib/forecasting.js:342`).
- Add a column **"Same day last week"** (priority `md`): the benchmark's miss,
  `±{whole(Math.max(1, baselineMae))}`, or "—" when null.
- Add a small tag after the product name when `mae < baselineMae - 1e-9`:
  "Better than last week's pattern". When the chosen method is
  `seasonal_naive`, the tag reads "Last week's pattern is best". No tag when
  either value is null.
- The columns print (no `print:hidden`).

## F2. Summary card: how many products beat the benchmark

Same file. Bring back a third `SummaryCard` (the grid goes back to
`sm:grid-cols-3`):

- Label: `isAssumed ? 'Method test (practice data)' : 'Measured accuracy'`.
- Value: `${beat} of ${scored} products` beat same-day-last-week, where
  `scored` counts products with both `mae` and `baselineMae`, and `beat`
  counts `mae < baselineMae - 1e-9`. "Not measured yet" when `scored` is 0.
- Note: practice data → "Tested on the assumed history — shows the method,
  not Pecto's real sales". Real sales → "Tested on four past weeks it had not
  seen". No percentage: the earlier "About N% accurate" card (removed by
  Codex in d0db088) read as a promise about real demand.

## F3. The explanation under "How the forecast works"

Same file, the `<details>` text (around line 334). Replace the MAE sentence with:

> "Usual miss" is the average number of pieces the forecast was off per day when
> it was tested on four past weeks it had not seen (mean absolute error).
> "Same day last week" is the miss of the simplest estimate, the same day of
> the previous week; a method is used only if it does at least as well. The
> forecast learns from the assumed history until 56 days of real sales are
> recorded, the shortest history on which its accuracy can be measured, and
> from the real sales after that.

Keep the sentence on sold-out days.

## Tests

No server code changes, so no new server tests. Check by hand on the local
database: run a forecast on practice data (Reporting & Analytics → Forecast →
Run), confirm the columns, the tags, the card and its practice-data label,
and print the page.

## Paper

The wording is already in docs/papers-fix/CHAPTER_GRILL.md (Rounds 1, 2, 3d,
4c, 5c, corrected in Round 11). If the adviser declines F1–F3, use the
fallback sentences marked there.
