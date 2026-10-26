import { useCallback, useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { apiGet, apiPost } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { formatDateTime } from '../../lib/format.js'
import { cssVar } from '../../lib/theme.js'

// Reporting & Analytics → Forecast. Phase 9B,
// RULES-PLANS/PHASE9B_PREDICTIVE_ANALYSIS_PLAN.md.
//
// The one rule this screen is built around: it must never let a forecast
// trained on ASSUMED history pass for one trained on the bakery's real
// sales. So the source is stated in three places — a badge, the run line,
// and a plain-language note that says what the accuracy figures do and do
// not mean — and a run on real sales that has too little history says so
// rather than showing nothing.

// Method names as a person would say them, not as the code does.
const METHOD_LABELS = {
  seasonal_naive: 'Same-weekday average',
  holt_winters: 'Holt-Winters',
  regression: 'Calendar regression',
}
const METHOD_HELP = {
  seasonal_naive: 'The average of the last four of the same weekday. The simple yardstick every other method has to beat.',
  holt_winters: 'Follows the recent level, trend and weekly pattern, giving the latest days more weight.',
  regression: 'Learns how much each weekday, payday, holiday, event (Pahiyas, Holy Week…) and the overall trend raises or lowers sales.',
}

const withAlpha = (hex, alpha) => {
  const value = hex.replace('#', '')
  const channels = value.length === 3 ? value.split('').map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16))
  return `rgba(${channels.join(', ')}, ${alpha})`
}
// Forecast dates are calendar days; read them in UTC so no timezone
// shifts "Friday the 25th" to Thursday.
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
// Axis ticks name the month: "Sep 25" stays unambiguous across a month
// boundary, where "25 Fri" beside "1 Mon" did not.
const axisDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const longDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const whole = (value) => Math.round(Number(value)).toLocaleString()

const tableRows = 10

export function ForecastPanel({ user, active }) {
  const isAdmin = user.role === 'ADMIN'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [source, setSource] = useState('ASSUMED')
  const [breadType, setBreadType] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [running, setRunning] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [chartData, setChartData] = useState(null)
  const canvasRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const latest = await apiGet('/api/forecasts/latest')
      setData(latest)
      // Default the chart to the busiest product: the one the morning bake
      // most depends on.
      if (latest.products?.length) {
        setSelectedId((current) => (latest.products.some((product) => product.productId === current) ? current : [...latest.products].sort((a, b) => b.total - a.total)[0].productId))
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Loaded the first time the tab is opened, not on page load: most visits
  // to Reporting are for the sales figures.
  const loadedOnce = useRef(false)
  useEffect(() => {
    if (!active || loadedOnce.current) return
    loadedOnce.current = true
    load()
  }, [active, load])

  useEffect(() => {
    if (!selectedId || !data?.run) return
    apiGet(`/api/forecasts/history/${selectedId}?days=56`).then(setChartData).catch((error) => setMessage(error.message))
  }, [selectedId, data?.run?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chartData || !canvasRef.current || !active) return
    // Sales in a dark neutral, the forecast in the accent colour: in the
    // bakery theme brand and accent are the same crust brown, so drawing
    // sales in brand made the two lines indistinguishable.
    const sold = cssVar('--color-ink-500')
    const accent = cssVar('--color-accent-600')
    const fail = cssVar('--color-status-fail-fg')
    const ink = cssVar('--color-ink-700')
    const grid = cssVar('--color-line-100')

    const history = chartData.history
    const forecast = chartData.forecast
    const labels = [...history.map((point) => point.date), ...forecast.map((point) => point.date)]
    const gap = (values) => [...values, ...forecast.map(() => null)]
    const ahead = (values) => [...history.map(() => null), ...values]
    // The forecast line starts from the last real point so the two read as
    // one continuous story rather than a jump.
    const forecastLine = ahead(forecast.map((point) => point.predicted))
    if (history.length) forecastLine[history.length - 1] = history.at(-1).units

    const chart = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Sold', data: gap(history.map((point) => point.units)), borderColor: sold, backgroundColor: sold, borderWidth: 2, pointRadius: 0, tension: 0.2 },
          { label: 'Sold out that day', data: gap(history.map((point) => (point.censored ? point.units : null))), borderColor: fail, backgroundColor: fail, showLine: false, pointRadius: 4, pointStyle: 'triangle' },
          { label: 'Likely low', data: ahead(forecast.map((point) => point.low)), borderColor: 'transparent', pointRadius: 0, fill: false },
          { label: 'Likely range', data: ahead(forecast.map((point) => point.high)), borderColor: 'transparent', backgroundColor: withAlpha(accent, 0.18), pointRadius: 0, fill: '-1' },
          { label: 'Forecast', data: forecastLine, borderColor: accent, backgroundColor: accent, borderWidth: 2, borderDash: [6, 4], pointRadius: 3, tension: 0.2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: ink,
              // Chart.js draws the legend swatch with the line's own dash,
              // which turned "Forecast" into a heavy dashed box. Solid
              // swatches read cleaner; the chart itself keeps the dash.
              generateLabels: (chartInstance) => Chart.defaults.plugins.legend.labels.generateLabels(chartInstance)
                .filter((item) => item.text !== 'Likely low')
                .map((item) => ({ ...item, lineDash: [], lineWidth: 0 })),
            },
          },
          tooltip: { filter: (item) => item.raw != null && item.dataset.label !== 'Likely low' },
        },
        scales: {
          // Never rotated: slanted dates were the hardest thing on the
          // phone view to read. Fewer, level ticks instead.
          x: { ticks: { color: ink, maxTicksLimit: 8, maxRotation: 0, autoSkip: true, callback: (_, index) => axisDay(labels[index]) }, grid: { color: grid } },
          y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: grid } },
        },
      },
    })
    return () => chart.destroy()
  }, [chartData, active])

  const run = async () => {
    setRunning(true)
    setMessage('')
    try {
      await apiPost('/api/forecasts/run', { source })
      await load()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setRunning(false)
    }
  }

  const products = data?.products ? [...data.products].sort((a, b) => b.total - a.total) : []
  // The day-by-day table (REPORTS_UI_PLAN.md U6): one bread type at a time
  // if asked, and the ten busiest until "Show all".
  const tableProducts = products.filter((product) => !breadType || product.stockType === breadType)
  const shownProducts = showAll ? tableProducts : tableProducts.slice(0, tableRows)
  const selected = products.find((product) => product.productId === selectedId)
  const isAssumed = data?.run?.source === 'ASSUMED'
  const days = data?.dates ?? []
  const beatBaseline = products.filter((product) => product.mae != null && product.baselineMae != null && product.mae < product.baselineMae).length
  const scored = products.filter((product) => product.mae != null).length
  const methodCounts = products.reduce((counts, product) => ({ ...counts, [product.method]: (counts[product.method] ?? 0) + 1 }), {})
  // The plain-language summary. Accuracy is 1 − WAPE over every scored
  // product: of all the items the methods had to predict in testing, how
  // much they got right. Shown as a percentage because "88% accurate"
  // means something to anyone; "WAPE 0.12" does not.
  const weekTotal = products.reduce((sum, product) => sum + Number(product.total), 0)
  const scoredProducts = products.filter((product) => product.wape != null)
  const weightedError = scoredProducts.reduce((sum, product) => sum + Number(product.wape) * Number(product.total), 0)
  const scoredTotal = scoredProducts.reduce((sum, product) => sum + Number(product.total), 0)
  const accuracy = scoredTotal > 0 ? Math.max(0, Math.round((1 - weightedError / scoredTotal) * 100)) : null
  // The day the forecast expects the most sales, across all products.
  const dayTotals = days.map((date) => ({ date, total: products.reduce((sum, product) => sum + Number(product.days?.find((day) => day.date === date)?.predicted ?? 0), 0) }))
  const busiestDay = dayTotals.reduce((best, day) => (!best || day.total > best.total ? day : best), null)
  const busiest = busiestDay && busiestDay.total > 0 ? { ...busiestDay, label: new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${busiestDay.date}T12:00:00+08:00`)) } : null

  return (
    <div>
      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink-900">Sales forecast — the next 7 days</h2>
            {/* The run's source and date sit under the title, beside the
                controls, rather than in a row of their own below them. */}
            {!loading && data?.run && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${isAssumed ? 'bg-status-wait-bg text-status-wait-fg' : 'bg-status-done-bg text-status-done-fg'}`}>
                  {isAssumed ? 'Practice data (assumed)' : 'Real sales'}
                </span>
                <span>
                  Updated {formatDateTime(data.run.createdAt)}{data.run.runByName ? ` by ${data.run.runByName}` : ' automatically (nightly run)'}
                  {data.run.historyFrom && <> · learned from {longDay(data.run.historyFrom)} – {longDay(data.run.historyTo)}</>}
                </span>
              </div>
            )}
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-end gap-2 print:hidden">
              <Field label="Train on">
                <Select value={source} onChange={(event) => setSource(event.target.value)} className="w-auto">
                  <option value="ASSUMED">Practice data (assumed)</option>
                  <option value="REAL">Real sales</option>
                </Select>
              </Field>
              <Button type="button" size="sm" onClick={run} disabled={running}>{running ? 'Forecasting…' : 'Run forecast'}</Button>
              <p className="basis-full text-xs text-ink-500">Runs automatically every night; use this to run one now.</p>
            </div>
          )}
        </div>

        {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}

        {loading ? (
          <LoadingRows className="mt-5" />
        ) : !data?.run && (
          <EmptyState title="No forecast yet" description={isAdmin ? 'Choose what to train on and press Run forecast.' : 'An admin has not run a forecast yet.'} />
        )}
      </Card>

      {data?.run && (
        <>
          {products.length === 0 ? (
            <Card className="mt-6 p-6">
              <EmptyState
                title="Not enough history to forecast yet"
                description={isAssumed ? 'The assumed history is empty — run scripts/generate-assumed-demand.mjs.' : `Every product was skipped: forecasting needs at least two weeks of daily sales per product, and a scored forecast about eight. The system keeps recording, so this fills in as the bakery uses it.`}
              />
            </Card>
          ) : (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <SummaryCard label="Expected to sell this week" value={`${whole(weekTotal)} items`} note={`Across ${products.length} products, next 7 days`} />
                <SummaryCard label="Busiest day ahead" value={busiest ? busiest.label : '—'} note={busiest ? `About ${whole(busiest.total)} items expected` : 'No forecast yet'} />
                {/* On practice data the backtest measures the method, not the
                    bakery (ANALYTICS_PLAN.md, the defense wording): it says so. */}
                <SummaryCard
                  label={isAssumed ? 'Method test (practice data)' : 'How accurate'}
                  value={accuracy == null ? 'Not tested yet' : `About ${accuracy}%`}
                  note={accuracy == null ? 'Needs about eight weeks of history' : isAssumed ? 'How well the method fits the sample pattern — not Pecto\'s real sales' : `Checked against past weeks it had not seen${scored ? ` · ${beatBaseline} of ${scored} products beat a simple average` : ''}`}
                />
              </div>

              {/* One bake list (RULES-PLANS/REPORTS_ALIGNMENT_ANALYSIS.md, D):
                  Inventory → Production, by the bakery's own rule — daily
                  standards, hard-bread levels, weekends and events. The
                  forecast informs those levels; it no longer has a second,
                  different "what to bake" of its own. */}

              <Card className="mt-6 break-inside-avoid p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-ink-900">{selected ? `${selected.name}${selected.variant ? ` (${selected.variant})` : ''}` : 'Product'}</h3>
                    {selected && (
                      <p className="mt-1 text-sm text-ink-500">
                        Expected to sell <span className="font-semibold text-ink-900">{whole(selected.total)}</span> this week
                        {selected.mae != null && <> — usually within <span className="font-semibold text-ink-900">±{whole(Math.max(1, selected.mae))}</span> a day</>}.
                      </p>
                    )}
                  </div>
                  <Field label="Show">
                    <Select value={selectedId ?? ''} onChange={(event) => setSelectedId(event.target.value)} className="w-auto max-w-64">
                      {products.map((product) => <option key={product.productId} value={product.productId}>{product.name}{product.variant ? ` (${product.variant})` : ''}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="relative mt-4 h-72">
                  <canvas ref={canvasRef} role="img" aria-label={selected ? `Last eight weeks of sales and the next seven days' forecast for ${selected.name}` : 'Sales and forecast chart'} />
                </div>
                <p className="mt-2 text-xs text-ink-500"><span className="font-semibold text-ink-700">Solid grey line</span>: what actually sold. <span className="font-semibold text-ink-700">Dashed line with dots</span>: what we expect to sell. <span className="font-semibold text-ink-700">Shaded band</span>: the likely range. <span className="font-semibold text-ink-700">Red triangles</span>: days it sold out — ignored when learning, because sales stopped only because the shelf was empty.</p>
              </Card>

              <Card className="mt-6 p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-ink-900">Expected sales, day by day</h3>
                    <p className="mt-1 text-xs text-ink-500">How many of each product we expect to sell, busiest first. Tap a product to see its chart above.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 print:hidden">
                    {[['', 'All'], ['SOFT', 'Soft'], ['HARD', 'Hard']].map(([value, label]) => (
                      <Button key={value || 'all'} type="button" size="sm" variant={breadType === value ? 'primary' : 'secondary'} onClick={() => setBreadType(value)}>{label}</Button>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <Table caption="Seven-day forecast by product">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Product</Th>
                        <Th align="right">This week</Th>
                        {days.map((date, index) => <Th key={date} align="right" priority={index < 2 ? undefined : index < 4 ? 'md' : 'lg'}>{index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : dayLabel(date)}</Th>)}
                      </Tr>
                    </Thead>
                    <Tbody>
                      {shownProducts.map((product) => (
                        <Tr key={product.productId} onClick={() => setSelectedId(product.productId)} className={`cursor-pointer ${product.productId === selectedId ? 'bg-brand-50' : ''}`}>
                          <Td className="font-semibold text-ink-900">
                            <button type="button" onClick={() => setSelectedId(product.productId)} className="text-left hover:underline">{product.name}</button>
                            {product.variant && <span className="block text-xs font-normal text-ink-500">{product.variant}</span>}
                          </Td>
                          <Td numeric className="font-semibold text-ink-900">{whole(product.total)}</Td>
                          {product.days.map((day, index) => (
                            <Td key={day.date} numeric priority={index < 2 ? undefined : index < 4 ? 'md' : 'lg'}>{whole(day.predicted)}</Td>
                          ))}
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
                {tableProducts.length > tableRows && (
                  <div className="mt-3 print:hidden">
                    <Button type="button" size="sm" variant="secondary" onClick={() => setShowAll(!showAll)}>{showAll ? `Show the top ${tableRows}` : `Show all ${tableProducts.length}`}</Button>
                  </div>
                )}
              </Card>
            </>
          )}

          {products.length > 0 && (
            <Card className="mt-6 p-6 print:hidden">
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-ink-900">How it was calculated</summary>
                <div className="mt-4 space-y-4 text-sm text-ink-700">
                  <p>For every product, PECTRACK tries three forecasting methods on that product&apos;s own sales history, tests each one on past weeks it was not allowed to see, and keeps whichever was closest:</p>
                  <ul className="space-y-2">
                    {Object.entries(METHOD_LABELS).map(([key, label]) => (
                      <li key={key}><span className="font-semibold text-ink-900">{label}</span> ({methodCounts[key] ?? 0} product{methodCounts[key] === 1 ? '' : 's'}) — {METHOD_HELP[key]}</li>
                    ))}
                  </ul>
                  <p>&ldquo;Usually within ±N a day&rdquo; is the average miss in that test (mean absolute error). &ldquo;How accurate&rdquo; is 100% minus the share of items missed overall (weighted absolute percentage error). Days a product sold out are left out of learning and testing, because they show the shelf running empty, not what people wanted.</p>
                  <a href="/api/forecasts/latest?format=csv" download className="inline-flex h-8 items-center rounded-control border border-line-200 bg-surface px-3 text-xs font-medium text-ink-700 transition hover:bg-surface-sunk">Download the full forecast (CSV)</a>
                </div>
              </details>
            </Card>
          )}

          {data.skipped.length > 0 && (
            <Card className="mt-6 p-6">
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-ink-900">{data.skipped.length} product{data.skipped.length === 1 ? '' : 's'} not forecast</summary>
                <ul className="mt-3 divide-y divide-line-100 text-sm">
                  {data.skipped.map((product) => (
                    <li key={product.productId} className="flex flex-wrap justify-between gap-2 py-2">
                      <span className="text-ink-900">{product.name}{product.variant ? ` (${product.variant})` : ''}</span>
                      <span className="text-xs text-ink-500">{product.note}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, note, tone }) {
  const dot = tone === 'attention' ? 'bg-red-500' : tone === 'good' ? 'bg-emerald-500' : null
  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-500">{dot && <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />}{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink-900 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{note}</p>
    </Card>
  )
}
