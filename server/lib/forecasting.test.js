// Unit tests for lib/forecasting.js — the methods against series whose
// right answer is known in advance. If a method cannot reproduce a flat
// line, a weekly pattern, or a straight trend, nothing it says about real
// bakery data can be trusted either.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  addDays, backtest, dayOfWeek, forecastProduct, holidayKind, holtWinters, isPayday,
  MIN_BACKTEST_HISTORY, MIN_HISTORY_DAYS, regression, seasonalNaive,
} from './forecasting.js'

// 2025-01-06 is a Monday.
const START = '2025-01-06'
const series = (length, unitsFor, censoredFor = () => false) =>
  Array.from({ length }, (_, index) => {
    const date = addDays(START, index)
    return { date, units: unitsFor(index, date), censored: censoredFor(index, date) }
  })
const WEEKLY = [5, 10, 10, 10, 10, 20, 30] // Sunday .. Saturday

describe('calendar', () => {
  test('payday is the 15th, the last day of the month, and the day after each', () => {
    for (const date of ['2026-09-15', '2026-09-16', '2026-09-30', '2026-10-01', '2026-02-28', '2026-03-01']) assert.equal(isPayday(date), true, date)
    for (const date of ['2026-09-14', '2026-09-17', '2026-09-29', '2026-10-02']) assert.equal(isPayday(date), false, date)
  })

  test('the two holiday stretches', () => {
    assert.equal(holidayKind('2026-12-24'), 'eve')
    assert.equal(holidayKind('2026-12-31'), 'eve')
    assert.equal(holidayKind('2026-12-25'), 'holiday')
    assert.equal(holidayKind('2027-01-01'), 'holiday')
    assert.equal(holidayKind('2026-12-26'), null)
  })

  test('date arithmetic is timezone-free', () => {
    assert.equal(addDays('2026-02-28', 1), '2026-03-01')
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    assert.equal(dayOfWeek('2025-01-06'), 1)
  })
})

describe('methods on series with known answers', () => {
  test('a flat series is forecast exactly by every method', () => {
    const flat = series(90, () => 12)
    for (const method of [seasonalNaive, holtWinters, regression]) {
      for (const value of method(flat).predict(7)) assert.ok(Math.abs(value - 12) < 0.01, `${method.name}: ${value}`)
    }
  })

  test('a pure weekly pattern is reproduced day by day', () => {
    const weekly = series(90, (_, date) => WEEKLY[dayOfWeek(date)])
    const lastDate = weekly.at(-1).date
    for (const method of [seasonalNaive, holtWinters, regression]) {
      method(weekly).predict(7).forEach((value, step) => {
        const expected = WEEKLY[dayOfWeek(addDays(lastDate, step + 1))]
        assert.ok(Math.abs(value - expected) < 0.5, `${method.name} step ${step + 1}: ${value} vs ${expected}`)
      })
    }
  })

  test('a straight upward trend is followed by the trend methods, and the baseline lags behind', () => {
    const trend = series(120, (index) => 10 + index * 0.5)
    const next = 10 + 120 * 0.5
    assert.ok(Math.abs(holtWinters(trend).predict(1)[0] - next) < 0.5)
    assert.ok(Math.abs(regression(trend).predict(1)[0] - next) < 0.5)
    // Averaging the last four same weekdays trails a rising line by weeks.
    assert.ok(seasonalNaive(trend).predict(1)[0] < next - 5)
  })

  test('regression recovers a payday effect as a readable coefficient', () => {
    const payday = series(200, (_, date) => (isPayday(date) ? 15 : 10))
    const model = regression(payday)
    assert.ok(Math.abs(model.coefficients.payday - 5) < 0.2, `payday coefficient ${model.coefficients.payday}`)
  })

  test('forecasts are never negative, even on a falling trend', () => {
    const falling = series(90, (index) => Math.max(0, 60 - index))
    for (const method of [seasonalNaive, holtWinters, regression]) {
      for (const value of method(falling).predict(7)) assert.ok(value >= 0, `${method.name}: ${value}`)
    }
  })
})

describe('censored (stock-out) days', () => {
  test('seasonal naive ignores a sold-out day instead of reading it as low demand', () => {
    // Every day sells 20, except one recent Saturday, which sold out at 3.
    // Counted as demand, it would drag Saturday's forecast to 15.75.
    const soldOutIndex = 82
    const data = series(90, (index) => (index === soldOutIndex ? 3 : 20), (index) => index === soldOutIndex)
    assert.equal(dayOfWeek(data[soldOutIndex].date), 6, 'the sold-out day must really be a Saturday for this test to mean anything')
    const lastDate = data.at(-1).date
    const predictions = seasonalNaive(data).predict(7)
    const saturdays = predictions.filter((_, step) => dayOfWeek(addDays(lastDate, step + 1)) === 6)
    assert.equal(saturdays.length, 1)
    assert.equal(saturdays[0], 20)
  })

  test('a censored day in the backtest window is not scored', () => {
    const clean = series(90, () => 20)
    const withStockout = series(90, (index) => (index === 85 ? 0 : 20), (index) => index === 85)
    // Scoring that 0 as a miss would make the method look 20 units worse on
    // that day; excluding it leaves the error at zero.
    assert.equal(backtest(clean, 'seasonal_naive').mae, 0)
    assert.equal(backtest(withStockout, 'seasonal_naive').mae, 0)
  })
})

describe('forecastProduct', () => {
  test('too little history is skipped, with the reason', () => {
    const result = forecastProduct(series(MIN_HISTORY_DAYS - 1, () => 5))
    assert.match(result.skipped, /at least 14/)
  })

  test('a product that never sold is skipped rather than forecast as zero with fake confidence', () => {
    assert.match(forecastProduct(series(90, () => 0)).skipped, /No sales/)
  })

  test('history too short to backtest uses the baseline and claims no accuracy', () => {
    const result = forecastProduct(series(MIN_BACKTEST_HISTORY - 1, (_, date) => WEEKLY[dayOfWeek(date)]))
    assert.equal(result.method, 'seasonal_naive')
    assert.equal(result.mae, null)
    assert.match(result.note, /too short to measure accuracy/)
  })

  test('with enough history, every method is scored and the most accurate one is chosen', () => {
    const trend = series(120, (index) => 10 + index * 0.5)
    const result = forecastProduct(trend)
    assert.equal(result.candidates.length, 3)
    const best = Math.min(...result.candidates.map((candidate) => candidate.mae))
    assert.equal(result.mae, best)
    assert.notEqual(result.method, 'seasonal_naive', 'a trend should not be won by the method that cannot follow one')
    assert.ok(result.mae < result.baselineMae)
  })

  test('on a tie the simpler method wins', () => {
    const flat = series(120, () => 8)
    assert.equal(forecastProduct(flat).method, 'seasonal_naive')
  })

  test('the forecast starts the day after the history and every range contains its prediction', () => {
    const data = series(120, (index, date) => WEEKLY[dayOfWeek(date)] + (index % 3))
    const result = forecastProduct(data, { horizon: 7 })
    assert.equal(result.forecast.length, 7)
    assert.equal(result.forecast[0].date, addDays(data.at(-1).date, 1))
    for (const day of result.forecast) {
      assert.ok(day.low >= 0)
      assert.ok(day.low <= day.predicted + 1e-9 && day.predicted <= day.high + 1e-9, JSON.stringify(day))
    }
  })
})
