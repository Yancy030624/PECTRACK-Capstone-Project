import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { apiGet } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDate, formatDateTime, formatPeso } from '../../lib/format.js'
import { ForecastPanel } from './ForecastPanel.jsx'

const paymentMethodOptions = ['CASH', 'GCASH']
const paymentStatusOptions = ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED']
const transactionsLimit = 50
const logsLimit = 20

const reportingTimeZone = 'Asia/Manila'

const manilaDateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: reportingTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function manilaDateIso(instant = new Date()) {
  const parts = manilaDateParts.formatToParts(instant)
  const part = (type) => parts.find((candidate) => candidate.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function manilaDateIsoDaysAgo(days) {
  return manilaDateIso(new Date(Date.now() - days * 86400000))
}

// UI_AUDIT.md Stage 5.5's specific instruction for this screen: "Chart
// colours are currently hard-coded hex values; move them onto the token
// palette so charts match the rest of the app ... chart text takes its
// colour from the theme tokens." Chart.js needs real colour strings, not
// Tailwind class names, so this reads the @theme custom properties
// straight off :root at chart-build time instead of keeping a second,
// hand-picked hex palette in this file — the same values index.css
// defines are what the canvases use, so a Figma re-skin that changes the
// tokens re-skins the charts too, with nothing to update here.
const formatQuantity = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

// Phase 9A adds 'Production' (yield and cost per recipe and product from
// approved batches, plus the analytics export) for both roles.
// Phase 9B adds 'Forecast' for both roles: a cashier planning the morning
// bake needs it; only an admin can start a new run (ForecastPanel.jsx).
const tabsFor = (role) => (role === 'ADMIN' ? ['Sales', 'Products', 'Inventory', 'Production', 'Forecast', 'Transactions', 'Report History'] : ['Sales', 'Products', 'Inventory', 'Production', 'Forecast', 'Transactions'])

// Stage 5.5 (RULES-PLANS/UI_AUDIT.md) — the largest dashboard screen and
// the only one with Chart.js canvases, done last per the stage's own
// ordering. Converted onto the same primitive kit as the rest of the
// stage: Field/Input/Select replace the hand-rolled filter inputs (H3),
// <Alert> replaces the 10px role="status" paragraphs (C3), the tab pills
// and pagination controls are <Button>, every table is <Table>/<Th>/<Td>
// with scope="col" headers, a caption, and right-aligned <Td numeric> peso
// columns (M6, the audit's tabular-nums complaint), and the page title
// drops to 24px/600 (H1/H2). The two gradient KPI tiles ("Orders placed",
// "Spoiled units") are now plain <Card> figures, matching the fix
// DashboardHome already applied for the same M1 finding — a bakery app
// with two different treatments for "the first metric tile" would have
// been worse than either extreme.
//
// tabsFor(role) is UNCHANGED: ADMIN gets 'Report History', CASHIER does
// not, matching reports.js restricting GET /api/reports/logs to ADMIN.
// generate/applyTxFilters/the logs effect all build the exact same
// request params as before — this is presentation only.
export function ReportingAnalytics({ user }) {
  const tabs = tabsFor(user.role)
  const [activeTab, setActiveTab] = useState('Sales')

  const [fromInput, setFromInput] = useState(manilaDateIsoDaysAgo(29))
  const [toInput, setToInput] = useState(manilaDateIso())
  const [groupBy, setGroupBy] = useState('day')
  const [productLimit, setProductLimit] = useState('10')

  const [sales, setSales] = useState(null)
  const [products, setProducts] = useState(null)
  const [inventory, setInventory] = useState(null)
  const [production, setProduction] = useState(null)
  const [costing, setCosting] = useState(null)
  const [appliedRange, setAppliedRange] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  const generate = async (event) => {
    event?.preventDefault()
    setGenerating(true)
    setErrors({})
    setMessage('')
    try {
      const range = { from: fromInput, to: toInput }
      const [salesData, productsData, inventoryData, productionData, costingData] = await Promise.all([
        apiGet(`/api/reports/sales?${new URLSearchParams({ ...range, groupBy })}`),
        apiGet(`/api/reports/products?${new URLSearchParams({ ...range, limit: productLimit })}`),
        apiGet(`/api/reports/inventory?${new URLSearchParams(range)}`),
        apiGet(`/api/reports/production?${new URLSearchParams(range)}`),
        apiGet('/api/reports/costing'),
      ])
      setSales(salesData)
      setProducts(productsData)
      setInventory(inventoryData)
      setProduction(productionData)
      setCosting(costingData)
      setAppliedRange({ from: fromInput, to: toInput, groupBy })
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setGenerating(false)
    }
  }
  // The default range is already filled in, so the screen no longer opens
  // blank waiting for a click nothing else on the page hints at. The
  // report_logs audit row is ADMIN-only on the server and records a call,
  // so an admin opening the tab logs one SALES generation — the same as
  // pressing the button they would otherwise press immediately.
  useEffect(() => {
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const salesCanvasRef = useRef(null)
  useEffect(() => {
    if (!sales || !salesCanvasRef.current) return
    const inkColor = cssVar('--color-ink-700')
    const gridColor = cssVar('--color-line-200')
    const chart = new Chart(salesCanvasRef.current, {
      type: sales.groupBy === 'day' ? 'line' : 'bar',
      data: {
        labels: sales.buckets.map((bucket) => bucket.period),
        datasets: [
          { label: 'Ordered', data: sales.buckets.map((bucket) => Number(bucket.ordered)), backgroundColor: cssVar('--color-brand-600'), borderColor: cssVar('--color-brand-600') },
          { label: 'Collected', data: sales.buckets.map((bucket) => Number(bucket.collected)), backgroundColor: cssVar('--color-accent-600'), borderColor: cssVar('--color-accent-600') },
          // 'Refunds issued', not 'Refunded' — the legend is read next to
          // the Collected series, and the same non-subtraction applies here
          // as on the cards below.
          { label: 'Refunds issued', data: sales.buckets.map((bucket) => Number(bucket.refunded)), backgroundColor: cssVar('--color-status-fail-fg'), borderColor: cssVar('--color-status-fail-fg') },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: inkColor } } },
        scales: {
          x: { ticks: { color: inkColor }, grid: { color: gridColor } },
          y: { beginAtZero: true, ticks: { color: inkColor }, grid: { color: gridColor } },
        },
      },
    })
    return () => chart.destroy()
  }, [sales])

  const productsCanvasRef = useRef(null)
  useEffect(() => {
    if (!products || !productsCanvasRef.current) return
    const inkColor = cssVar('--color-ink-700')
    const gridColor = cssVar('--color-line-200')
    const chart = new Chart(productsCanvasRef.current, {
      type: 'bar',
      data: {
        labels: products.products.map((product) => product.variant ? `${product.productName} (${product.variant})` : product.productName),
        datasets: [{ label: 'Revenue', data: products.products.map((product) => Number(product.revenue)), backgroundColor: cssVar('--color-brand-600') }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: inkColor }, grid: { color: gridColor } },
          y: { beginAtZero: true, ticks: { color: inkColor }, grid: { color: gridColor } },
        },
      },
    })
    return () => chart.destroy()
  }, [products])
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    apiGet('/api/reports/summary').then(setSummary).catch(() => setSummary(null))
  }, [])
  const [txFilters, setTxFilters] = useState({ from: '', to: '', method: '', status: '' })
  const [txOffset, setTxOffset] = useState(0)
  const [txResult, setTxResult] = useState(null)
  const [txLoading, setTxLoading] = useState(true)
  const [txMessage, setTxMessage] = useState('')

  useEffect(() => {
    const loadTransactions = async () => {
      setTxLoading(true)
      setTxMessage('')
      const params = new URLSearchParams({ limit: String(transactionsLimit), offset: String(txOffset) })
      if (txFilters.from) params.set('from', txFilters.from)
      if (txFilters.to) params.set('to', txFilters.to)
      if (txFilters.method) params.set('method', txFilters.method)
      if (txFilters.status) params.set('status', txFilters.status)
      try {
        const data = await apiGet(`/api/payments?${params.toString()}`)
        setTxResult(data)
      } catch (error) {
        const fieldError = error.errors ? Object.values(error.errors)[0] : null
        setTxMessage(fieldError ?? error.message)
        setTxResult(null)
      } finally {
        setTxLoading(false)
      }
    }
    loadTransactions()
  }, [txFilters, txOffset])

  const applyTxFilters = (event) => {
    event.preventDefault()
    setTxOffset(0)
    setTxFilters({
      from: event.target.txFrom.value,
      to: event.target.txTo.value,
      method: event.target.txMethod.value,
      status: event.target.txStatus.value,
    })
  }
  const [logsOffset, setLogsOffset] = useState(0)
  const [logsResult, setLogsResult] = useState(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsMessage, setLogsMessage] = useState('')

  useEffect(() => {
    if (user.role !== 'ADMIN' || activeTab !== 'Report History') return
    setLogsLoading(true)
    setLogsMessage('')
    apiGet(`/api/reports/logs?${new URLSearchParams({ limit: String(logsLimit), offset: String(logsOffset) })}`)
      .then(setLogsResult)
      .catch((error) => {
        setLogsMessage(error.message)
        setLogsResult(null)
      })
      .finally(() => setLogsLoading(false))
  }, [user.role, activeTab, logsOffset])

  const csvHref = appliedRange ? `/api/reports/sales?${new URLSearchParams({ ...appliedRange, format: 'csv' })}` : null
  // Phase 9A — the analytics-ready export (migration 014's views joined by
  // day and product, data_source carried through). What a notebook reads
  // when the predictive work starts; nothing here predicts anything.
  const analyticsCsvHref = appliedRange ? `/api/reports/analytics?${new URLSearchParams({ from: appliedRange.from, to: appliedRange.to, format: 'csv' })}` : null

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Reporting &amp; Analytics</h1>
      <p className="mt-2 text-sm text-ink-500">Pick a date range and generate sales, product, and inventory reports — or browse the transaction history below.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button type="button" key={tab} size="sm" variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>
      {/* The date-range form drives the historical reports only; a forecast
          looks forward from today and has no range to pick. */}
      <div hidden={activeTab === 'Transactions' || activeTab === 'Report History' || activeTab === 'Forecast'}>
        <Card className="mt-6 p-6">
          <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
            <Field label="From" error={errors.from}>
              <Input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} className="w-auto" />
            </Field>
            <Field label="To" error={errors.to}>
              <Input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} className="w-auto" />
            </Field>
            <Field label="Group by" error={errors.groupBy}>
              <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} className="w-auto">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </Select>
            </Field>
            <Field label="Top products" help={Number(productLimit) > 50 ? 'Capped at 50.' : undefined}>
              <Input value={productLimit} onChange={(event) => setProductLimit(event.target.value)} inputMode="numeric" className="w-20" />
            </Field>
            <Button type="submit" size="sm" disabled={generating}>{generating ? 'Generating…' : 'Generate report'}</Button>
            {csvHref && (
              // A download link, not an action — kept as a plain <a> on
              // Button's secondary styling rather than forcing the Button
              // primitive to render an anchor for one call site.
              <a href={csvHref} download className="inline-flex h-8 items-center rounded-control border border-line-200 bg-surface px-3 text-xs font-medium text-ink-700 transition hover:bg-surface-sunk">
                Export sales CSV
              </a>
            )}
            {analyticsCsvHref && (
              <a href={analyticsCsvHref} download className="inline-flex h-8 items-center rounded-control border border-line-200 bg-surface px-3 text-xs font-medium text-ink-700 transition hover:bg-surface-sunk">
                Export analytics CSV
              </a>
            )}
          </form>
          {message && (
            <div className="mt-4">
              <Alert variant="error">{message}</Alert>
            </div>
          )}
        </Card>
      </div>

      <div hidden={activeTab !== 'Sales'}>
        {sales ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Orders placed</p><p className="mt-3 text-4xl font-semibold text-ink-900">{sales.totals.ordersPlaced}</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Ordered</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{formatPeso(sales.totals.ordered)}</p><p className="mt-2 text-xs text-ink-500">Value of orders placed in this range</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Collected</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{formatPeso(sales.totals.collected)}</p><p className="mt-2 text-xs text-ink-500">Money received; refunds already taken out</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Refunds issued</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{formatPeso(sales.totals.refunded)}</p><p className="mt-2 text-xs text-ink-500">For information — not part of Collected</p></Card>
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Average payment: {formatPeso(sales.totals.averagePayment)}
              <span className="text-ink-500"> — per payment received, not per order.</span>
            </p>
            {summary && (
              <p className="mt-1 text-xs font-medium text-status-wait-fg">
                Still unpaid across all open orders today: {formatPeso(summary.outstanding)}
                <span className="font-normal text-ink-500"> — every unpaid balance on the books, regardless of the date range above.</span>
              </p>
            )}

            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Sales over time</h2>
              {sales.buckets.length === 0 ? <p className="mt-4 text-sm text-ink-500">No activity in this range.</p> : <div className="relative mt-4 h-72"><canvas ref={salesCanvasRef} /></div>}
            </Card>

            <div className="mt-6">
              <Table caption="Sales over time">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Period</Th>
                    <Th>Orders placed</Th>
                    <Th align="right">Ordered</Th>
                    <Th align="right">Collected</Th>
                    <Th align="right">Refunds issued</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {sales.buckets.map((bucket) => (
                    <Tr key={bucket.period}>
                      <Td className="font-semibold text-ink-900">{bucket.period}</Td>
                      <Td>{bucket.ordersPlaced}</Td>
                      <Td numeric>{formatPeso(bucket.ordered)}</Td>
                      <Td numeric>{formatPeso(bucket.collected)}</Td>
                      <Td numeric>{formatPeso(bucket.refunded)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </>
        ) : <p className="mt-6 text-sm text-ink-500">Loading the sales report…</p>}
      </div>

      <div hidden={activeTab !== 'Products'}>
        {products ? (
          <>
            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Product performance</h2>
              {products.products.length === 0 ? <p className="mt-4 text-sm text-ink-500">No sales in this range.</p> : <div className="relative mt-4 h-72"><canvas ref={productsCanvasRef} /></div>}
            </Card>
            <div className="mt-6">
              <Table caption="Product performance">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Product</Th>
                    <Th align="right">Quantity sold</Th>
                    <Th align="right">Revenue</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {products.products.map((product) => (
                    <Tr key={product.productId}>
                      <Td className="font-semibold text-ink-900">{product.productName}{product.variant ? ` (${product.variant})` : ''}</Td>
                      <Td numeric>{product.quantitySold}</Td>
                      <Td numeric>{formatPeso(product.revenue)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </>
        ) : <p className="mt-6 text-sm text-ink-500">Loading product performance…</p>}
      </div>

      <div hidden={activeTab !== 'Inventory'}>
        {inventory ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Units lost</p><p className="mt-3 text-4xl font-semibold text-ink-900">{inventory.lossUnits}</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Open low-stock alerts</p><p className="mt-3 text-4xl font-semibold text-ink-900">{inventory.lowStockAlertsTotal}</p></Card>
            </div>

            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Movement totals by reason</h2>
              <p className="mt-1 text-xs text-ink-500">Signed, exactly as recorded — negative is stock leaving, positive is stock arriving.</p>
              {inventory.movements.length === 0 ? <p className="mt-4 text-sm text-ink-500">No movements in this range.</p> : (
                <div className="mt-4">
                  <Table caption="Movement totals by reason">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Reason</Th>
                        <Th align="right">Net change</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {inventory.movements.map((movement) => (
                        <Tr key={movement.reason}>
                          <Td className="font-semibold text-ink-900">{movement.reason}</Td>
                          <Td numeric className={`font-semibold ${movement.netChange < 0 ? 'text-status-fail-fg' : 'text-status-done-fg'}`}>{movement.netChange > 0 ? '+' : ''}{movement.netChange}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </Card>

            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Needs attention</h2>
              {inventory.lowStockAlerts.length === 0 ? <p className="mt-4 text-sm text-ink-500">No open low-stock alerts.</p> : (
                <>
                  <div className="mt-4 divide-y divide-line-100">
                    {inventory.lowStockAlerts.map((alert) => (
                      <div key={alert.id} className="flex items-center justify-between gap-4 py-4 text-sm text-ink-700">
                        <span className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-status-wait-bg text-status-wait-fg">!</span>{alert.productName}{alert.variant ? ` (${alert.variant})` : ''} — {alert.alertMessage}</span>
                      </div>
                    ))}
                  </div>
                  {inventory.lowStockAlertsTotal > inventory.lowStockAlerts.length && (
                    <p className="mt-4 text-xs font-medium text-status-wait-fg">Showing the {inventory.lowStockAlerts.length} oldest of {inventory.lowStockAlertsTotal} open alerts — resolve some in Inventory Management to see the rest.</p>
                  )}
                </>
              )}
            </Card>
          </>
        ) : <p className="mt-6 text-sm text-ink-500">Loading inventory activity…</p>}
      </div>
      <div hidden={activeTab !== 'Production'}>
        {production && costing ? (
          <>
            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Yield and cost by recipe</h2>
              <p className="mt-1 text-xs text-ink-500">Approved batches baked in this range. Yield is good output over good plus lost; cost per base unit is the ingredient cost fixed at approval.</p>
              {production.recipes.length === 0 ? <p className="mt-4 text-sm text-ink-500">No approved batch in this range.</p> : (
                <div className="mt-4">
                  <Table caption="Yield and cost by recipe">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Recipe</Th>
                        <Th align="right">Batches</Th>
                        <Th align="right" priority="md">Planned</Th>
                        <Th align="right">Good</Th>
                        <Th align="right" priority="md">Lost</Th>
                        <Th align="right" priority="lg">Yield</Th>
                        <Th align="right">Total cost</Th>
                        <Th align="right" priority="lg">Cost / unit</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {production.recipes.map((row) => (
                        <Tr key={row.recipeId ?? row.recipeName}>
                          <Td className="font-semibold text-ink-900">{row.recipeName}<span className="block text-xs font-normal text-ink-500">per {row.baseUnit}</span></Td>
                          <Td numeric>{row.batches}</Td>
                          <Td numeric priority="md">{formatQuantity(row.planned)}</Td>
                          <Td numeric>{formatQuantity(row.produced)}</Td>
                          <Td numeric priority="md">{formatQuantity(row.loss)}</Td>
                          <Td numeric priority="lg">{row.yieldPercent == null ? '—' : `${Number(row.yieldPercent).toFixed(1)}%`}</Td>
                          <Td numeric>{formatPeso(row.totalCost)}</Td>
                          <Td numeric priority="lg">{row.costPerBaseUnit == null ? '—' : formatPeso(row.costPerBaseUnit)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </Card>

            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Items produced by product</h2>
              <p className="mt-1 text-xs text-ink-500">Each batch's cost is shared across what it was packed into, by base units.</p>
              {production.products.length === 0 ? <p className="mt-4 text-sm text-ink-500">Nothing packed in this range.</p> : (
                <div className="mt-4">
                  <Table caption="Items produced by product">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Product</Th>
                        <Th align="right" priority="md">Batches</Th>
                        <Th align="right">Items</Th>
                        <Th align="right">Cost</Th>
                        <Th align="right">Cost / item</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {production.products.map((row) => (
                        <Tr key={row.productId}>
                          <Td className="font-semibold text-ink-900">{row.productName}{row.variant ? <span className="block text-xs font-normal text-ink-500">{row.variant}</span> : null}</Td>
                          <Td numeric priority="md">{row.batches}</Td>
                          <Td numeric>{row.itemsProduced}</Td>
                          <Td numeric>{formatPeso(row.allocatedCost)}</Td>
                          <Td numeric>{row.costPerItem == null ? '—' : formatPeso(row.costPerItem)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </Card>

            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Current cost and margin</h2>
              <p className="mt-1 text-xs text-ink-500">Every product mapped to a recipe, costed from its most recent approved batch — not the date range above. A product with no approved batch yet shows no cost.</p>
              {costing.products.length === 0 ? <p className="mt-4 text-sm text-ink-500">No product is mapped to a recipe yet.</p> : (
                <div className="mt-4">
                  <Table caption="Current cost and margin by product">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Product</Th>
                        <Th priority="lg">Recipe</Th>
                        <Th align="right">Price</Th>
                        <Th align="right">Unit cost</Th>
                        <Th align="right" priority="md">Margin</Th>
                        <Th align="right" priority="lg">Margin %</Th>
                        <Th priority="xl">Costed from</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {costing.products.map((row) => (
                        <Tr key={row.productId}>
                          <Td className="font-semibold text-ink-900">{row.productName}{row.variant ? <span className="block text-xs font-normal text-ink-500">{row.variant}</span> : null}</Td>
                          <Td priority="lg">{row.recipeName ?? '—'}</Td>
                          <Td numeric>{formatPeso(row.price)}</Td>
                          <Td numeric>{row.unitCost == null ? '—' : formatPeso(row.unitCost)}</Td>
                          <Td numeric priority="md" className={row.margin != null && Number(row.margin) < 0 ? 'font-semibold text-status-fail-fg' : ''}>{row.margin == null ? '—' : formatPeso(row.margin)}</Td>
                          <Td numeric priority="lg">{row.marginPercent == null ? '—' : `${Number(row.marginPercent).toFixed(1)}%`}</Td>
                          <Td priority="xl">{row.costedFromBatchId == null ? 'No approved batch yet' : `Batch #${row.costedFromBatchId} · ${formatDate(row.costedAt)}`}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </Card>
          </>
        ) : <p className="mt-6 text-sm text-ink-500">Loading production activity…</p>}
      </div>

      <div hidden={activeTab !== 'Forecast'}>
        <ForecastPanel user={user} active={activeTab === 'Forecast'} />
      </div>

      <div hidden={activeTab !== 'Transactions'}>
        <Card className="mt-6 p-6">
          <form onSubmit={applyTxFilters} className="flex flex-wrap items-end gap-3">
            <Field label="From"><Input type="date" name="txFrom" defaultValue={txFilters.from} className="w-auto" /></Field>
            <Field label="To"><Input type="date" name="txTo" defaultValue={txFilters.to} className="w-auto" /></Field>
            <Field label="Method">
              <Select name="txMethod" defaultValue={txFilters.method} className="w-auto">
                <option value="">Any</option>
                {paymentMethodOptions.map((method) => <option key={method} value={method}>{method}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="txStatus" defaultValue={txFilters.status} className="w-auto">
                <option value="">Any</option>
                {paymentStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
            </Field>
            <Button type="submit" size="sm">Apply filters</Button>
          </form>

          {txMessage && (
            <div className="mt-4">
              <Alert variant="error">{txMessage}</Alert>
            </div>
          )}

          {txLoading ? (
            <LoadingRows className="mt-4" />
          ) : txMessage ? null : !txResult || txResult.payments.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No payments match these filters.</p>
          ) : (
            <>
              <div className="mt-4">
                <Table caption="Transactions">
                  <Thead>
                    <Tr className="hover:bg-transparent">
                      <Th>Order</Th>
                      <Th priority="md">Customer</Th>
                      <Th>Method</Th>
                      <Th align="right">Amount</Th>
                      <Th>Status</Th>
                      <Th priority="lg">When</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {txResult.payments.map((payment) => (
                      <Tr key={payment.id}>
                        <Td className="font-semibold text-ink-900">#{payment.orderId}</Td>
                        <Td priority="md">{payment.customerName ?? 'Walk-in'}</Td>
                        <Td>{payment.method}</Td>
                        <Td numeric>{formatPeso(payment.amount)}</Td>
                        <Td>{payment.status}</Td>
                        <Td priority="lg" className="whitespace-nowrap text-ink-500">{formatDateTime(payment.status === 'REFUNDED' ? payment.refundedAt : (payment.paymentDate ?? payment.createdAt))}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-ink-500">
                <span>{txResult.total} total</span>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" disabled={txOffset === 0} onClick={() => setTxOffset(Math.max(0, txOffset - transactionsLimit))}>Previous</Button>
                  <Button type="button" size="sm" variant="secondary" disabled={!txResult.hasMore} onClick={() => setTxOffset(txOffset + transactionsLimit)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
      {user.role === 'ADMIN' && (
        <div hidden={activeTab !== 'Report History'}>
          <Card className="mt-6 p-6">
            <h2 className="text-lg font-semibold text-ink-900">Report generation history</h2>
            <p className="mt-1 text-xs text-ink-500">Every deliberate report generation — the Sales tab's own "Generate report" and CSV export — with who ran it and when. The ambient views (this screen's own live figures, the dashboard summary) are not reports and never appear here.</p>

            {logsMessage && (
              <div className="mt-4">
                <Alert variant="error">{logsMessage}</Alert>
              </div>
            )}

            {logsLoading ? (
              <LoadingRows className="mt-4" />
            ) : logsMessage ? null : !logsResult || logsResult.logs.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500">No reports have been generated yet.</p>
            ) : (
              <>
                <div className="mt-4">
                  <Table caption="Report generation history">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Report</Th>
                        <Th>Generated by</Th>
                        <Th>When</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {logsResult.logs.map((log) => (
                        <Tr key={log.id}>
                          <Td className="font-semibold text-ink-900">{log.reportType}</Td>
                          <Td>{log.generatedByName}</Td>
                          <Td className="text-ink-500">{formatDateTime(log.generatedAt)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-ink-500">
                  <span>{logsResult.total} total</span>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="secondary" disabled={logsOffset === 0} onClick={() => setLogsOffset(Math.max(0, logsOffset - logsLimit))}>Previous</Button>
                    <Button type="button" size="sm" variant="secondary" disabled={!logsResult.hasMore} onClick={() => setLogsOffset(logsOffset + logsLimit)}>Next</Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </section>
  )
}
