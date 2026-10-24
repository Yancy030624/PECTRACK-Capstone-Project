// Demand forecasting — Phase 9B, RULES-PLANS/PHASE9B_PREDICTIVE_ANALYSIS_PLAN.md.
//
// Pure functions: no database, no clock, no randomness. Given one
// product's daily history, forecast the next few days. Keeping this free
// of I/O is what makes it testable against series with known answers, and
// what lets the route decide separately WHICH history to feed it.
//
// Three methods, each chosen because it is standard and explainable:
//
//   seasonal_naive  "next Tuesday = the average of the last four
//                   Tuesdays." The baseline. A method that cannot beat
//                   this one is not worth its complexity.
//   holt_winters    Triple exponential smoothing with a weekly season:
//                   a level, a trend, and a day-of-week pattern, each
//                   updated as new days arrive.
//   regression      Linear regression on calendar features — day of
//                   week, payday, holidays, trend. The one whose reasoning
//                   can be read off its coefficients.
//
// For each product the three are compared on a rolling backtest over the
// last four weeks, and the most accurate one is used. See forecastProduct.

export const DAY_MS = 24 * 60 * 60 * 1000
const SEASON = 7

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
// Dates are ISO strings ('2026-09-25') handled in UTC throughout, so a
// server in any timezone does the same arithmetic. Local-day meaning is
// decided before data reaches here (the analytics views are Manila days).
export const toDate = (iso) => new Date(`${iso}T00:00:00Z`)
export const toIso = (date) => date.toISOString().slice(0, 10)
export const addDays = (iso, days) => toIso(new Date(toDate(iso).getTime() + days * DAY_MS))
export const dayOfWeek = (iso) => toDate(iso).getUTCDay() // 0 = Sunday
export const daysBetween = (fromIso, toIso2) => Math.round((toDate(toIso2) - toDate(fromIso)) / DAY_MS)

const lastDayOfMonth = (iso) => {
  const date = toDate(iso)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
}

// Semi-monthly pay in the Philippines: the 15th and the last day of the
// month, plus the day after each, when the money is actually spent.
// Shared with the history generator on purpose — payday is a fact about
// the calendar, not an assumption about the bakery. What IS assumed is how
// much it moves sales, and that lives only in the generator.
export function isPayday(iso) {
  const day = toDate(iso).getUTCDate()
  if (day === 15 || day === 16) return true
  if (day === lastDayOfMonth(iso)) return true
  return day === 1 // the day after the last day of the previous month
}

// The two holiday stretches a Filipino bakery feels most. 'eve' is the
// day before (Noche Buena and Media Noche shopping); 'holiday' is the day
// itself.
export function holidayKind(iso) {
  const monthDay = iso.slice(5)
  if (monthDay === '12-24' || monthDay === '12-31') return 'eve'
  if (monthDay === '12-25' || monthDay === '01-01') return 'holiday'
  return null
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------
const mean = (values) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length)
const clampZero = (value) => (Number.isFinite(value) && value > 0 ? value : 0)

function quantile(sorted, q) {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

// ---------------------------------------------------------------------------
// Method 1 — seasonal naive
// ---------------------------------------------------------------------------
// A censored day (the product ran out) is skipped: its sales count
// measures the shelf, not the demand.
export function seasonalNaive(train) {
  const byWeekday = new Map()
  const recent = []
  for (let index = train.length - 1; index >= 0; index -= 1) {
    const point = train[index]
    if (point.censored) continue
    if (recent.length < 28) recent.push(point.units)
    const weekday = dayOfWeek(point.date)
    const values = byWeekday.get(weekday) ?? []
    if (values.length < 4) {
      values.push(point.units)
      byWeekday.set(weekday, values)
    }
  }
  const fallback = mean(recent)
  const lastDate = train.at(-1).date
  return {
    predict(horizon) {
      return Array.from({ length: horizon }, (_, step) => {
        const values = byWeekday.get(dayOfWeek(addDays(lastDate, step + 1)))
        return clampZero(values?.length ? mean(values) : fallback)
      })
    },
  }
}

// Holt-Winters needs an unbroken series, so a censored day is filled with
// that weekday's typical value rather than its (too low) observed count.
function imputeCensored(train) {
  const byWeekday = new Map()
  for (const point of train) {
    if (point.censored) continue
    const weekday = dayOfWeek(point.date)
    const values = byWeekday.get(weekday) ?? []
    values.push(point.units)
    byWeekday.set(weekday, values)
  }
  const overall = mean(train.filter((point) => !point.censored).map((point) => point.units))
  return train.map((point) => (point.censored ? (mean(byWeekday.get(dayOfWeek(point.date)) ?? []) || overall) : point.units))
}

// ---------------------------------------------------------------------------
// Method 2 — Holt-Winters (additive, weekly season)
// ---------------------------------------------------------------------------
// The three smoothing constants are chosen by a small grid search that
// minimises one-step-ahead error on the training data itself. A grid, not
// an optimiser: sixty-odd candidates is enough resolution for daily bakery
// counts, and it is deterministic and easy to explain.
const ALPHAS = [0.05, 0.1, 0.2, 0.3, 0.5]
const BETAS = [0, 0.01, 0.05]
const GAMMAS = [0.05, 0.1, 0.2, 0.3]

function runHoltWinters(values, alpha, beta, gamma) {
  const firstSeason = values.slice(0, SEASON)
  const secondSeason = values.slice(SEASON, 2 * SEASON)
  let level = mean(firstSeason)
  let trend = (mean(secondSeason) - mean(firstSeason)) / SEASON
  const seasonal = firstSeason.map((value) => value - level)
  let squaredError = 0

  for (let index = SEASON; index < values.length; index += 1) {
    const slot = index % SEASON
    const oneStep = level + trend + seasonal[slot]
    squaredError += (values[index] - oneStep) ** 2
    const nextLevel = alpha * (values[index] - seasonal[slot]) + (1 - alpha) * (level + trend)
    trend = beta * (nextLevel - level) + (1 - beta) * trend
    seasonal[slot] = gamma * (values[index] - nextLevel) + (1 - gamma) * seasonal[slot]
    level = nextLevel
  }
  return { level, trend, seasonal, squaredError }
}

export function holtWinters(train) {
  const values = imputeCensored(train)
  if (values.length < 2 * SEASON) return seasonalNaive(train)

  let best = null
  for (const alpha of ALPHAS) {
    for (const beta of BETAS) {
      for (const gamma of GAMMAS) {
        const state = runHoltWinters(values, alpha, beta, gamma)
        if (!best || state.squaredError < best.squaredError) best = { ...state, alpha, beta, gamma }
      }
    }
  }

  const count = values.length
  return {
    parameters: { alpha: best.alpha, beta: best.beta, gamma: best.gamma },
    predict(horizon) {
      return Array.from({ length: horizon }, (_, step) => {
        const ahead = step + 1
        return clampZero(best.level + ahead * best.trend + best.seasonal[(count - 1 + ahead) % SEASON])
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Method 3 — regression on calendar features
// ---------------------------------------------------------------------------
// Features: intercept, trend (in years), a flag for each weekday except
// Sunday (Sunday is the baseline the others are measured against), payday,
// holiday eve, holiday. Ten columns.
export const REGRESSION_FEATURES = ['intercept', 'trend', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'payday', 'holiday_eve', 'holiday', 'event']

// The bakery's events (migration 036, the client 2026-10-24): Holy Week,
// Pahiyas, Christmas, New Year, long weekends. Their days are one more
// calendar fact the regression learns a weight for — how much an event
// day sells over an ordinary one. Set by the caller before a run (the
// routes read the calendar); empty, the column is all zeros and the ridge
// term gives it no weight, which is also what the tests rely on.
let eventDays = new Set()
export function useEventCalendar(days) {
  eventDays = new Set(days)
}
export const isEventDay = (iso) => eventDays.has(iso)

function featureRow(iso, originIso) {
  const weekday = dayOfWeek(iso)
  const holiday = holidayKind(iso)
  return [
    1,
    daysBetween(originIso, iso) / 365,
    weekday === 1 ? 1 : 0,
    weekday === 2 ? 1 : 0,
    weekday === 3 ? 1 : 0,
    weekday === 4 ? 1 : 0,
    weekday === 5 ? 1 : 0,
    weekday === 6 ? 1 : 0,
    isPayday(iso) ? 1 : 0,
    holiday === 'eve' ? 1 : 0,
    holiday === 'holiday' ? 1 : 0,
    eventDays.has(iso) ? 1 : 0,
  ]
}

// Solves (XᵀX + λI)β = Xᵀy by Gaussian elimination with partial pivoting.
// The small ridge term λ matters: a year of history may contain no
// holiday at all, which leaves that column all zeros and the plain
// equations singular. Ridge sends an unseen feature's weight to zero
// instead of failing. The intercept is not penalised.
function solveRidge(rows, targets, lambda = 1e-3) {
  const width = rows[0].length
  const matrix = Array.from({ length: width }, () => new Array(width + 1).fill(0))
  rows.forEach((row, rowIndex) => {
    for (let i = 0; i < width; i += 1) {
      matrix[i][width] += row[i] * targets[rowIndex]
      for (let j = 0; j < width; j += 1) matrix[i][j] += row[i] * row[j]
    }
  })
  for (let i = 1; i < width; i += 1) matrix[i][i] += lambda

  for (let column = 0; column < width; column += 1) {
    let pivot = column
    for (let row = column + 1; row < width; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row
    }
    ;[matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]]
    const lead = matrix[column][column]
    if (Math.abs(lead) < 1e-12) continue
    for (let row = 0; row < width; row += 1) {
      if (row === column) continue
      const factor = matrix[row][column] / lead
      for (let k = column; k <= width; k += 1) matrix[row][k] -= factor * matrix[column][k]
    }
  }
  return matrix.map((row, index) => (Math.abs(row[index]) < 1e-12 ? 0 : row[width] / row[index]))
}

export function regression(train) {
  const usable = train.filter((point) => !point.censored)
  // Fewer rows than about twice the features and the fit memorises noise.
  if (usable.length < 21) return seasonalNaive(train)
  const origin = train[0].date
  const coefficients = solveRidge(usable.map((point) => featureRow(point.date, origin)), usable.map((point) => point.units))
  const lastDate = train.at(-1).date
  return {
    coefficients: Object.fromEntries(REGRESSION_FEATURES.map((name, index) => [name, coefficients[index]])),
    predict(horizon) {
      return Array.from({ length: horizon }, (_, step) => {
        const row = featureRow(addDays(lastDate, step + 1), origin)
        return clampZero(row.reduce((sum, value, index) => sum + value * coefficients[index], 0))
      })
    },
  }
}

export const METHODS = {
  seasonal_naive: seasonalNaive,
  regression,
  holt_winters: holtWinters,
}
// When two methods score the same, the simpler one wins.
const METHOD_ORDER = ['seasonal_naive', 'regression', 'holt_winters']

// ---------------------------------------------------------------------------
// Backtest
// ---------------------------------------------------------------------------
// Rolling origin: pretend it is four weeks ago, forecast the next seven
// days, compare with what happened; step a week forward and repeat four
// times. This asks exactly the question the bakery asks — "how good is
// next week's forecast?" — rather than scoring one long 28-day projection.
//
// Error measures:
//   MAE   average units off per day. The headline: "off by about 3 pandesal".
//   WAPE  total error over total sales. Scale-free, so products compare.
// Not MAPE, which divides by each day's actual sales and is undefined on
// any day that sold nothing.
export const BACKTEST_FOLDS = 4
export const MIN_TRAIN_DAYS = 28
export const MIN_BACKTEST_HISTORY = MIN_TRAIN_DAYS + BACKTEST_FOLDS * SEASON
export const MIN_HISTORY_DAYS = 2 * SEASON

export function backtest(series, methodName) {
  const build = METHODS[methodName]
  const errors = []
  for (let fold = 0; fold < BACKTEST_FOLDS; fold += 1) {
    const cut = series.length - (BACKTEST_FOLDS - fold) * SEASON
    if (cut < MIN_TRAIN_DAYS) return null
    const train = series.slice(0, cut)
    const test = series.slice(cut, cut + SEASON)
    const predictions = build(train).predict(test.length)
    test.forEach((point, index) => {
      // A censored day's actual is not demand, so it cannot score a forecast.
      if (!point.censored) errors.push({ actual: point.units, predicted: predictions[index] })
    })
  }
  if (errors.length === 0) return null
  const absolute = errors.reduce((sum, error) => sum + Math.abs(error.actual - error.predicted), 0)
  const actualTotal = errors.reduce((sum, error) => sum + error.actual, 0)
  return {
    method: methodName,
    mae: absolute / errors.length,
    wape: actualTotal > 0 ? absolute / actualTotal : null,
    // actual − predicted: positive means the forecast was too low.
    residuals: errors.map((error) => error.actual - error.predicted),
  }
}

// ---------------------------------------------------------------------------
// One product, end to end
// ---------------------------------------------------------------------------
// `series` is every day from the product's first to its last, in order,
// with zeros filled in: [{ date, units, censored }].
//
// Returns either { skipped: reason } or the chosen method, its backtest
// errors, every candidate's score, and `horizon` days of { date,
// predicted, low, high }.
export function forecastProduct(series, { horizon = 7 } = {}) {
  if (series.length < MIN_HISTORY_DAYS) return { skipped: `Only ${series.length} day(s) of history; at least ${MIN_HISTORY_DAYS} are needed.` }
  if (series.every((point) => point.units === 0)) return { skipped: 'No sales in the history, so there is nothing to forecast from.' }

  const lastDate = series.at(-1).date
  const dates = Array.from({ length: horizon }, (_, step) => addDays(lastDate, step + 1))

  // Too short to backtest: the baseline, with no accuracy claimed. Saying
  // "we could not measure this" beats a number computed from one week.
  if (series.length < MIN_BACKTEST_HISTORY) {
    const predictions = seasonalNaive(series).predict(horizon)
    return {
      method: 'seasonal_naive',
      mae: null,
      wape: null,
      baselineMae: null,
      candidates: [],
      historyDays: series.length,
      note: `Only ${series.length} days of history — too short to measure accuracy (${MIN_BACKTEST_HISTORY} needed), so the baseline is used unscored.`,
      forecast: dates.map((date, index) => ({ date, predicted: predictions[index], low: predictions[index], high: predictions[index] })),
    }
  }

  const candidates = METHOD_ORDER.map((name) => backtest(series, name)).filter(Boolean)
  // Lowest MAE wins; METHOD_ORDER already lists the simplest first, and the
  // strict < keeps the earlier one on a tie.
  let chosen = candidates[0]
  for (const candidate of candidates) if (candidate.mae < chosen.mae - 1e-9) chosen = candidate
  const baseline = candidates.find((candidate) => candidate.method === 'seasonal_naive')

  const predictions = METHODS[chosen.method](series).predict(horizon)
  // The range is built from the backtest's own misses: most days' errors
  // fell between the 10th and 90th percentile, so roughly 80% of future
  // days should land inside it too.
  const sorted = [...chosen.residuals].sort((a, b) => a - b)
  const lowOffset = quantile(sorted, 0.1)
  const highOffset = quantile(sorted, 0.9)

  return {
    method: chosen.method,
    mae: chosen.mae,
    wape: chosen.wape,
    baselineMae: baseline?.mae ?? null,
    candidates: candidates.map((candidate) => ({ method: candidate.method, mae: candidate.mae, wape: candidate.wape })),
    historyDays: series.length,
    note: null,
    forecast: dates.map((date, index) => {
      const predicted = predictions[index]
      const low = clampZero(predicted + lowOffset)
      return { date, predicted, low, high: Math.max(low, predicted + highOffset) }
    }),
  }
}
