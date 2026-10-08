// ============================================================================
// WHAT CHANGED SINCE THIS ANNOTATED COPY WAS WRITTEN
//
// This file is a frozen, annotated copy of routes/forecasts.js as it stood when the
// module was first explained. The live file has moved on:
//
//   - Phase 10 B1: every forecast response carries `restock` — per product,
//     when it runs out and how many to bake to cover today and tomorrow
//     (server/lib/restock.js).
//
//   - Migration 022: the ingredient projection and restock batch counts
//     are gone with recipes; restock gives a bake quantity in items.
//
// Read the live file for the current behaviour — every change above is
// commented in place there, in the same voice as this file.
// ============================================================================

// ============================================================================
// PECTRACK API — routes/forecasts.js and lib/forecasting.js (annotated for learning)
// Demand forecasting — Phase 9B, RULES-PLANS/PHASE9B_PREDICTIVE_ANALYSIS_PLAN.md.
// Mounted at /api/forecasts.
//
// THE QUESTION IT ANSWERS: how many of each product will sell on each of
// the next seven days — so the bakery can decide how much to bake, and,
// for products mapped to a recipe, how much flour and sugar the week needs.
//
// THE DATA IT READS: one view, forecast_training_data, which is either
//   - the generated year in assumed_daily_demand (ASSUMED), or
//   - sales the system actually recorded or imported (REAL).
// A run picks ONE, never a blend. Generated history lives in its own table
// and nothing but the forecaster reads it, so it can never show up as
// revenue in a sales report. The adviser approved assumed data on that
// condition, and the thesis states it as a limitation.
//
// HOW A RUN WORKS (POST /api/forecasts/run, admin only):
//   1. Read every product's daily history up to YESTERDAY in Manila — today
//      is not over, and half a day would read as a slump.
//   2. Fill days with no row as zero: the sources record every sale, so a
//      missing day sold nothing.
//   3. For each product, lib/forecasting.js tries three methods:
//        seasonal_naive  average of the last four same weekdays (baseline)
//        holt_winters    level + trend + weekly pattern, smoothed
//        regression      day of week, payday, holidays, trend
//      and scores each with a rolling backtest: forecast a week as if it
//      were four weeks ago, compare with what happened, step forward, four
//      times. The lowest average error (MAE) wins; on a tie, the simpler.
//   4. Stock-out days are excluded from fitting and scoring — on those days
//      sales measure the shelf, not the demand.
//   5. The winner is refit on everything and forecasts seven days, with a
//      range built from its own backtest misses (~80% of days inside it).
//   6. Everything is stored: the run (who, when, which data, how many days
//      of it), each product's chosen method and error, and each day.
//
// READING IT (GET /latest, /history/:productId — admin and cashier): the
// latest run, the chart data for one product, and ingredient needs:
//   forecast items × base units per item ÷ recipe yield × the recipe line.
// That last part stays empty until products are mapped to the owner's real
// recipes — the plan deliberately does not invent recipes.
//
// THE HONEST LIMIT: trained on assumed history, the measured accuracy says
// how well the methods recover the ASSUMED patterns, not how well they
// predict Pecto's. Regression usually wins on it precisely because the
// generator was built from calendar effects. Switch a run to REAL and the
// system says, correctly, that there is not enough history yet.
// ============================================================================
// The live code is server/routes/forecasts.js and server/lib/forecasting.js,
// both commented in place. Not copied here, so there is one version to keep
// in step.
