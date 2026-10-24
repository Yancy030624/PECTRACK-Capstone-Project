import { useEffect, useState } from 'react'
import { useNotificationRefresh } from '../../lib/useNotificationRefresh.js'
import { apiGet } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { formatPeso } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'
import { STOCK_STATUSES, TONES, needsAttention, stockStatus } from '../../lib/stockHealth.js'
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
//
// Top to bottom (CLIENT_REVISIONS_PLAN.md, R4 — "organized at a glance"):
// the greeting with today's figures; "Needs action now", only the tiles
// that are not green, the red ones first, with the green ones folded into
// one line; then side by side Restock first (the most important, the user
// 2026-10-16) and Needed by — paid orders still to be picked up or sent
// out, soonest first, each opening in Payment & Billing; then Recent
// orders.
const recentRefreshMs = 20_000
const restockRows = 5
const dueRows = 5

export function DashboardHome({ user, onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [inventory, setInventory] = useState(null)
  const [ingredients, setIngredients] = useState(null)
  const [recentOrders, setRecentOrders] = useState(null)
  const [dueOrders, setDueOrders] = useState(null)
  const [error, setError] = useState('')

  const loadTiles = () => Promise.all([apiGet('/api/reports/summary'), apiGet('/api/inventory'), apiGet('/api/ingredients')])
    .then(([summaryData, inventoryData, ingredientData]) => {
      setSummary(summaryData)
      setInventory(inventoryData.inventory)
      setIngredients(ingredientData.ingredients)
    })
    .catch((fetchError) => setError(fetchError.message))
  const loadRecentOrders = () => apiGet('/api/orders/recent').then((data) => setRecentOrders(data.orders)).catch(() => {})
  // Paid orders not handed over yet, by when they are needed (or when they
  // were placed, for "as soon as ready"), soonest first.
  const neededAt = (order) => new Date(order.requestedFulfillmentTime ?? order.orderDate).getTime()
  const loadDueOrders = () => apiGet('/api/orders')
    .then((data) => setDueOrders(data.orders
      .filter((order) => order.status === 'READY_FOR_PICKUP' || order.status === 'READY_FOR_DELIVERY')
      .sort((a, b) => neededAt(a) - neededAt(b))))
    .catch(() => {})

  useEffect(() => {
    loadTiles()
  }, [])

  // The newest orders, refreshed on their own while the page is open.
  useEffect(() => {
    const load = () => { loadRecentOrders(); loadDueOrders() }
    load()
    const timer = window.setInterval(load, recentRefreshMs)
    return () => window.clearInterval(timer)
  }, [])

  // Something new from the bell (an order, a payment, a delivery) changes
  // the tiles and the list, so both reload at once.
  useNotificationRefresh(() => { loadTiles(); loadRecentOrders(); loadDueOrders() })

  // Only link to a module the signed-in role can open.
  const allowed = new Set(modules.filter((module) => module.roles.includes(user.role)).map((module) => module.name))
  const loaded = summary && inventory

  const stockCounts = { GOOD: 0, LOW: 0, SELLING_OUT: 0, SOLD_OUT: 0 }
  for (const item of inventory ?? []) stockCounts[stockStatus(item)] += 1
  // Ingredients (CLIENT_REVISIONS_PLAN.md, R5), by the same rule.
  const ingredientCounts = { GOOD: 0, LOW: 0, SELLING_OUT: 0, SOLD_OUT: 0 }
  for (const ingredient of ingredients ?? []) ingredientCounts[stockStatus(ingredient)] += 1
  const lowItems = (inventory ?? [])
    .filter((item) => needsAttention(stockStatus(item)))
    .sort((a, b) => a.stockQuantity - b.stockQuantity)

  // Each tile: a count, the rule that colours it, and where it leads.
  const tiles = loaded ? [
    {
      // Soft and hard breads apart (the user, 2026-10-23): a soft bread is
      // never restocked during the day, so it is "about to be sold out";
      // a hard bread at its minimum is "low stock" — time to produce.
      label: 'Soft breads about to be sold out',
      goodLabel: 'soft breads',
      value: stockCounts.SELLING_OUT + stockCounts.SOLD_OUT,
      tone: stockCounts.SELLING_OUT + stockCounts.SOLD_OUT > 0 ? 'okay' : 'good',
      note: stockCounts.SOLD_OUT > 0 ? `${stockCounts.SOLD_OUT} already sold out today` : stockCounts.SELLING_OUT > 0 ? 'Not restocked until 5:00 AM' : 'Plenty on the shelf',
      to: ['Inventory Management', { breadType: 'SOFT', stockFilter: stockCounts.SELLING_OUT > 0 ? 'SELLING_OUT' : 'SOLD_OUT' }],
    },
    {
      label: 'Hard breads low stock',
      goodLabel: 'hard breads',
      value: stockCounts.LOW,
      tone: stockCounts.LOW > 0 ? 'attention' : 'good',
      note: stockCounts.LOW > 0 ? 'At the minimum — time to produce' : 'Well stocked',
      to: ['Inventory Management', { breadType: 'HARD', stockFilter: 'LOW' }],
    },
    {
      label: 'Ingredients low stock',
      goodLabel: 'ingredients',
      value: ingredientCounts.LOW,
      tone: ingredientCounts.LOW > 0 ? 'attention' : 'good',
      note: ingredientCounts.LOW > 0 ? 'At or under the minimum' : 'Well stocked',
      to: ['Inventory Management', { tab: 'Ingredients', stockFilter: 'LOW' }],
    },
    {
      label: 'Orders',
      goodLabel: 'orders',
      value: summary.ordersToPrepare,
      tone: summary.ordersOverdue > 0 ? 'attention' : summary.ordersToPrepare > 0 ? 'okay' : 'good',
      note: summary.ordersOverdue > 0 ? `${summary.ordersOverdue} overdue` : summary.ordersToPrepare > 0 ? 'None overdue' : 'All caught up',
      // No Production module any more: today's orders are in Order
      // Management, which opens on Today (payment first, the adviser).
      to: ['Order Management', { day: 'TODAY', status: 'OPEN' }],
    },
    {
      label: 'Deliveries to assign',
      goodLabel: 'deliveries',
      value: summary.deliveriesNeedingAttention,
      tone: summary.deliveriesNeedingAttention > 0 ? 'attention' : 'good',
      note: summary.deliveriesNeedingAttention > 0 ? 'Waiting for a driver' : 'All assigned',
      to: ['Delivery Management', { focus: 'toAssign' }],
    },
    // No "Likely to sell out" tile any more: a soft bread is meant to sell
    // out daily, and what to bake is Inventory → Production
    // (RULES-PLANS/REPORTS_ALIGNMENT_ANALYSIS.md, D).
  ].filter(Boolean) : []

  const attentionCount = tiles.filter((tile) => tile.tone === 'attention').length
  // Red before yellow; within a colour, the bigger count first. A peso
  // figure counts as one item: it is a single thing to chase.
  const toneOrder = { attention: 0, okay: 1 }
  const size = (tile) => (typeof tile.value === 'number' ? tile.value : 1)
  const actionTiles = tiles.filter((tile) => tile.tone !== 'good').sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone] || size(b) - size(a))
  // The green line names what is fine in a word or two ("ingredients"),
  // not the tile's label, which reads as a problem ("Ingredients running
  // low"). Low stock and Running low both mean "product stock".
  const goodTiles = tiles.filter((tile) => tile.tone === 'good')

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
        {/* Today at a glance: plain figures, no colour — they are facts,
            not problems. */}
        <div className="grid w-full grid-cols-3 gap-4 rounded-panel bg-surface px-4 py-3 shadow-raised sm:w-auto sm:gap-8 sm:px-5">
          <TodayFigure label="Orders today" value={summary ? summary.today.ordersPlaced : '—'} />
          <TodayFigure label="Ordered" value={summary ? formatPeso(summary.today.ordered) : '—'} />
          <TodayFigure label="Collected" value={summary ? formatPeso(summary.today.collected) : '—'} />
        </div>
      </div>

      {error && <div className="mt-4"><Alert variant="error">{error}</Alert></div>}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-900">Needs action now</h2>
        <Legend />
      </div>
      {!loaded ? (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-panel bg-surface-sunk" />)}
        </div>
      ) : actionTiles.length === 0 ? (
        <p className="mt-3 rounded-panel border-l-4 border-l-emerald-500 bg-surface p-4 shadow-raised text-sm text-ink-700 shadow-raised">Nothing needs action right now.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {actionTiles.map((tile) => <StatusTile key={tile.label} tile={tile} linkable={allowed.has(tile.to[0])} onOpen={() => onNavigate(...tile.to)} />)}
        </div>
      )}
      {loaded && goodTiles.length > 0 && (
        <p className="mt-3 flex items-start gap-2 text-sm text-ink-500">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONES.good.dot}`} aria-hidden="true" />
          <span><span className="font-semibold text-ink-700">All good:</span> {[...new Set(goodTiles.map((tile) => tile.goodLabel))].join(', ')}.</span>
        </p>
      )}

      {/* grid-cols-1, not no columns: an implicit column sizes itself to its
          widest row, which pushed these two cards past a phone's edge. */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RestockFirst loaded={loaded} lowItems={lowItems} canOpen={allowed.has('Inventory Management')} onViewAll={() => onNavigate('Inventory Management', { stockFilter: 'LOW' })} />
        <NeededBy orders={dueOrders} canOpen={allowed.has('Payment & Billing')} onOpen={(order) => onNavigate('Payment & Billing', { orderId: order.id, at: Date.now() })} onViewAll={() => onNavigate('Payment & Billing')} />
      </div>

      <RecentOrders orders={recentOrders} canOpen={allowed.has('Order Management')} onOpen={(order) => onNavigate('Order Management', { orderId: order.id })} onViewAll={() => onNavigate('Order Management')} />
    </section>
  )
}

const timeFormat = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
const dayTimeFormat = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
const manilaDay = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(value))

// The products behind the red stock tile, worst first — enough to act on
// without leaving the page; the full list is a click away.
function RestockFirst({ loaded, lowItems, canOpen, onViewAll }) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
          <span className={`h-2.5 w-2.5 rounded-full ${lowItems.length > 0 ? TONES.attention.dot : TONES.good.dot}`} aria-hidden="true" />
          Running out
        </h2>
        {canOpen && lowItems.length > 0 && (
          <button type="button" onClick={onViewAll} className="text-sm font-semibold text-brand-700 hover:underline">
            View all {lowItems.length} →
          </button>
        )}
      </div>
      {!loaded ? (
        <div className="mt-3 h-32 animate-pulse rounded-control bg-surface-sunk" />
      ) : lowItems.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">Nothing is running out.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line-100">
          {lowItems.slice(0, restockRows).map((item) => {
            const status = stockStatus(item)
            return (
              <li key={item.productId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink-900">{item.productName}</span>
                  {item.variant && <span className="text-ink-500"> · {item.variant}</span>}
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-ink-500 tabular-nums">{item.stockQuantity} left · min {item.minStockLevel}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[STOCK_STATUSES[status].tone].pill}`}>{STOCK_STATUSES[status].label}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// Needed by (the user, 2026-10-16): paid orders still to be picked up or
// sent out, soonest first, so the counter sees what is coming. Each row has
// a status pill by how close its time is: an hour or less (or passed) needs
// attention, five hours or less is okay, the rest is good. An order with no
// time ("as soon as ready") is wanted now, so it needs attention. Each row
// opens the order in Payment & Billing. The bell also announces an order
// one hour before its time (GET /api/notifications, due_soon).
const hourMs = 60 * 60 * 1000
function dueTone(order, now) {
  const when = order.requestedFulfillmentTime ? new Date(order.requestedFulfillmentTime).getTime() : now
  const left = when - now
  if (left <= hourMs) return 'attention'
  if (left <= 5 * hourMs) return 'okay'
  return 'good'
}
const dueToneLabel = { attention: 'Needs attention', okay: 'Okay', good: 'Good' }
function NeededBy({ orders, canOpen, onOpen, onViewAll }) {
  const now = Date.now()
  const today = manilaDay(new Date())
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-900">Needed by</h2>
        {canOpen && orders?.length > 0 && <button type="button" onClick={onViewAll} className="text-sm font-semibold text-brand-700 hover:underline">View all {orders.length} →</button>}
      </div>
      {orders === null ? (
        <div className="mt-3 h-32 animate-pulse rounded-control bg-surface-sunk" />
      ) : orders.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">No orders waiting to be picked up or delivered.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line-100">
          {orders.slice(0, dueRows).map((order) => {
            const when = order.requestedFulfillmentTime
            const late = when && new Date(when).getTime() < now
            const tone = dueTone(order, now)
            const row = (
              <>
                <span className="w-16 shrink-0 font-semibold text-ink-900 tabular-nums sm:w-20">{orderLabel(order)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-900">{order.customerName ?? 'Walk-in'}</span>
                  <span className="block text-xs text-ink-500">{order.orderType === 'DELIVERY' ? 'Delivery' : 'Pickup'}</span>
                </span>
                <span className={`shrink-0 text-right text-xs font-semibold ${late ? 'text-status-fail-fg' : 'text-ink-700'}`}>
                  {when ? (manilaDay(when) === today ? timeFormat.format(new Date(when)) : dayTimeFormat.format(new Date(when))) : 'As soon as ready'}
                  {late && <span className="block font-normal">late</span>}
                </span>
                <span className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:w-32 ${TONES[tone].pill}`}>
                  <span className={`h-2 w-2 rounded-full ${TONES[tone].dot}`} aria-hidden="true" />
                  {dueToneLabel[tone]}
                </span>
              </>
            )
            return (
              <li key={order.id}>
                {canOpen
                  ? <button type="button" onClick={() => onOpen(order)} aria-label={`Open order ${orderLabel(order)} in Payment & Billing`} className="flex w-full items-center gap-3 rounded-control px-2 py-2.5 text-left text-sm transition hover:bg-surface-sunk">{row}</button>
                  : <div className="flex items-center gap-3 px-2 py-2.5 text-sm">{row}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// What a recent order still owes, in words.
function paymentState(order) {
  if (order.status === 'CANCELLED') return { label: '—', tone: 'text-ink-500' }
  if (order.isFullyPaid) return { label: 'Paid', tone: 'text-status-done-fg' }
  if (order.hasPayments) return { label: `${formatPeso(order.balanceDue)} owed`, tone: 'text-status-wait-fg' }
  return { label: 'Unpaid', tone: 'text-status-wait-fg' }
}

// The newest orders (CLIENT_REVISIONS_PLAN.md, R4). Each row opens the
// order in Order Management.
function RecentOrders({ orders, canOpen, onOpen, onViewAll }) {
  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-900">Recent orders</h2>
        {canOpen && <button type="button" onClick={onViewAll} className="text-sm font-semibold text-brand-700 hover:underline">All orders →</button>}
      </div>
      {orders === null ? (
        <div className="mt-3 h-32 animate-pulse rounded-control bg-surface-sunk" />
      ) : orders.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">No orders yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line-100">
          {orders.map((order) => {
            const payment = paymentState(order)
            const row = (
              <>
                <span className="w-24 shrink-0 font-semibold text-ink-900 tabular-nums">{orderLabel(order)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-900">{order.customerName ?? 'Walk-in'}</span>
                  <span className="block text-xs text-ink-500">{timeFormat.format(new Date(order.orderDate))} · {order.orderType === 'DELIVERY' ? 'Delivery' : 'Pickup'}</span>
                </span>
                <span className="hidden w-28 shrink-0 text-right sm:block">
                  <span className="block font-medium text-ink-900 tabular-nums">{formatPeso(order.totalAmount)}</span>
                  <span className={`block text-xs font-semibold ${payment.tone}`}>{payment.label}</span>
                </span>
                <span className="shrink-0 text-right sm:w-36"><StatusBadge status={order.status} /></span>
              </>
            )
            return (
              <li key={order.id}>
                {canOpen
                  ? <button type="button" onClick={() => onOpen(order)} aria-label={`Open order ${orderLabel(order)}`} className="flex w-full items-center gap-3 rounded-control px-2 py-2.5 text-left text-sm transition hover:bg-surface-sunk">{row}</button>
                  : <div className="flex items-center gap-3 px-2 py-2.5 text-sm">{row}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function StatusTile({ tile, linkable, onOpen }) {
  const tone = TONES[tile.tone]
  const body = (
    <div className="flex h-full flex-col sm:min-h-32">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-700">{tile.label}</p>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.pill}`}>
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
          {tone.short}
        </span>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums sm:mt-3 sm:text-3xl ${tile.tone === 'attention' ? tone.text : 'text-ink-900'}`}>{tile.value}</p>
      <p className="mt-auto pt-1 text-xs text-ink-500 sm:pt-3">{tile.note}{linkable ? <span className="font-semibold text-brand-700"> · View →</span> : null}</p>
    </div>
  )
  const shell = `rounded-panel border-l-4 ${tone.edge} bg-surface p-4 text-left shadow-raised sm:p-5`
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
