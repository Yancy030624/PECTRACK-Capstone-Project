import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { apiGet } from '../../api/client.js'

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

const tabsFor = (role) => (role === 'ADMIN' ? ['Sales', 'Products', 'Inventory', 'Transactions', 'Report History'] : ['Sales', 'Products', 'Inventory', 'Transactions'])

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
  const [appliedRange, setAppliedRange] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  const generate = async (event) => {
    event.preventDefault()
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
  const salesCanvasRef = useRef(null)
  useEffect(() => {
    if (!sales || !salesCanvasRef.current) return
    const chart = new Chart(salesCanvasRef.current, {
      type: sales.groupBy === 'day' ? 'line' : 'bar',
      data: {
        labels: sales.buckets.map((bucket) => bucket.period),
        datasets: [
          { label: 'Ordered', data: sales.buckets.map((bucket) => Number(bucket.ordered)), backgroundColor: '#15803d', borderColor: '#15803d' },
          { label: 'Collected', data: sales.buckets.map((bucket) => Number(bucket.collected)), backgroundColor: '#1e3a8a', borderColor: '#1e3a8a' },
          // 'Refunds issued', not 'Refunded' — the legend is read next to
          // the Collected series, and the same non-subtraction applies here
          // as on the cards below.
          { label: 'Refunds issued', data: sales.buckets.map((bucket) => Number(bucket.refunded)), backgroundColor: '#b91c1c', borderColor: '#b91c1c' },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
    })
    return () => chart.destroy()
  }, [sales])

  const productsCanvasRef = useRef(null)
  useEffect(() => {
    if (!products || !productsCanvasRef.current) return
    const chart = new Chart(productsCanvasRef.current, {
      type: 'bar',
      data: {
        labels: products.products.map((product) => product.variant ? `${product.productName} (${product.variant})` : product.productName),
        datasets: [{ label: 'Revenue', data: products.products.map((product) => Number(product.revenue)), backgroundColor: '#15803d' }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
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

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Reporting &amp; Analytics</h1>
      <p className="mt-2 text-sm text-slate-500">Pick a date range and generate sales, product, and inventory reports — or browse the transaction history below.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button type="button" key={tab} onClick={() => setActiveTab(tab)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === tab ? 'bg-green-700 text-white' : 'bg-green-50 text-green-800 hover:bg-green-100'}`}>{tab}</button>
        ))}
      </div>
      <div hidden={activeTab === 'Transactions' || activeTab === 'Report History'} className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
        <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-500">From</label>
            <input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />
            {errors.from && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.from}</p>}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-500">To</label>
            <input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />
            {errors.to && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.to}</p>}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-500">Group by</label>
            <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700">
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
            {errors.groupBy && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.groupBy}</p>}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-500">Top products <span className="font-normal text-slate-400">(max 50)</span></label>
            <input value={productLimit} onChange={(event) => setProductLimit(event.target.value)} inputMode="numeric" className="w-20 rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />
            {Number(productLimit) > 50 && <p className="mt-1 text-[10px] font-medium text-amber-700">Capped at 50.</p>}
          </div>
          <button type="submit" disabled={generating} className="rounded-lg bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{generating ? 'Generating…' : 'Generate report'}</button>
          {csvHref && <a href={csvHref} download className="rounded-lg bg-green-50 px-4 py-2 text-xs font-bold text-green-800 transition hover:bg-green-100">Export sales CSV</a>}
        </form>
        {message && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}
      </div>

      <div hidden={activeTab !== 'Sales'}>
        {sales ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl bg-linear-to-br from-green-700 to-blue-900 p-6 text-white shadow-lg"><p className="text-sm text-green-100">Orders placed</p><p className="mt-3 text-3xl font-extrabold">{sales.totals.ordersPlaced}</p></article>
              <article className="rounded-2xl border border-green-100 bg-white p-6"><p className="text-sm font-semibold text-slate-500">Ordered</p><p className="mt-3 text-3xl font-extrabold text-slate-900">₱{sales.totals.ordered}</p></article>
              <article className="rounded-2xl border border-green-100 bg-white p-6"><p className="text-sm font-semibold text-slate-500">Collected</p><p className="mt-3 text-3xl font-extrabold text-slate-900">₱{sales.totals.collected}</p><p className="mt-2 text-[10px] text-slate-400">Refunds already removed</p></article>
              <article className="rounded-2xl border border-green-100 bg-white p-6"><p className="text-sm font-semibold text-slate-500">Refunds issued</p><p className="mt-3 text-3xl font-extrabold text-slate-900">₱{sales.totals.refunded}</p><p className="mt-2 text-[10px] text-slate-400">Already excluded from Collected — do not subtract</p></article>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Average payment: ₱{sales.totals.averagePayment}
              <span className="text-slate-400"> — per payment recorded, not per order (an order settled in instalments counts once per instalment).</span>
            </p>
            {summary && (
              <p className="mt-1 text-xs font-semibold text-amber-800">
                Outstanding across all open orders, as of now: ₱{summary.outstanding}
                <span className="font-normal text-slate-400"> — not scoped to the range above; this is every unpaid balance still on the books.</span>
              </p>
            )}

            <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
              <h2 className="text-lg font-bold">Sales over time</h2>
              {sales.buckets.length === 0 ? <p className="mt-4 text-sm text-slate-500">No activity in this range.</p> : <div className="relative mt-4 h-72"><canvas ref={salesCanvasRef} /></div>}
            </div>

            <div className="mt-6 overflow-x-auto rounded-2xl border border-green-100 bg-white p-6">
              <table className="w-full min-w-150 text-left text-xs">
                <thead><tr className="border-b border-slate-100 text-slate-400"><th className="py-2 pr-4 font-bold">Period</th><th className="py-2 pr-4 font-bold">Orders placed</th><th className="py-2 pr-4 font-bold">Ordered</th><th className="py-2 pr-4 font-bold">Collected</th><th className="py-2 pr-4 font-bold">Refunds issued<span className="block font-normal text-slate-300">not deducted from Collected</span></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.buckets.map((bucket) => (
                    <tr key={bucket.period}><td className="py-3 pr-4 font-semibold text-slate-800">{bucket.period}</td><td className="py-3 pr-4 text-slate-600">{bucket.ordersPlaced}</td><td className="py-3 pr-4 text-slate-600">₱{bucket.ordered}</td><td className="py-3 pr-4 text-slate-600">₱{bucket.collected}</td><td className="py-3 pr-4 text-slate-600">₱{bucket.refunded}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="mt-6 text-sm text-slate-500">Pick a date range and press Generate report to see sales.</p>}
      </div>

      <div hidden={activeTab !== 'Products'}>
        {products ? (
          <>
            <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
              <h2 className="text-lg font-bold">Product performance</h2>
              {products.products.length === 0 ? <p className="mt-4 text-sm text-slate-500">No sales in this range.</p> : <div className="relative mt-4 h-72"><canvas ref={productsCanvasRef} /></div>}
            </div>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-green-100 bg-white p-6">
              <table className="w-full min-w-125 text-left text-xs">
                <thead><tr className="border-b border-slate-100 text-slate-400"><th className="py-2 pr-4 font-bold">Product</th><th className="py-2 pr-4 font-bold">Quantity sold</th><th className="py-2 pr-4 font-bold">Revenue</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {products.products.map((product) => (
                    <tr key={product.productId}><td className="py-3 pr-4 font-semibold text-slate-800">{product.productName}{product.variant ? ` (${product.variant})` : ''}</td><td className="py-3 pr-4 text-slate-600">{product.quantitySold}</td><td className="py-3 pr-4 text-slate-600">₱{product.revenue}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="mt-6 text-sm text-slate-500">Pick a date range and press Generate report to see product performance.</p>}
      </div>

      <div hidden={activeTab !== 'Inventory'}>
        {inventory ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <article className="rounded-2xl bg-linear-to-br from-green-700 to-blue-900 p-6 text-white shadow-lg"><p className="text-sm text-green-100">Spoiled units</p><p className="mt-3 text-3xl font-extrabold">{inventory.spoilageUnits}</p></article>
              <article className="rounded-2xl border border-green-100 bg-white p-6"><p className="text-sm font-semibold text-slate-500">Open low-stock alerts</p><p className="mt-3 text-3xl font-extrabold text-slate-900">{inventory.lowStockAlertsTotal}</p></article>
            </div>

            <div className="mt-6 overflow-x-auto rounded-2xl border border-green-100 bg-white p-6">
              <h2 className="text-lg font-bold">Movement totals by reason</h2>
              <p className="mt-1 text-xs text-slate-500">Signed, exactly as recorded — negative is stock leaving, positive is stock arriving.</p>
              {inventory.movements.length === 0 ? <p className="mt-4 text-sm text-slate-500">No movements in this range.</p> : (
                <table className="mt-4 w-full min-w-100 text-left text-xs">
                  <thead><tr className="border-b border-slate-100 text-slate-400"><th className="py-2 pr-4 font-bold">Reason</th><th className="py-2 pr-4 font-bold">Net change</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {inventory.movements.map((movement) => (
                      <tr key={movement.reason}><td className="py-3 pr-4 font-semibold text-slate-800">{movement.reason}</td><td className={`py-3 pr-4 font-semibold ${movement.netChange < 0 ? 'text-red-700' : 'text-green-700'}`}>{movement.netChange > 0 ? '+' : ''}{movement.netChange}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
              <h2 className="text-lg font-bold">Needs attention</h2>
              {inventory.lowStockAlerts.length === 0 ? <p className="mt-4 text-sm text-slate-500">No open low-stock alerts.</p> : (
                <>
                  <div className="mt-4 divide-y divide-slate-100">
                    {inventory.lowStockAlerts.map((alert) => (
                      <div key={alert.id} className="flex items-center justify-between gap-4 py-4 text-sm">
                        <span className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800">!</span>{alert.productName}{alert.variant ? ` (${alert.variant})` : ''} — {alert.alertMessage}</span>
                      </div>
                    ))}
                  </div>
                  {inventory.lowStockAlertsTotal > inventory.lowStockAlerts.length && (
                    <p className="mt-4 text-xs font-semibold text-amber-800">Showing the {inventory.lowStockAlerts.length} oldest of {inventory.lowStockAlertsTotal} open alerts — resolve some in Inventory Management to see the rest.</p>
                  )}
                </>
              )}
            </div>
          </>
        ) : <p className="mt-6 text-sm text-slate-500">Pick a date range and press Generate report to see inventory activity.</p>}
      </div>
      <div hidden={activeTab !== 'Transactions'}>
        <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
          <form onSubmit={applyTxFilters} className="flex flex-wrap items-end gap-3">
            <div><label className="mb-1 block text-[10px] font-bold text-slate-500">From</label><input type="date" name="txFrom" defaultValue={txFilters.from} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" /></div>
            <div><label className="mb-1 block text-[10px] font-bold text-slate-500">To</label><input type="date" name="txTo" defaultValue={txFilters.to} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" /></div>
            <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-500">Method</label>
              <select name="txMethod" defaultValue={txFilters.method} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700">
                <option value="">Any</option>
                {paymentMethodOptions.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-500">Status</label>
              <select name="txStatus" defaultValue={txFilters.status} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700">
                <option value="">Any</option>
                {paymentStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <button type="submit" className="rounded-lg bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800">Apply filters</button>
          </form>

          {txMessage && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{txMessage}</p>}

          {txLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : txMessage ? null : !txResult || txResult.payments.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No payments match these filters.</p>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-175 text-left text-xs">
                  <thead><tr className="border-b border-slate-100 text-slate-400"><th className="py-2 pr-4 font-bold">Order</th><th className="py-2 pr-4 font-bold">Customer</th><th className="py-2 pr-4 font-bold">Method</th><th className="py-2 pr-4 font-bold">Amount</th><th className="py-2 pr-4 font-bold">Status</th><th className="py-2 pr-4 font-bold">When</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {txResult.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="py-3 pr-4 font-semibold text-slate-800">#{payment.orderId}</td>
                        <td className="py-3 pr-4 text-slate-600">{payment.customerName ?? 'Walk-in'}</td>
                        <td className="py-3 pr-4 text-slate-600">{payment.method}</td>
                        <td className="py-3 pr-4 text-slate-600">₱{payment.amount}</td>
                        <td className="py-3 pr-4 text-slate-600">{payment.status}</td>
                        <td className="py-3 pr-4 text-slate-500">{new Date(payment.status === 'REFUNDED' ? payment.refundedAt : (payment.paymentDate ?? payment.createdAt)).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>{txResult.total} total</span>
                <div className="flex gap-2">
                  <button type="button" disabled={txOffset === 0} onClick={() => setTxOffset(Math.max(0, txOffset - transactionsLimit))} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                  <button type="button" disabled={!txResult.hasMore} onClick={() => setTxOffset(txOffset + transactionsLimit)} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {user.role === 'ADMIN' && (
        <div hidden={activeTab !== 'Report History'}>
          <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
            <h2 className="text-lg font-bold">Report generation history</h2>
            <p className="mt-1 text-xs text-slate-500">Every deliberate report generation — the Sales tab's own "Generate report" and CSV export — with who ran it and when. The ambient views (this screen's own live figures, the dashboard summary) are not reports and never appear here.</p>

            {logsMessage && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{logsMessage}</p>}

            {logsLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading…</p>
            ) : logsMessage ? null : !logsResult || logsResult.logs.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No reports have been generated yet.</p>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-125 text-left text-xs">
                    <thead><tr className="border-b border-slate-100 text-slate-400"><th className="py-2 pr-4 font-bold">Report</th><th className="py-2 pr-4 font-bold">Generated by</th><th className="py-2 pr-4 font-bold">When</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {logsResult.logs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-3 pr-4 font-semibold text-slate-800">{log.reportType}</td>
                          <td className="py-3 pr-4 text-slate-600">{log.generatedByName}</td>
                          <td className="py-3 pr-4 text-slate-500">{new Date(log.generatedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>{logsResult.total} total</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={logsOffset === 0} onClick={() => setLogsOffset(Math.max(0, logsOffset - logsLimit))} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                    <button type="button" disabled={!logsResult.hasMore} onClick={() => setLogsOffset(logsOffset + logsLimit)} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
