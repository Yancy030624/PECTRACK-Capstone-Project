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
  seasonal_naive: 'The average of the last four of the same weekday. The baseline every other method has to beat.',
  holt_winters: 'Tracks a level, a trend and a weekly pattern, giving recent days more weight.',
  regression: 'Weighs day of week, paydays, holidays and a trend — each effect can be read as a number.',
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
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
const percent = (value) => (value == null ? '—' : `${Math.round(Number(value) * 100)}%`)
const quantity = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })

export function ForecastPanel({ user, active }) {
  const isAdmin = user.role === 'ADMIN'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [source, setSource] = useState('ASSUMED')
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
    const brand = cssVar('--color-brand-600')
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
          { label: 'Sold', data: gap(history.map((point) => point.units)), borderColor: brand, backgroundColor: brand, borderWidth: 2, pointRadius: 0, tension: 0.2 },
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
  const selected = products.find((product) => product.productId === selectedId)
  const isAssumed = data?.run?.source === 'ASSUMED'
  const days = data?.dates ?? []
  const beatBaseline = products.filter((product) => product.mae != null && product.baselineMae != null && product.mae < product.baselineMae).length
  const scored = products.filter((product) => product.mae != null).length
  const methodCounts = products.reduce((counts, product) => ({ ...counts, [product.method]: (counts[product.method] ?? 0) + 1 }), {})

  return (
    <div>
      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink-900">Demand forecast — next 7 days</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-500">How many of each product are likely to sell each day, to plan the bake. Each product is forecast by whichever of three methods predicted its own past most accurately.</p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-end gap-2 print:hidden">
              <Field label="Train on">
                <Select value={source} onChange={(event) => setSource(event.target.value)} className="w-auto">
                  <option value="ASSUMED">Assumed history</option>
                  <option value="REAL">Real sales</option>
                </Select>
              </Field>
              <Button type="button" size="sm" onClick={run} disabled={running}>{running ? 'Forecasting…' : 'Run forecast'}</Button>
            </div>
          )}
        </div>

        {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}

        {loading ? (
          <LoadingRows className="mt-5" />
        ) : !data?.run ? (
          <EmptyState title="No forecast yet" description={isAdmin ? 'Choose what to train on and press Run forecast.' : 'An admin has not run a forecast yet.'} />
        ) : (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${isAssumed ? 'bg-status-wait-bg text-status-wait-fg' : 'bg-status-done-bg text-status-done-fg'}`}>
                {isAssumed ? 'Trained on assumed history' : 'Trained on real sales'}
              </span>
              <span>
                Run #{data.run.id} · {formatDateTime(data.run.createdAt)}{data.run.runByName ? ` by ${data.run.runByName}` : ''}
                {data.run.historyFrom && <> · history {longDay(data.run.historyFrom)} – {longDay(data.run.historyTo)}</>}
                {' · '}{Object.entries(data.run.daysBySource ?? {}).map(([name, count]) => `${count} days ${name.toLowerCase()}`).join(', ') || 'no history'}
              </span>
              <a href="/api/forecasts/latest?format=csv" download className="ml-auto inline-flex h-8 items-center rounded-control border border-line-200 bg-surface px-3 text-xs font-medium text-ink-700 transition hover:bg-surface-sunk print:hidden">Export CSV</a>
            </div>
            {isAssumed && (
              <p className="rounded-control border border-status-wait-fg/20 bg-status-wait-bg/60 px-3 py-2 text-xs text-status-wait-fg">
                <span className="font-semibold">These numbers come from generated history, not the bakery's records.</span> The accuracy shown measures how well each method recovers the assumed patterns (weekends, paydays, holidays). It is not a measure of how well it predicts real sales. Switch to <span className="font-semibold">Real sales</span> once enough of the bakery's own history exists.
              </p>
            )}
          </div>
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
                <Card className="p-5"><p className="text-sm font-medium text-ink-500">Products forecast</p><p className="mt-2 text-3xl font-semibold text-ink-900 tabular-nums">{data.run.productsForecast}</p><p className="mt-1 text-xs text-ink-500">{data.run.productsSkipped} skipped</p></Card>
                <Card className="p-5"><p className="text-sm font-medium text-ink-500">Beat the baseline</p><p className="mt-2 text-3xl font-semibold text-ink-900 tabular-nums">{beatBaseline} / {scored}</p><p className="mt-1 text-xs text-ink-500">More accurate than the same-weekday average</p></Card>
                <Card className="p-5"><p className="text-sm font-medium text-ink-500">Method chosen</p><p className="mt-2 text-sm text-ink-700">{Object.entries(methodCounts).map(([method, count]) => <span key={method} className="block tabular-nums">{count} × {METHOD_LABELS[method] ?? method}</span>)}</p></Card>
              </div>

              <RestockCard restock={data.restock ?? []} dates={days} isAssumed={isAssumed} onSelect={setSelectedId} />

              <Card className="mt-6 break-inside-avoid p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-ink-900">{selected ? `${selected.name}${selected.variant ? ` (${selected.variant})` : ''}` : 'Product'}</h3>
                    {selected && (
                      <p className="mt-1 text-xs text-ink-500">
                        {METHOD_LABELS[selected.method]} — {METHOD_HELP[selected.method]}
                        {selected.mae != null && <> Off by about <span className="font-semibold text-ink-700">{quantity(selected.mae)}</span> a day in testing ({percent(selected.wape)} of sales){selected.baselineMae != null && <>, against {quantity(selected.baselineMae)} for the baseline</>}.</>}
                        {selected.note && <> {selected.note}</>}
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
                <p className="mt-2 text-xs text-ink-500">Shaded: the range about 80% of days fell inside when this method was tested on the past. Triangles: days the product sold out, left out of the forecast because they show the shelf running empty, not what people wanted.</p>
              </Card>

              <Card className="mt-6 p-6">
                <h3 className="text-base font-semibold text-ink-900">Forecast by product</h3>
                <p className="mt-1 text-xs text-ink-500">Items likely to sell each day, busiest first. Select a row to chart it.</p>
                <div className="mt-4">
                  <Table caption="Seven-day forecast by product">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Product</Th>
                        <Th align="right">7 days</Th>
                        {days.map((date, index) => <Th key={date} align="right" priority={index < 2 ? undefined : index < 4 ? 'md' : 'lg'}>{index === 0 ? 'Today' : dayLabel(date)}</Th>)}
                        <Th priority="xl">Method</Th>
                        <Th align="right" priority="xl">Test error</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {products.map((product) => (
                        <Tr key={product.productId} onClick={() => setSelectedId(product.productId)} className={`cursor-pointer ${product.productId === selectedId ? 'bg-brand-50' : ''}`}>
                          <Td className="font-semibold text-ink-900">
                            <button type="button" onClick={() => setSelectedId(product.productId)} className="text-left hover:underline">{product.name}</button>
                            {product.variant && <span className="block text-xs font-normal text-ink-500">{product.variant}</span>}
                          </Td>
                          <Td numeric className="font-semibold text-ink-900">{whole(product.total)}</Td>
                          {product.days.map((day, index) => (
                            <Td key={day.date} numeric priority={index < 2 ? undefined : index < 4 ? 'md' : 'lg'}>
                              {whole(day.predicted)}
                              <span className="block text-[10px] text-ink-500">{whole(day.low)}–{whole(day.high)}</span>
                            </Td>
                          ))}
                          <Td priority="xl">{METHOD_LABELS[product.method] ?? product.method}</Td>
                          <Td numeric priority="xl">{product.mae == null ? '—' : `±${quantity(product.mae)}`}<span className="block text-[10px] text-ink-500">{product.wape == null ? 'not scored' : `${percent(product.wape)} of sales`}</span></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              </Card>
            </>
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

          <Card className="mt-6 p-6">
            <h3 className="text-base font-semibold text-ink-900">Ingredients for the week</h3>
            {data.ingredients.mappedProducts === 0 ? (
              <EmptyState
                title="No product is linked to a recipe yet"
                description="Link each product to its recipe in Product Management (Edit → Recipe and base units per item). The forecast then becomes how much flour, sugar and everything else the next seven days need — from the bakery's real recipes, not assumed ones."
              />
            ) : data.ingredients.needs.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">The linked products have no forecast in this run.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-ink-500">From the {data.ingredients.mappedProducts} product{data.ingredients.mappedProducts === 1 ? '' : 's'} linked to a recipe. Products without a recipe are not counted.</p>
                <div className="mt-4">
                  <Table caption="Ingredients needed for the forecast week">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Ingredient</Th>
                        <Th align="right">Needed (7 days)</Th>
                        <Th align="right">On hand</Th>
                        <Th>Status</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {data.ingredients.needs.map((need) => (
                        <Tr key={need.ingredientId}>
                          <Td className="font-semibold text-ink-900">{need.name}</Td>
                          <Td numeric>{quantity(need.needed)} {need.unit}</Td>
                          <Td numeric>{quantity(need.onHand)} {need.unit}</Td>
                          <Td>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${need.short ? 'bg-status-fail-bg text-status-fail-fg' : 'bg-status-done-bg text-status-done-fg'}`}>
                              {need.short ? `Short ${quantity(Number(need.needed) - Number(need.onHand))} ${need.unit}` : 'Enough'}
                            </span>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// PHASE10 B1 — the paper's "Automated Inventory": which products will run
// out, and how many to bake. The forecast says how many will SELL; this
// sets that against what is on the shelf now. Only products that need
// baking are listed — the covered ones are counted in one line, so the
// list stays the size of tonight's job.
function RestockCard({ restock, dates, isAssumed, onSelect }) {
  // Only what needs baking now. A product that runs out on Thursday but is
  // covered for today and tomorrow is not a task yet — listing it as
  // "Bake 0" beside a sell-out date read as a contradiction.
  const needed = restock.filter((item) => item.recommended > 0)
  const later = restock.filter((item) => item.recommended === 0 && item.sellsOutOn)
  const covered = restock.length - needed.length - later.length
  const whenLabel = (date) => {
    if (!date) return 'Covered all week'
    if (date === dates[0]) return 'Today'
    if (date === dates[1]) return 'Tomorrow'
    return dayLabel(date)
  }
  return (
    <Card className="mt-6 p-6">
      <h3 className="text-base font-semibold text-ink-900">Restock recommendations</h3>
      <p className="mt-1 max-w-3xl text-xs text-ink-500">
        What to bake to cover today and tomorrow, with a safety margin, minus what is already on the shelf. Soonest to run out first.
        {isAssumed && <span className="font-semibold text-status-wait-fg"> Demand here comes from assumed history, set against the real stock on hand — it shows how the recommendation works, not what the bakery will actually sell.</span>}
      </p>
      {needed.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">Nothing needs baking to cover today and tomorrow.</p>
      ) : (
        <div className="mt-4">
          <Table caption="Restock recommendations">
            <Thead>
              <Tr className="hover:bg-transparent">
                <Th>Product</Th>
                <Th align="right">On hand</Th>
                <Th>Runs out</Th>
                <Th align="right">Bake</Th>
                <Th align="right" priority="md">Batches</Th>
              </Tr>
            </Thead>
            <Tbody>
              {needed.map((item) => {
                const urgent = item.sellsOutOn && (item.sellsOutOn === dates[0] || item.sellsOutOn === dates[1])
                return (
                  <Tr key={item.productId} onClick={() => onSelect(item.productId)} className="cursor-pointer">
                    <Td className="font-semibold text-ink-900">
                      {item.name}
                      {item.variant && <span className="block text-xs font-normal text-ink-500">{item.variant}</span>}
                    </Td>
                    <Td numeric>{whole(item.stock)}{item.stockExpired && <span className="block text-[10px] text-status-fail-fg">expired stock</span>}</Td>
                    <Td>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${urgent ? 'bg-status-fail-bg text-status-fail-fg' : item.sellsOutOn ? 'bg-status-wait-bg text-status-wait-fg' : 'bg-status-done-bg text-status-done-fg'}`}>
                        {whenLabel(item.sellsOutOn)}
                      </span>
                    </Td>
                    <Td numeric className="font-semibold text-ink-900">{whole(item.recommended)}</Td>
                    <Td numeric priority="md">{item.batches == null ? <span className="text-xs text-ink-500">no recipe</span> : `${quantity(item.batches)}`}</Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </div>
      )}
      {later.length > 0 && (
        <p className="mt-3 text-xs text-ink-500">
          {later.length} more run{later.length === 1 ? 's' : ''} out later this week but {later.length === 1 ? 'is' : 'are'} covered for today and tomorrow: {later.map((item) => `${item.name}${item.variant ? ` (${item.variant})` : ''} ${dayLabel(item.sellsOutOn)}`).join(', ')}.
        </p>
      )}
      {covered > 0 && <p className="mt-1 text-xs text-ink-500">{covered} other product{covered === 1 ? ' has' : 's have'} enough stock for the week.</p>}
    </Card>
  )
}
