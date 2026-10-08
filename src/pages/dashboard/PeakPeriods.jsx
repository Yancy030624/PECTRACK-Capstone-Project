import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { apiGet } from '../../api/client.js'
import { Card } from '../../components/ui/Card.jsx'
import { cssVar } from '../../lib/theme.js'

// Reporting → Sales → Peak ordering periods. PHASE10 B2, the paper's
// "peak ordering periods" (p.16).
//
// Two bar charts rather than a day-by-hour heat grid: they answer the same
// two questions — what time, what day — and stay readable on a phone,
// where a 7 × 24 grid does not. The busiest slot is also said in words,
// because a chart makes a person look for the answer and a sentence gives
// it.
//
// The demo orders are ASSUMED, and counted by default (Decision D2) since
// the bakery's own history is two days long. When any are in the chart it
// says so, the same way the forecast does.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const hourLabel = (hour) => {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${suffix}`
}

function BarChart({ labels, values, label, color, highlight }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const ink = cssVar('--color-ink-700')
    const grid = cssVar('--color-line-100')
    const muted = cssVar('--color-brand-100')
    const chart = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels,
        // The busiest bar in full colour, the rest muted, so the answer is
        // the first thing the eye lands on.
        datasets: [{ label, data: values, backgroundColor: values.map((_, index) => (index === highlight ? color : muted)), borderRadius: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: ink, maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: grid } },
        },
      },
    })
    return () => chart.destroy()
  }, [labels, values, label, color, highlight])
  return <canvas ref={ref} role="img" aria-label={label} />
}

export function PeakPeriods({ range }) {
  const [includeAssumed, setIncludeAssumed] = useState(true)
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!range) return
    const params = new URLSearchParams({ from: range.from, to: range.to, includeAssumed: String(includeAssumed) })
    apiGet(`/api/reports/peak?${params}`).then(setData).catch((error) => setMessage(error.message))
  }, [range, includeAssumed])

  if (!range) return null
  const brand = cssVar('--color-brand-600')

  // Only the bakery's opening hours are charted — midnight to 5 AM would be
  // a row of empty bars pushing the real ones off a phone screen. Hours
  // outside that window that DID have orders are still included.
  const hours = data ? data.byHour.filter((row) => (row.hour >= 5 && row.hour <= 21) || row.orders > 0) : []

  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink-900">Peak ordering periods</h2>
          <p className="mt-1 text-xs text-ink-500">When orders are placed, in Philippine time — for staffing the counter and timing the bake. Cancelled orders are left out.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-700 print:hidden">
          <input type="checkbox" checked={includeAssumed} onChange={(event) => setIncludeAssumed(event.target.checked)} className="h-4 w-4 accent-brand-600" />
          Include demo orders
        </label>
      </div>

      {message && <p className="mt-3 text-xs text-status-fail-fg">{message}</p>}

      {data && data.totalOrders === 0 ? (
        <p className="mt-4 text-sm text-ink-500">No orders in this range{includeAssumed ? '' : ' from real sales'} yet.</p>
      ) : data && (
        <>
          <p className="mt-4 text-sm text-ink-700">
            Busiest hour: <span className="font-semibold text-ink-900">{hourLabel(data.busiestHour)}–{hourLabel((data.busiestHour + 1) % 24)}</span>
            {' · '}Busiest day: <span className="font-semibold text-ink-900">{WEEKDAYS[data.busiestWeekday]}</span>
            {' · '}{data.totalOrders.toLocaleString()} orders
          </p>
          {data.assumedOrders > 0 && (
            <p className="mt-2 inline-block rounded-full bg-status-wait-bg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-status-wait-fg">
              Includes {data.assumedOrders.toLocaleString()} assumed demo order{data.assumedOrders === 1 ? '' : 's'}
            </p>
          )}
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="break-inside-avoid">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">By hour of day</p>
              <div className="relative mt-2 h-56">
                <BarChart labels={hours.map((row) => hourLabel(row.hour))} values={hours.map((row) => row.orders)} label="Orders by hour of day" color={brand} highlight={hours.findIndex((row) => row.hour === data.busiestHour)} />
              </div>
            </div>
            <div className="break-inside-avoid">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">By day of week</p>
              <div className="relative mt-2 h-56">
                <BarChart labels={WEEKDAYS.map((day) => day.slice(0, 3))} values={data.byWeekday.map((row) => row.orders)} label="Orders by day of week" color={brand} highlight={data.busiestWeekday} />
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
