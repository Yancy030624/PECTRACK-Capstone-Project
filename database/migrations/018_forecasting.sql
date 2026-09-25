-- Migration 018 — demand forecasting (Phase 9B)
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/018_forecasting.sql
--
-- See RULES-PLANS/PHASE9B_PREDICTIVE_ANALYSIS_PLAN.md. Four objects:
--
--   assumed_daily_demand      generated history, and ONLY that
--   forecast_training_data    the forecaster's single input
--   forecast_runs             one row per deliberate forecast run
--   forecast_models           per product per run: method chosen, backtest error
--   forecasts                 per product per day: the prediction and its range

BEGIN;

-- ---------------------------------------------------------------------------
-- Generated history lives HERE, never as orders. A generated year of fake
-- orders would show as revenue in the Sales report, and break the payment
-- and inventory ledgers — exactly the mixing of assumed and real data the
-- thesis and the adviser both rule out. Nothing but the forecaster reads
-- this table.
--
-- One row for EVERY product-day, zeros included: a day that sold nothing is
-- data, and a forecaster cannot tell a missing row from a quiet day.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assumed_daily_demand (
  local_date DATE NOT NULL,
  product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  units INTEGER NOT NULL CHECK (units >= 0),
  -- The generator simulates occasional stock-outs, flagged the same way
  -- analytics_daily_sales flags real ones, so the forecaster's handling of
  -- censored days is exercised too.
  stocked_out BOOLEAN NOT NULL DEFAULT FALSE,
  -- Which generator produced the row, so a change to the assumptions can
  -- be traced to the history it made.
  generator_version VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (local_date, product_id)
);

-- ---------------------------------------------------------------------------
-- The forecaster's only input: real history and generated history, each
-- labelled with where it came from.
--
-- From analytics_daily_sales only RECORDED and IMPORTED rows are taken.
-- The ASSUMED rows there are the demo SEED's orders — placed so the
-- dashboards have something to show — and they overlap the generated
-- year's last three months. Counting both would double those days. The
-- seed's orders still inform the generator (they set each product's
-- relative popularity); they are not training data themselves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW forecast_training_data AS
SELECT s.local_date, s.product_id, s.units_sold AS units, s.stocked_out, s.data_source
  FROM analytics_daily_sales s
 WHERE s.data_source IN ('RECORDED', 'IMPORTED')
UNION ALL
SELECT a.local_date, a.product_id, a.units, a.stocked_out, 'ASSUMED'::data_source
  FROM assumed_daily_demand a;

-- ---------------------------------------------------------------------------
-- A forecast is a deliberate run, stored like a report — not recomputed on
-- every page view. Each run records what it was made from, so a forecast
-- on screen can always answer "what was this trained on?"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forecast_runs (
  run_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days BETWEEN 1 AND 28),
  sources data_source[] NOT NULL,
  history_from DATE,
  history_to DATE,
  -- e.g. {"RECORDED": 2, "ASSUMED": 365}: distinct days of each source used.
  days_by_source JSONB NOT NULL DEFAULT '{}'::jsonb,
  products_forecast INTEGER NOT NULL DEFAULT 0,
  products_skipped INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS forecast_runs_created_at_idx ON forecast_runs (created_at DESC);

-- Per product per run: which method won the backtest and how accurate it
-- was. Kept apart from the daily rows so it is not repeated seven times.
CREATE TABLE IF NOT EXISTS forecast_models (
  run_id BIGINT NOT NULL REFERENCES forecast_runs(run_id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  method VARCHAR(30) NOT NULL,
  -- Average units off per day in the backtest, and total error over total
  -- sales. NULL when the history was too short to backtest.
  mae NUMERIC(10, 3),
  wape NUMERIC(8, 4),
  -- The baseline's error on the same backtest, so the screen can say
  -- whether the chosen method actually beat "same weekday last month".
  baseline_mae NUMERIC(10, 3),
  history_days INTEGER NOT NULL,
  -- Every candidate's error, for the paper's comparison table.
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  note VARCHAR(255),
  PRIMARY KEY (run_id, product_id)
);

CREATE TABLE IF NOT EXISTS forecasts (
  run_id BIGINT NOT NULL REFERENCES forecast_runs(run_id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  predicted NUMERIC(10, 2) NOT NULL CHECK (predicted >= 0),
  -- An ~80% range from the backtest's own errors: most days should land
  -- inside it. Not a guarantee, and labelled as a range, not a promise.
  low NUMERIC(10, 2) NOT NULL CHECK (low >= 0),
  high NUMERIC(10, 2) NOT NULL,
  PRIMARY KEY (run_id, product_id, forecast_date)
);

COMMIT;
