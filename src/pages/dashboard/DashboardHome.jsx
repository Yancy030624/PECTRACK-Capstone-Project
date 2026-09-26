import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { formatPeso } from '../../lib/format.js'
import { modules } from './modules.js'

// Stage 3 (RULES-PLANS/UI_AUDIT.md — M1, M2, M3, M4). This is the first
// screen every ADMIN/CASHIER login lands on — the demo's opening shot —
// and the KPI row had four separate defects stacked on top of each other:
//   M1 — the first tile was `bg-linear-to-br from-green-700 to-blue-900`.
//        The brief says avoid gradients, and green→navy isn't a brand
//        relationship — navy appears nowhere else in the identity. It
//        also made that one tile visually unlike its three siblings.
//   M2 — "View details →" was a plain <p>, styled to look like a link,
//        that did nothing on click. A false affordance.
//   M3 — the fourth tile was filler prose ("Use the navigation to move
//        through your permitted Pectrack modules securely") occupying a
//        metrics slot instead of a metric.
//   M4 — a failed /api/reports/summary fetch was swallowed with
//        `.catch(() => {})`, so every figure showed '—' forever and the
//        "Needs attention" panel read "Loading…" permanently — a broken
//        page that looks merely empty, the exact failure mode M4 names.
//
// Fixed together, per the audit's own instruction to restructure the row
// into "four honest tiles" that "read as one visual object": two are
// plain figures (collected, outstanding), two are real navigation (low
// stock, deliveries) using Dashboard.jsx's setActiveModule passed down as
// `onNavigate` — replacing M2's fake link with one that actually goes
// somewhere. There is no fifth slot left to pad with M3's prose.
export function DashboardHome({ user, onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // M4 fix: a failed load now sets a real error instead of vanishing
    // into an empty catch. See the <Alert> below.
    apiGet('/api/reports/summary')
      .then(setSummary)
      .catch((fetchError) => setError(fetchError.message))
  }, [])

  // Guard for the two linked tiles below: only navigate somewhere the
  // signed-in role can actually open. DashboardHome only renders for the
  // 'Dashboard' module, which modules.js restricts to ADMIN/CASHIER, and
  // both of those roles already hold 'Inventory Management' and
  // 'Delivery Management' today — so this rarely changes what renders.
  // It exists so a future edit to modules.js's role lists can't silently
  // point a tile at a module the viewer isn't allowed to open, rather
  // than trusting today's coincidence to hold forever.
  const allowedModuleNames = new Set(modules.filter((module) => module.roles.includes(user.role)).map((module) => module.name))

  // One list drives the whole row instead of four hand-written <article>
  // blocks with different markup — that repetition was part of why the
  // gradient tile read as "special" (M1) rather than as a sibling of the
  // other three. `module` is only set on the two tiles that should be
  // real navigation.
  const tiles = [
    { label: "Today's collected", value: summary ? formatPeso(summary.today.collected) : '—', caption: 'Today, so far' },
    { label: 'Outstanding', value: summary ? formatPeso(summary.outstanding) : '—', caption: 'Unpaid across all open orders', module: 'Payment & Billing' },
    { label: 'Low stock', value: summary ? summary.lowStockAlertsTotal : '—', caption: 'Open stock alerts', module: 'Inventory Management' },
    // Caption kept short deliberately: the longer wording this replaced
    // ("Pending assignment or already assigned") wrapped to two lines and
    // left this tile's content sitting unevenly against its three
    // siblings, which breaks the "repeated things are one object" rule
    // the four-tile row exists to satisfy.
    { label: 'Deliveries to assign', value: summary ? summary.deliveriesNeedingAttention : '—', caption: 'Assign deliveries', module: 'Delivery Management' },
    { label: 'Expired stock', value: summary ? summary.expiredStockTotal : '—', caption: 'Past their date, still in stock', module: 'Inventory Management' },
    // Phase 9A — the two things the production side needs someone to do:
    // buy what is running out, and review what a cashier recorded.
    { label: 'Low ingredients', value: summary ? summary.lowIngredientsTotal : '—', caption: 'Raw materials at or under minimum', module: 'Ingredients' },
    { label: 'Batches to approve', value: summary ? summary.pendingBatches : '—', caption: 'Recorded, waiting for review', module: 'Production' },
    // PHASE10 D3 — bulk orders an admin has to approve.
    { label: 'Bulk orders to approve', value: summary ? summary.ordersAwaitingApproval : '—', caption: 'Large orders waiting for an admin', module: 'Order Management' },
    // PHASE10 B1 — from the latest forecast; the Forecast tab lists them
    // with how many to bake. Marked when the forecast used assumed data.
    { label: 'Likely to sell out', value: summary ? (summary.likelySellOut ? summary.likelySellOut.count : '—') : '—', caption: summary?.likelySellOut ? (summary.likelySellOut.assumed ? 'By tomorrow · assumed demand' : 'By tomorrow, per the forecast') : 'No forecast run yet', module: 'Reporting & Analytics' },
  ]

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      {/* H1: page titles drop from text-3xl font-extrabold to 24px/600. */}
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Dashboard</h1>
      <p className="mt-2 text-sm text-ink-500">Welcome back, {user.name}. Here is what needs your attention today.</p>

      {error && (
        <div className="mt-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => {
          const linkable = tile.module && allowedModuleNames.has(tile.module)
          // A fixed inner layout: label at the top, value directly under it,
          // caption pinned to the bottom — so a two-line caption or a long
          // peso figure never shifts the value's baseline across tiles.
          const body = (
            <div className="flex h-full min-h-40 flex-col">
              <p className="text-sm font-medium text-ink-500">{tile.label}</p>
              <p className="mt-3 text-3xl font-semibold text-ink-900 tabular-nums xl:text-4xl">{tile.value}</p>
              <p className={`mt-auto pt-4 text-xs ${linkable ? 'font-medium text-brand-700' : 'text-ink-500'}`}>{linkable ? `${tile.caption} →` : tile.caption}</p>
            </div>
          )
          // M2 fix: a tile that navigates is a real <button>, not a <p>
          // styled to look clickable — same reasoning as C2's row fix
          // elsewhere, a false affordance is worse than none, and a real
          // button gets focus, Enter/Space, and screen-reader semantics
          // for free.
          return linkable ? (
            <button
              type="button"
              key={tile.label}
              onClick={() => onNavigate(tile.module)}
              className="rounded-panel border border-line-200 bg-surface p-6 text-left shadow-raised transition hover:bg-surface-sunk"
            >
              {body}
            </button>
          ) : (
            // M1 fix: every tile — including this one, which used to be
            // the gradient — is the same plain <Card>, so the row reads
            // as one repeated object instead of one special card among
            // three plain ones.
            <Card key={tile.label} className="p-6">
              {body}
            </Card>
          )
        })}
      </div>

      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Needs attention</h2>
            <p className="mt-1 text-sm text-ink-500">Low-stock alerts currently open.</p>
          </div>
        </div>
        {summary && summary.lowStockAlerts.length > 0 ? (
          <>
            <div className="mt-5 divide-y divide-line-100">
              {summary.lowStockAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between gap-4 py-4 text-sm text-ink-700">
                  <span className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-status-wait-bg text-status-wait-fg">!</span>
                    <span>
                      <span className="font-semibold text-ink-900">{alert.productName}{alert.variant ? ` (${alert.variant})` : ''}</span>
                      <span className="block text-xs text-ink-500">{alert.stockQuantity} left · minimum {alert.minStockLevel}</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {summary.lowStockAlertsTotal > summary.lowStockAlerts.length && (
              <p className="mt-4 text-xs font-medium text-status-wait-fg">
                Showing the {summary.lowStockAlerts.length} oldest of {summary.lowStockAlertsTotal} open alerts.
              </p>
            )}
          </>
        ) : (
          // M4 fix, second site: this used to read "Loading…" forever on
          // a failed fetch too, because it only distinguished "summary
          // loaded" from "still loading" and had no third state for
          // "failed". Now it does.
          <p className="mt-5 text-sm text-ink-500">{error ? 'Unable to load alerts.' : summary ? 'Nothing needs attention right now.' : 'Loading…'}</p>
        )}
      </Card>

      {/* Optional chaining: an API server started before Phase 9A does not
          send this field, and one missing list must not blank the screen. */}
      {summary?.lowIngredients?.length > 0 && (
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Low ingredients</h2>
          <p className="mt-1 text-sm text-ink-500">At or under their minimum. Record the purchase in Ingredients when it arrives.</p>
          <div className="mt-5 divide-y divide-line-100">
            {summary.lowIngredients.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm text-ink-700">
                <span>{item.name}</span>
                <span className="text-xs text-ink-500">{Number(item.stockQuantity).toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.unit} left · minimum {Number(item.minStockLevel).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
              </div>
            ))}
          </div>
          {summary.lowIngredientsTotal > summary.lowIngredients.length && (
            <p className="mt-4 text-xs font-medium text-status-wait-fg">Showing {summary.lowIngredients.length} of {summary.lowIngredientsTotal}.</p>
          )}
        </Card>
      )}

      {summary && summary.expiredStock.length > 0 && (
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Expired stock</h2>
          <p className="mt-1 text-sm text-ink-500">Hidden from the menu and refused at checkout until written off — file a loss report with reason Expired, or clear the date if it was entered wrongly.</p>
          <div className="mt-5 divide-y divide-line-100">
            {summary.expiredStock.map((item) => (
              <div key={item.productId} className="flex items-center justify-between gap-4 py-3 text-sm text-ink-700">
                <span>{item.productName}{item.variant ? ` (${item.variant})` : ''}</span>
                <span className="text-xs text-ink-500">{item.stockQuantity} on hand · expired {item.expirationDate}</span>
              </div>
            ))}
          </div>
          {summary.expiredStockTotal > summary.expiredStock.length && (
            <p className="mt-4 text-xs font-medium text-status-wait-fg">Showing {summary.expiredStock.length} of {summary.expiredStockTotal}.</p>
          )}
        </Card>
      )}
    </section>
  )
}
