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
import { PeakPeriods } from './PeakPeriods.jsx'
import { PrintButton, PrintHeader } from '../../components/PrintReport.jsx'
import { manilaDate, manilaDateFromToday } from '../../lib/dates.js'
import { exportLabels, logPrint } from '../../lib/exportLog.js'
import { cssVar } from '../../lib/theme.js'

const logsLimit = 20


// UI_AUDIT.md Stage 5.5's specific instruction for this screen: "Chart
// colours are currently hard-coded hex values; move them onto the token
// palette so charts match the rest of the app ... chart text takes its
// colour from the theme tokens." Chart.js needs real colour strings, not
// Tailwind class names, so this reads the @theme custom properties
// straight off :root at chart-build time instead of keeping a second,
// hand-picked hex palette in this file — the same values index.css
// defines are what the canvases use, so a Figma re-skin that changes the
// tokens re-skins the charts too, with nothing to update here.


// Phase 9B adds 'Forecast' for both roles: a cashier planning the morning
// bake needs it; only an admin can start a new run (ForecastPanel.jsx).
// No Transactions tab (DELIVERY_FEE_PLAN.md, D2): it listed the same
// payments as Payment & Billing's Payment log, which now exports the PDF.
// Report History is now the Export history (REPORTS_UI_PLAN.md U2): only
// reports that left the system, by admin or cashier.
const tabsFor = (role) => (role === 'ADMIN' ? ['Sales', 'Products', 'Inventory', 'Forecast', 'Export history'] : ['Sales', 'Products', 'Inventory', 'Forecast'])
// The PDF each tab's print is recorded as.
const printTypes = { Sales: 'SALES_PDF', Products: 'PRODUCTS_PDF', Inventory: 'INVENTORY_PDF', Forecast: 'FORECAST_PDF' }

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
// tabsFor(role): ADMIN gets 'Export history', CASHIER does
// not, matching reports.js restricting GET /api/reports/logs to ADMIN.
// generate and the logs effect build the exact same
// request params as before — this is presentation only.
export function ReportingAnalytics({ user }) {
  const tabs = tabsFor(user.role)
  const [activeTab, setActiveTab] = useState('Sales')

  const [fromInput, setFromInput] = useState(() => manilaDateFromToday(-29))
  const [toInput, setToInput] = useState(() => manilaDate())
  const [groupBy, setGroupBy] = useState('day')
  const [productLimit, setProductLimit] = useState('10')
  // Products tab (REPORTS_UI_PLAN.md U4): which bread type, and what ranks
  // the list — pieces sold by default, since the bakery plans in pieces.
  const [productType, setProductType] = useState('')
  const [productSort, setProductSort] = useState('quantity')

  const [sales, setSales] = useState(null)
  const [products, setProducts] = useState(null)
  const [inventory, setInventory] = useState(null)
  const [appliedRange, setAppliedRange] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  // The "Demo data" switch (the user, 2026-10-25): practice rows from
  // scripts/generate-demo-reports.mjs and the demo seed, shown only when
  // asked, and labelled. Real data only by default.
  const [includeDemo, setIncludeDemo] = useState(false)
  const demoParam = includeDemo ? { includeDemo: 'true' } : {}
  const productsQuery = (range) => new URLSearchParams({ ...range, limit: productLimit, sort: productSort, ...(productType && { type: productType }), ...demoParam })
  const generate = async (event) => {
    event?.preventDefault()
    setGenerating(true)
    setErrors({})
    setMessage('')
    try {
      const range = { from: fromInput, to: toInput }
      const [salesData, productsData, inventoryData] = await Promise.all([
        apiGet(`/api/reports/sales?${new URLSearchParams({ ...range, groupBy, ...demoParam })}`),
        apiGet(`/api/reports/products?${productsQuery(range)}`),
        apiGet(`/api/reports/inventory?${new URLSearchParams({ ...range, ...demoParam })}`),
      ])
      setSales(salesData)
      setProducts(productsData)
      setInventory(inventoryData)
      setAppliedRange({ from: fromInput, to: toInput, groupBy, includeDemo })
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
    // Opened, and again whenever the Demo data switch changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDemo])

  const salesCanvasRef = useRef(null)
  useEffect(() => {
    if (!sales || !salesCanvasRef.current) return
    const inkColor = cssVar('--color-ink-700')
    const gridColor = cssVar('--color-line-200')
    // Sales (money) as a line on the left axis, orders as bars on the
    // right (REPORTS_UI_PLAN.md U3) — two different things, in two clearly
    // different colours, never two near-identical lines on one scale.
    const salesColor = cssVar('--color-brand-600')
    const ordersColor = cssVar('--color-status-active-fg')
    const chart = new Chart(salesCanvasRef.current, {
      data: {
        labels: sales.buckets.map((bucket) => bucket.period),
        datasets: [
          { type: 'line', label: 'Sales (₱)', data: sales.buckets.map((bucket) => Number(bucket.sales)), borderColor: salesColor, backgroundColor: salesColor, borderWidth: 2, tension: 0, yAxisID: 'y', order: 1 },
          { type: 'bar', label: 'Orders', data: sales.buckets.map((bucket) => bucket.orders), backgroundColor: `${ordersColor}33`, borderColor: ordersColor, borderWidth: 1, yAxisID: 'orders', order: 2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: inkColor } } },
        scales: {
          x: { ticks: { color: inkColor, maxRotation: 0, autoSkip: true }, grid: { color: gridColor } },
          y: { beginAtZero: true, position: 'left', ticks: { color: inkColor }, grid: { color: gridColor }, title: { display: true, text: 'Sales (₱)', color: inkColor } },
          orders: { beginAtZero: true, position: 'right', ticks: { color: inkColor, precision: 0 }, grid: { display: false }, title: { display: true, text: 'Orders', color: inkColor } },
        },
      },
    })
    return () => chart.destroy()
  }, [sales])

  useEffect(() => {
    if (!appliedRange) return
    apiGet(`/api/reports/products?${productsQuery({ from: appliedRange.from, to: appliedRange.to })}`).then(setProducts).catch((error) => setMessage(error.message))
    // Only a change of type or ranking reloads here; the range reloads
    // through Generate report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType, productSort])

  const productsCanvasRef = useRef(null)
  useEffect(() => {
    if (!products || !productsCanvasRef.current) return
    const inkColor = cssVar('--color-ink-700')
    const gridColor = cssVar('--color-line-200')
    // Pieces sold, as horizontal bars so the product names stay readable on
    // a phone (REPORTS_UI_PLAN.md U4).
    const chart = new Chart(productsCanvasRef.current, {
      type: 'bar',
      data: {
        labels: products.products.map((product) => product.variant ? `${product.productName} (${product.variant})` : product.productName),
        datasets: [{ label: 'Pieces sold', data: products.products.map((product) => product.quantitySold), backgroundColor: cssVar('--color-brand-600') }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: inkColor, precision: 0 }, grid: { color: gridColor }, title: { display: true, text: 'Pieces sold', color: inkColor } },
          y: { ticks: { color: inkColor, autoSkip: false }, grid: { display: false } },
        },
      },
    })
    return () => chart.destroy()
  }, [products])
  const [logsOffset, setLogsOffset] = useState(0)
  const [logsResult, setLogsResult] = useState(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsMessage, setLogsMessage] = useState('')

  useEffect(() => {
    if (user.role !== 'ADMIN' || activeTab !== 'Export history') return
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

  const csvHref = appliedRange ? `/api/reports/sales?${new URLSearchParams({ from: appliedRange.from, to: appliedRange.to, groupBy: appliedRange.groupBy, ...(appliedRange.includeDemo && { includeDemo: 'true' }), format: 'csv' })}` : null
  // The analytics export (GET /api/reports/analytics) is no longer offered
  // here: it is a raw developer file (REPORTS_UI_PLAN.md U1).

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      {/* PHASE10 B3 — what the printed page opens with. The on-screen
          heading, tabs and range form are hidden when printing. */}
      <PrintHeader
        title={`${activeTab} report`}
        subtitle={appliedRange && activeTab !== 'Forecast' && activeTab !== 'Export history' ? `${formatDate(`${appliedRange.from}T00:00:00`)} – ${formatDate(`${appliedRange.to}T00:00:00`)}${appliedRange.includeDemo ? ' · includes demo data' : ''}` : activeTab === 'Forecast' ? 'Next seven days' : undefined}
        user={user}
      />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 print:hidden">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900 print:hidden">Reporting &amp; Analytics</h1>
      <p className="mt-2 text-sm text-ink-500 print:hidden">Pick a date range for the sales, product and inventory reports, or see the next 7 days' forecast. Payments are listed in Payment &amp; Billing.</p>

      <div className="mt-6 flex flex-wrap items-center gap-2 print:hidden">
        {tabs.map((tab) => (
          <Button type="button" key={tab} size="sm" variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
        {/* Prints whichever tab is open: the others are `hidden`, so the
            printout is exactly the report on screen. */}
        <span className="ml-auto"><PrintButton onPrint={() => printTypes[activeTab] && logPrint(printTypes[activeTab])} /></span>
      </div>
      {/* The date-range form drives the historical reports only; a forecast
          looks forward from today and has no range to pick. */}
      <div hidden={activeTab === 'Export history' || activeTab === 'Forecast'} className="print:hidden">
        <Card className="mt-6 p-6">
          <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
            <Field label="From" error={errors.from}>
              <Input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} className="w-auto" />
            </Field>
            <Field label="To" error={errors.to}>
              <Input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} className="w-auto" />
            </Field>
            {/* Each tab shows only the controls that change it
                (REPORTS_UI_PLAN.md U1). */}
            {activeTab === 'Sales' && (
              <Field label="Group by" error={errors.groupBy}>
                <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} className="w-auto">
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </Select>
              </Field>
            )}
            {activeTab === 'Products' && (
              <Field label="Top products" help={Number(productLimit) > 50 ? 'Capped at 50.' : undefined}>
                <Input value={productLimit} onChange={(event) => setProductLimit(event.target.value)} inputMode="numeric" className="w-20" />
              </Field>
            )}
            <Button type="submit" size="sm" disabled={generating}>{generating ? 'Generating…' : 'Generate report'}</Button>
            {csvHref && activeTab === 'Sales' && (
              // A download link, not an action — kept as a plain <a> on
              // Button's secondary styling rather than forcing the Button
              // primitive to render an anchor for one call site.
              <a href={csvHref} download className="inline-flex h-8 items-center rounded-control border border-line-200 bg-surface px-3 text-xs font-medium text-ink-700 transition hover:bg-surface-sunk">
                Export sales CSV
              </a>
            )}
          </form>
          <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
            <input type="checkbox" checked={includeDemo} onChange={(event) => setIncludeDemo(event.target.checked)} className="h-4 w-4 accent-brand-600" />
            Demo data
            <span className="text-xs font-normal text-ink-500">— add the practice orders, to show how the reports work</span>
          </label>
          {message && (
            <div className="mt-4">
              <Alert variant="error">{message}</Alert>
            </div>
          )}
        </Card>
        {appliedRange?.includeDemo && (
          <p role="status" className="mt-4 rounded-control border border-status-wait-fg/20 bg-status-wait-bg px-3 py-2 text-sm text-status-wait-fg">
            <span className="font-semibold">Includes demo data.</span> These figures add practice orders that never happened; turn Demo data off for the bakery&apos;s real figures.
          </p>
        )}
      </div>

      <div hidden={activeTab !== 'Sales'}>
        {sales ? (
          <>
            {/* The money the bakery received (REPORTS_UI_PLAN.md U3). */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Sales</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{formatPeso(sales.totals.sales)}</p><p className="mt-2 text-xs text-ink-500">Money received, delivery fees not included</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Orders</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{sales.totals.orders}</p><p className="mt-2 text-xs text-ink-500">Paid in this range</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Average order</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{formatPeso(sales.totals.averageOrder)}</p><p className="mt-2 text-xs text-ink-500">Sales ÷ orders</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Delivery fees</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{formatPeso(sales.totals.deliveryFees)}</p><p className="mt-2 text-xs text-ink-500">Received with delivery orders</p></Card>
            </div>
            <p className={`mt-3 text-xs ${sales.totals.unpaidCash.orders > 0 ? 'font-medium text-status-wait-fg' : 'text-ink-500'}`}>
              Cash orders not yet paid: {sales.totals.unpaidCash.orders > 0 ? <>{sales.totals.unpaidCash.orders} ({formatPeso(sales.totals.unpaidCash.amount)})</> : 'none'}
              <span className="font-normal text-ink-500"> — cash pickups placed in this range, paid when collected.</span>
            </p>

            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Sales over time</h2>
              {sales.buckets.length === 0 ? <p className="mt-4 text-sm text-ink-500">No sales in this range.</p> : <div className="relative mt-4 h-72"><canvas ref={salesCanvasRef} role="img" aria-label="Sales and orders over time" /></div>}
            </Card>

            <div className="mt-6">
              <Table caption="Sales over time">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Period</Th>
                    <Th align="right">Orders</Th>
                    <Th align="right">Sales</Th>
                    <Th align="right" priority="md">Delivery fees</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {sales.buckets.map((bucket) => (
                    <Tr key={bucket.period}>
                      <Td className="font-semibold text-ink-900">{bucket.period}</Td>
                      <Td numeric>{bucket.orders}</Td>
                      <Td numeric>{formatPeso(bucket.sales)}</Td>
                      <Td numeric priority="md">{formatPeso(bucket.deliveryFees)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>

            {/* What the cashier checks at closing, and how much of the
                business comes online (REPORTS_UI_PLAN.md U3). */}
            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Where the sales came from</h2>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <BreakdownTable caption="By payment method" rows={sales.byMethod} names={{ CASH: 'Cash', GCASH: 'GCash' }} total={sales.totals.sales} />
                <BreakdownTable caption="By order type" rows={sales.byType} names={{ WALK_IN: 'Walk-in / counter', PICKUP: 'Online pickup', DELIVERY: 'Delivery' }} total={sales.totals.sales} />
              </div>
            </Card>
          </>
        ) : <p className="mt-6 text-sm text-ink-500">Loading the sales report…</p>}
        {/* PHASE10 B2 — driven by the same applied date range. */}
        <PeakPeriods range={appliedRange} includeDemo={Boolean(appliedRange?.includeDemo)} />
      </div>

      <div hidden={activeTab !== 'Products'}>
        {/* Soft and hard breads are stocked differently (the client,
            2026-10-23), so the report can show one kind at a time. */}
        <div className="mt-6 flex flex-wrap items-center gap-2 print:hidden">
          {[['', 'All breads'], ['SOFT', 'Soft breads'], ['HARD', 'Hard breads']].map(([value, label]) => (
            <Button key={value || 'all'} type="button" size="sm" variant={productType === value ? 'primary' : 'secondary'} onClick={() => setProductType(value)}>{label}</Button>
          ))}
        </div>
        {products ? (
          <>
            <Card className="mt-4 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Best sellers by pieces</h2>
              {products.products.length === 0 ? <p className="mt-4 text-sm text-ink-500">No sales in this range.</p> : (
                <div className="relative mt-4" style={{ height: `${Math.max(240, products.products.length * 32)}px` }}><canvas ref={productsCanvasRef} role="img" aria-label="Pieces sold per product" /></div>
              )}
            </Card>
            <div className="mt-6">
              <Table caption="Product performance">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Product</Th>
                    <Th priority="md">Type</Th>
                    <Th align="right"><SortHeader label="Pieces" active={productSort === 'quantity'} onClick={() => setProductSort('quantity')} /></Th>
                    <Th align="right"><SortHeader label="Revenue" active={productSort === 'revenue'} onClick={() => setProductSort('revenue')} /></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {products.products.map((product) => (
                    <Tr key={product.productId}>
                      <Td className="font-semibold text-ink-900">{product.productName}{product.variant ? ` (${product.variant})` : ''}</Td>
                      <Td priority="md" className="text-ink-500">{product.stockType === 'HARD' ? 'Hard' : 'Soft'}</Td>
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
        {/* Baked, sold and lost in the range, real movements only (the user,
            2026-10-25): the one place that sets what went on the shelf
            against what sold. Ingredients have their own history on the
            Ingredients screen. */}
        {inventory ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Baked / added</p><p className="mt-3 text-4xl font-semibold text-ink-900 tabular-nums">{inventory.totals.added.toLocaleString()}</p><p className="mt-1 text-xs text-ink-500">Restocks and the 5:00 AM top-up</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Sold</p><p className="mt-3 text-4xl font-semibold text-ink-900 tabular-nums">{inventory.totals.sold.toLocaleString()}</p><p className="mt-1 text-xs text-ink-500">Pieces in orders, cancelled ones returned</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Lost</p><p className="mt-3 text-4xl font-semibold text-ink-900 tabular-nums">{inventory.totals.lost.toLocaleString()}</p><p className="mt-1 text-xs text-ink-500">Rejects and counts corrected down</p></Card>
            </div>

            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">By product</h2>
              {inventory.products.length === 0 ? <p className="mt-4 text-sm text-ink-500">No stock changes in this range.</p> : (
                <div className="mt-4">
                  <Table caption="Baked, sold and lost by product">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Product</Th>
                        <Th priority="md">Type</Th>
                        <Th align="right">Baked / added</Th>
                        <Th align="right">Sold</Th>
                        <Th align="right">Lost</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {inventory.products.map((row) => (
                        <Tr key={row.productId}>
                          <Td className="font-semibold text-ink-900">{row.productName}{row.variant ? ` (${row.variant})` : ''}</Td>
                          <Td priority="md" className="text-ink-500">{row.stockType === 'HARD' ? 'Hard' : 'Soft'}</Td>
                          <Td numeric>{row.added}</Td>
                          <Td numeric>{row.sold}</Td>
                          <Td numeric className={row.lost > 0 ? 'font-semibold text-status-fail-fg' : ''}>{row.lost}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </Card>
          </>
        ) : <p className="mt-6 text-sm text-ink-500">Loading inventory activity…</p>}
      </div>
      <div hidden={activeTab !== 'Forecast'}>
        <ForecastPanel user={user} active={activeTab === 'Forecast'} />
      </div>

      {user.role === 'ADMIN' && (
        <div hidden={activeTab !== 'Export history'}>
          <Card className="mt-6 p-6">
            <h2 className="text-lg font-semibold text-ink-900">Export history</h2>
            <p className="mt-1 text-xs text-ink-500">Every report that left the system — a CSV downloaded or a PDF printed — with who made it and when. Opening a report on screen is not recorded.</p>

            {logsMessage && (
              <div className="mt-4">
                <Alert variant="error">{logsMessage}</Alert>
              </div>
            )}

            {logsLoading ? (
              <LoadingRows className="mt-4" />
            ) : logsMessage ? null : !logsResult || logsResult.logs.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500">Nothing has been exported yet.</p>
            ) : (
              <>
                <div className="mt-4">
                  <Table caption="Export history">
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Export</Th>
                        <Th>By</Th>
                        <Th>When</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {logsResult.logs.map((log) => (
                        <Tr key={log.id}>
                          <Td className="font-semibold text-ink-900">{exportLabels[log.reportType] ?? log.reportType}</Td>
                          <Td>{log.generatedByName ?? '—'}{log.role && <span className="block text-xs text-ink-500">{log.role === 'ADMIN' ? 'Admin' : log.role === 'CASHIER' ? 'Cashier' : log.role}</span>}</Td>
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

// A small "where from" table: orders, sales and share of the total.
function BreakdownTable({ caption, rows, names, total }) {
  const totalNumber = Number(total)
  return (
    <Table caption={caption}>
      <Thead>
        <Tr className="hover:bg-transparent">
          <Th>{caption}</Th>
          <Th align="right">Orders</Th>
          <Th align="right">Sales</Th>
          <Th align="right">Share</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row) => (
          <Tr key={row.key}>
            <Td className="font-semibold text-ink-900">{names[row.key] ?? row.key}</Td>
            <Td numeric>{row.orders}</Td>
            <Td numeric>{formatPeso(row.sales)}</Td>
            <Td numeric className="text-ink-500">{totalNumber > 0 ? `${Math.round((Number(row.sales) / totalNumber) * 100)}%` : '—'}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

// A column header that ranks the table by that column, descending.
function SortHeader({ label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex items-center gap-1 uppercase ${active ? 'text-ink-900' : 'hover:text-ink-900'}`}>
      {label}
      <span aria-hidden="true">{active ? '▼' : '↕'}</span>
    </button>
  )
}
