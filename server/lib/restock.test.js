// Unit tests for the restock arithmetic — PHASE10 B1. Pure function, known
// inputs, known answers.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { recommendRestock } from './restock.js'

const day = (date, predicted, high = predicted) => ({ date, predicted, high })
const WEEK = [
  day('2026-09-26', 20, 24),
  day('2026-09-27', 30, 35),
  day('2026-09-28', 10),
  day('2026-09-29', 10),
  day('2026-09-30', 10),
  day('2026-10-01', 10),
  day('2026-10-02', 10),
]

describe('recommendRestock', () => {
  test('covers two days plus the margin, minus stock', () => {
    // 20 + 30 = 50 for two days, margin = 24 − 20 = 4, so 54 are needed.
    const result = recommendRestock({ days: WEEK, stock: 15 })
    assert.equal(result.recommended, 54 - 15)
    assert.equal(result.coverDemand, 50)
  })

  test('names the first day the running total passes the stock', () => {
    // Running totals: 20, 50, 60 … — 45 in stock runs out on the second day.
    assert.equal(recommendRestock({ days: WEEK, stock: 45 }).sellsOutOn, '2026-09-27')
    assert.equal(recommendRestock({ days: WEEK, stock: 0 }).sellsOutOn, '2026-09-26')
  })

  test('enough stock for the whole week is "covered" and recommends nothing', () => {
    const result = recommendRestock({ days: WEEK, stock: 500 })
    assert.equal(result.sellsOutOn, null)
    assert.equal(result.recommended, 0)
  })

  test('never recommends a negative amount', () => {
    assert.equal(recommendRestock({ days: WEEK, stock: 60 }).recommended, 0)
  })

  test('negative or missing stock is treated as none', () => {
    assert.equal(recommendRestock({ days: WEEK, stock: -5 }).recommended, 54)
    assert.equal(recommendRestock({ days: WEEK, stock: null }).recommended, 54)
  })
})
