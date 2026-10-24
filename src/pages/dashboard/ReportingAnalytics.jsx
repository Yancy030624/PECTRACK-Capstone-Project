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
import { formatDate, formatDateTime, formatPeso, formatQuantity } from '../../lib/format.js'
import { ForecastPanel } from './ForecastPanel.jsx'
import { StockStatusPill } from '../../components/ui/StockStatusPill.jsx'
import { PeakPeriods } from './PeakPeriods.jsx'
import { PrintButton, PrintHeader } from '../../components/PrintReport.jsx'
import { manilaDate, manilaDateFromToday } from '../../lib/dates.js'
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
const tabsFor = (role) => (role === 'ADMIN' ? ['Sales', 'Products', 'Inventory', 'Forecast', 'Report History'] : ['Sales', 'Products', 'Inventory', 'Forecast'])

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
// generate and the logs effect build the exact same
// request params as before — this is presentation only.
// Readable names for the ledger's reasons. REJECT is the one loss the
// bakery records now (CLIENT_REVISIONS_PLAN.md, R3); the older loss reasons
// only appear on movements recorded before that change.
const movementReasonLabels = {
  ORDER_PLACED: 'Sold (order placed)',
  ORDER_CANCELLED: 'Returned (order cancelled)',
  RESTOCK: 'Restock',
  DAILY_STOCK: '5:00 AM top-up (soft breads)',
  REJECT: 'Reject',
  CORRECTION: 'Count corrected',
  PRODUCTION: 'Production',
  SPOILAGE: 'Spoilage (before rejects)',
  PRODUCTION_LOSS: 'Production loss (before rejects)',
  EXPIRED: 'Expired (before rejects)',
  DAMAGED: 'Damaged (before rejects)',
}

export function ReportingAnalytics({ user }) {
  const tabs = tabsFor(user.role)
  const [activeTab, setActiveTab] = useState('Sales')

  const [fromInput, setFromInput] = useState(() => manilaDateFromToday(-29))
  const [toInput, setToInput] = useState(() => manilaDate())
  const [groupBy, setGroupBy] = useState('day')
  const [productLimit, setProductLimit] = useState('10')

  const [sales, setSales] = useState(null)
  const [products, setProducts] = useState(null)
  const [inventory, setInventory] = useState(null)
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
      const [salesData, productsData, inventoryData] = await Promise.all([
        apiGet(`/api/reports/sales?${new URLSearchParams({ ...range, groupBy })}`),
        apiGet(`/api/reports/products?${new URLSearchParams({ ...range, limit: productLimit })}`),
        apiGet(`/api/reports/inventory?${new URLSearchParams(range)}`),
      ])
      setSales(salesData)
      setProducts(productsData)
      setInventory(inventoryData)
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
  // The analytics export (GET /api/reports/analytics) is no longer offered
  // here: it is a raw developer file (REPORTS_UI_PLAN.md U1).

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      {/* PHASE10 B3 — what the printed page opens with. The on-screen
          heading, tabs and range form are hidden when printing. */}
      <PrintHeader
        title={`${activeTab} report`}
        subtitle={appliedRange && activeTab !== 'Forecast' && activeTab !== 'Report History' ? `${formatDate(`${appliedRange.from}T00:00:00`)} – ${formatDate(`${appliedRange.to}T00:00:00`)}` : activeTab === 'Forecast' ? 'Next seven days' : undefined}
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
        <span className="ml-auto"><PrintButton /></span>
      </div>
      {/* The date-range form drives the historical reports only; a forecast
          looks forward from today and has no range to pick. */}
      <div hidden={activeTab === 'Report History' || activeTab === 'Forecast'} className="print:hidden">
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
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Ordered</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{formatPeso(sales.totals.ordered)}</p><p className="mt-2 text-xs text-ink-500">Value of the goods ordered in this range</p></Card>
              {/* Kept apart from bread sales (DELIVERY_FEE_PLAN.md, D1). */}
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Delivery fees</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{formatPeso(sales.totals.deliveryFees)}</p><p className="mt-2 text-xs text-ink-500">On delivery orders placed in this range</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Collected</p><p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{formatPeso(sales.totals.collected)}</p><p className="mt-2 text-xs text-ink-500">Money received in this range, delivery fees included</p></Card>
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
                    <Th align="right">Delivery fees</Th>
                    <Th align="right">Collected</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {sales.buckets.map((bucket) => (
                    <Tr key={bucket.period}>
                      <Td className="font-semibold text-ink-900">{bucket.period}</Td>
                      <Td>{bucket.ordersPlaced}</Td>
                      <Td numeric>{formatPeso(bucket.ordered)}</Td>
                      <Td numeric>{formatPeso(bucket.deliveryFees)}</Td>
                      <Td numeric>{formatPeso(bucket.collected)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </>
        ) : <p className="mt-6 text-sm text-ink-500">Loading the sales report…</p>}
        {/* PHASE10 B2 — driven by the same applied date range. */}
        <PeakPeriods range={appliedRange} />
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
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Units lost</p><p className="mt-3 text-4xl font-semibold text-ink-900">{inventory.lossUnits}</p><p className="mt-1 text-xs text-ink-500">Counts corrected down, in this range</p></Card>
              <Card className="p-6"><p className="text-sm font-medium text-ink-500">Needs attention now</p><p className="mt-3 text-4xl font-semibold text-ink-900">{inventory.attention.length}</p></Card>
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
                          <Td className="font-semibold text-ink-900">{movementReasonLabels[movement.reason] ?? movement.reason}</Td>
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
              {/* Same statuses as Inventory and the Dashboard (stockHealth.js). */}
              {inventory.attention.length === 0 ? <p className="mt-4 text-sm text-ink-500">Nothing is low, selling out, or sold out.</p> : (
                <div className="mt-4 divide-y divide-line-100">
                  {inventory.attention.map((item) => (
                    <div key={item.productId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm text-ink-700">
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-ink-900">{item.productName}</span>{item.variant ? ` (${item.variant})` : ''}
                        <span className="block text-xs text-ink-500">{item.stockType === 'HARD' ? `Hard bread · ${item.stockQuantity} left · produce at ${item.minStockLevel}` : `Soft bread · ${item.stockQuantity} left${item.standardStock ? ` of ${item.standardStock} today` : ''}`}</span>
                      </span>
                      <StockStatusPill status={item.status} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Ingredients (CLIENT_REVISIONS_PLAN.md, R5): what came in,
                was used, and was thrown out in the range, and what is low
                now. */}
            {inventory.ingredients && (
              <Card className="mt-6 p-6">
                <h2 className="text-lg font-semibold text-ink-900">Ingredients</h2>
                {inventory.ingredients.movements.length === 0 ? <p className="mt-4 text-sm text-ink-500">No ingredient changes in this range.</p> : (
                  <div className="mt-4">
                    <Table caption="Ingredient movements in the range">
                      <Thead>
                        <Tr className="hover:bg-transparent">
                          <Th>Ingredient</Th>
                          <Th align="right">Restocked</Th>
                          <Th align="right">Used</Th>
                          <Th align="right">Rejected</Th>
                          <Th align="right" priority="md">Recount</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {inventory.ingredients.movements.map((row) => (
                          <Tr key={row.ingredientId}>
                            <Td className="font-semibold text-ink-900">{row.name}</Td>
                            <Td numeric>{formatQuantity(row.restocked, row.unit)}</Td>
                            <Td numeric>{formatQuantity(row.used, row.unit)}</Td>
                            <Td numeric className={Number(row.rejected) > 0 ? 'font-semibold text-status-fail-fg' : ''}>{formatQuantity(row.rejected, row.unit)}</Td>
                            <Td numeric priority="md">{Number(row.corrected) > 0 ? '+' : ''}{formatQuantity(row.corrected, row.unit)}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                )}
                <h3 className="mt-6 text-sm font-semibold text-ink-900">Low now</h3>
                {inventory.ingredients.low.length === 0 ? <p className="mt-2 text-sm text-ink-500">No ingredient is at or under its minimum.</p> : (
                  <ul className="mt-2 divide-y divide-line-100 text-sm">
                    {inventory.ingredients.low.map((row) => (
                      <li key={row.ingredientId} className="flex items-center justify-between gap-4 py-2.5">
                        <span className="font-medium text-ink-900">{row.name}</span>
                        <span className="text-xs text-ink-500 tabular-nums">{formatQuantity(row.stockQuantity, row.unit)} left · min {formatQuantity(row.minStockLevel, row.unit)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </>
        ) : <p className="mt-6 text-sm text-ink-500">Loading inventory activity…</p>}
      </div>
      <div hidden={activeTab !== 'Forecast'}>
        <ForecastPanel user={user} active={activeTab === 'Forecast'} />
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
