import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'

export function DashboardHome({ user, activeModule }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    apiGet('/api/reports/summary').then(setSummary).catch(() => {})
  }, [])

  const primaryValue = summary ? `₱${summary.today.collected}` : '—'
  const pendingCount = summary ? summary.lowStockAlertsTotal + summary.deliveriesNeedingAttention : '—'

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{activeModule}</h1>
      <p className="mt-2 text-sm text-slate-500">Welcome back, {user.name}. Here is what needs your attention today.</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl bg-linear-to-br from-green-700 to-blue-900 p-6 text-white shadow-lg"><p className="text-sm text-green-100">Today's collected</p><p className="mt-3 text-4xl font-extrabold">{primaryValue}</p><p className="mt-7 text-xs text-green-100">Today, so far</p></article>
        <article className="rounded-2xl border border-green-100 bg-white p-6"><p className="text-sm font-semibold text-slate-500">Outstanding</p><p className="mt-3 text-4xl font-extrabold text-slate-900">{summary ? `₱${summary.outstanding}` : '—'}</p><p className="mt-7 text-xs text-slate-400">Unpaid across all open orders</p></article>
        <article className="rounded-2xl border border-green-100 bg-white p-6"><p className="text-sm font-semibold text-slate-500">Pending actions</p><p className="mt-3 text-4xl font-extrabold text-slate-900">{pendingCount}</p><p className="mt-7 text-xs font-bold text-green-700">View details →</p></article>
        <article className="rounded-2xl border border-green-100 bg-[#fbfbdc] p-6 sm:col-span-2 xl:col-span-1"><p className="text-sm font-semibold text-green-800">Quick access</p><p className="mt-3 text-sm leading-6 text-slate-600">Use the navigation to move through your permitted Pectrack modules securely.</p></article>
      </div>
      <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Needs attention</h2><p className="mt-1 text-sm text-slate-500">Low-stock alerts currently open.</p></div></div>
        {summary && summary.lowStockAlerts.length > 0 ? (
          <>
            <div className="mt-5 divide-y divide-slate-100">
              {summary.lowStockAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between gap-4 py-4 text-sm">
                  <span className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800">!</span>{alert.productName}{alert.variant ? ` (${alert.variant})` : ''} — {alert.alertMessage}</span>
                </div>
              ))}
            </div>
            {summary.lowStockAlertsTotal > summary.lowStockAlerts.length && (
              <p className="mt-4 text-xs font-semibold text-amber-800">Showing the {summary.lowStockAlerts.length} oldest of {summary.lowStockAlertsTotal} open alerts.</p>
            )}
          </>
        ) : (
          <p className="mt-5 text-sm text-slate-500">{summary ? 'Nothing needs attention right now.' : 'Loading…'}</p>
        )}
      </div>
    </section>
  )
}
