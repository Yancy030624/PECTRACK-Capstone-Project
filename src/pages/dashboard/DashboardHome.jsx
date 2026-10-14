import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { formatPeso } from '../../lib/format.js'
import { STOCK_STATUSES, TONES, stockStatus } from '../../lib/stockHealth.js'
import { modules } from './modules.js'

// The Dashboard — the first screen an ADMIN or CASHIER sees.
//
// It answers one question: "is anything wrong right now?" Every tile is a
// status, coloured by what it means — green good, yellow okay, red needs
// attention — and opens the module that fixes it, already filtered to the
// problem (the Low stock tile opens Inventory showing only low stock).
// Anything that is not a status a person acts on was taken off: the
// detail lives in its own module, one click away.
//
// Counts come from two calls: /api/reports/summary (orders, deliveries,
// money, the forecast) and /api/inventory, read through the same
// stockStatus() rule the Inventory screen filters by, so the two always
// agree.
export function DashboardHome({ user, onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [inventory, setInventory] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([apiGet('/api/reports/summary'), apiGet('/api/inventory')])
      .then(([summaryData, inventoryData]) => {
        setSummary(summaryData)
        setInventory(inventoryData.inventory)
      })
      .catch((fetchError) => setError(fetchError.message))
  }, [])

  // Only link to a module the signed-in role can open.
  const allowed = new Set(modules.filter((module) => module.roles.includes(user.role)).map((module) => module.name))
  const isAdmin = user.role === 'ADMIN'
  const loaded = summary && inventory

  const stockCounts = { GOOD: 0, OKAY: 0, LOW: 0 }
  for (const item of inventory ?? []) stockCounts[stockStatus(item)] += 1
  const lowItems = (inventory ?? [])
    .filter((item) => stockStatus(item) === 'LOW')
    .sort((a, b) => a.stockQuantity - a.minStockLevel - (b.stockQuantity - b.minStockLevel))

  // Each tile: a count, the rule that colours it, and where it leads.
  const tiles = loaded ? [
    {
      label: 'Low stock',
      value: stockCounts.LOW,
      tone: stockCounts.LOW > 0 ? 'attention' : stockCounts.OKAY > 0 ? 'okay' : 'good',
      note: stockCounts.LOW > 0 ? 'At or under the minimum — restock' : stockCounts.OKAY > 0 ? `${stockCounts.OKAY} running low` : 'Every product well stocked',
      to: ['Inventory Management', { stockFilter: 'LOW' }],
    },
    {
      label: 'Running low',
      value: stockCounts.OKAY,
      tone: stockCounts.OKAY > 0 ? 'okay' : 'good',
      note: stockCounts.OKAY > 0 ? 'Close to the minimum — plan the bake' : 'Nothing close to the minimum',
      to: ['Inventory Management', { stockFilter: 'OKAY' }],
    },
    {
      label: 'Orders to prepare',
      value: summary.ordersToPrepare,
      tone: summary.ordersOverdue > 0 ? 'attention' : summary.ordersToPrepare > 0 ? 'okay' : 'good',
      note: summary.ordersOverdue > 0 ? `${summary.ordersOverdue} past the time asked for` : summary.ordersToPrepare > 0 ? 'None overdue' : 'All caught up',
      to: ['Production'],
    },
    {
      label: 'Deliveries to assign',
      value: summary.deliveriesNeedingAttention,
      tone: summary.deliveriesNeedingAttention > 0 ? 'attention' : 'good',
      note: summary.deliveriesNeedingAttention > 0 ? 'Waiting for a driver' : 'Every delivery has a driver',
      to: ['Delivery Management', { focus: 'toAssign' }],
    },
    isAdmin && {
      label: 'Bulk orders to approve',
      value: summary.ordersAwaitingApproval,
      tone: summary.ordersAwaitingApproval > 0 ? 'attention' : 'good',
      note: summary.ordersAwaitingApproval > 0 ? 'Large orders waiting for you' : 'Nothing waiting',
      to: ['Order Management'],
    },
    {
      label: 'Unpaid balances',
      value: formatPeso(summary.outstanding),
      tone: Number(summary.outstanding) > 0 ? 'okay' : 'good',
      note: Number(summary.outstanding) > 0 ? 'Still owed on open orders' : 'Everything is paid',
      to: ['Payment & Billing', { focus: 'unpaid' }],
    },
    summary.likelySellOut && {
      label: 'Likely to sell out',
      value: summary.likelySellOut.count,
      tone: summary.likelySellOut.count > 0 ? 'okay' : 'good',
      note: summary.likelySellOut.assumed ? 'By tomorrow · assumed demand' : 'By tomorrow, per the forecast',
      to: ['Reporting & Analytics'],
    },
  ].filter(Boolean) : []

  const attentionCount = tiles.filter((tile) => tile.tone === 'attention').length

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">
            {loaded
              ? attentionCount > 0
                ? `Hi ${user.name.split(' ')[0]} — ${attentionCount} thing${attentionCount === 1 ? ' needs' : 's need'} your attention.`
                : `Hi ${user.name.split(' ')[0]} — everything looks good.`
              : `Welcome back, ${user.name}.`}
          </p>
        </div>
        <Legend />
      </div>

      {error && <div className="mt-4"><Alert variant="error">{error}</Alert></div>}

      {/* Today at a glance: plain figures, no colour — they are facts,
          not problems. */}
      <div className="mt-6 grid grid-cols-3 gap-3 rounded-panel border border-line-200 bg-surface p-4 shadow-raised sm:p-5">
        <TodayFigure label="Orders today" value={summary ? summary.today.ordersPlaced : '—'} />
        <TodayFigure label="Ordered today" value={summary ? formatPeso(summary.today.ordered) : '—'} />
        <TodayFigure label="Collected today" value={summary ? formatPeso(summary.today.collected) : '—'} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loaded
          ? tiles.map((tile) => <StatusTile key={tile.label} tile={tile} linkable={allowed.has(tile.to[0])} onOpen={() => onNavigate(...tile.to)} />)
          : Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-panel bg-surface-sunk" />)}
      </div>

      {/* The products behind the red stock tiles, worst first — enough to
          act on without leaving the page; the full list is a click away. */}
      {loaded && lowItems.length > 0 && (
        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
                <span className={`h-2.5 w-2.5 rounded-full ${TONES.attention.dot}`} aria-hidden="true" />
                Restock first
              </h2>
              <p className="mt-1 text-sm text-ink-500">At or under the minimum, the furthest under at the top.</p>
            </div>
            {allowed.has('Inventory Management') && (
              <button type="button" onClick={() => onNavigate('Inventory Management', { stockFilter: 'LOW' })} className="text-sm font-semibold text-brand-700 hover:underline">
                View all {lowItems.length} →
              </button>
            )}
          </div>
          <ul className="mt-4 divide-y divide-line-100">
            {lowItems.slice(0, 6).map((item) => {
              const status = stockStatus(item)
              return (
                <li key={item.productId} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink-900">{item.productName}</span>
                    {item.variant && <span className="text-ink-500"> · {item.variant}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-ink-500 tabular-nums">{item.stockQuantity} left · min {item.minStockLevel}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[STOCK_STATUSES[status].tone].pill}`}>{STOCK_STATUSES[status].label}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </section>
  )
}

function StatusTile({ tile, linkable, onOpen }) {
  const tone = TONES[tile.tone]
  const body = (
    <div className="flex h-full min-h-32 flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-700">{tile.label}</p>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.pill}`}>
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
          {tone.short}
        </span>
      </div>
      <p className={`mt-3 text-3xl font-semibold tabular-nums ${tile.tone === 'attention' ? tone.text : 'text-ink-900'}`}>{tile.value}</p>
      <p className="mt-auto pt-3 text-xs text-ink-500">{tile.note}{linkable ? <span className="font-semibold text-brand-700"> · View →</span> : null}</p>
    </div>
  )
  const shell = `rounded-panel border border-line-200 border-l-4 ${tone.edge} bg-surface p-5 text-left shadow-raised`
  return linkable
    ? <button type="button" onClick={onOpen} className={`${shell} transition hover:bg-surface-sunk`} aria-label={`${tile.label}: ${tile.value}, ${tone.label}. Open.`}>{body}</button>
    : <div className={shell}>{body}</div>
}

function TodayFigure({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-ink-900 tabular-nums sm:text-2xl">{value}</p>
    </div>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-3 text-xs text-ink-700" aria-label="Colour key">
      {['good', 'okay', 'attention'].map((tone) => (
        <li key={tone} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${TONES[tone].dot}`} aria-hidden="true" />
          {TONES[tone].label}
        </li>
      ))}
    </ul>
  )
}
