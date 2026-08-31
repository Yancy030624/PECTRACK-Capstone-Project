// Placeholder overview shown for any module that doesn't have dedicated
// content yet. Reproduces the same static metrics/activity block every
// module showed before per-module components existed — only the heading
// changes to match whichever module is active.
export function DashboardHome({ user, activeModule }) {
  // Tailor the primary dashboard number to the person's job.
  const roleMetrics = { ADMIN: ['₱86,420', 'Monthly revenue'], CASHIER: ['24', 'Orders to process'], CUSTOMER: ['3', 'Active orders'], 'DELIVERY PERSONNEL': ['8', 'Deliveries today'] }
  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{activeModule}</h1>
      <p className="mt-2 text-sm text-slate-500">Welcome back, {user.name}. Here is what needs your attention today.</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-2xl bg-linear-to-br from-green-700 to-blue-900 p-6 text-white shadow-lg"><p className="text-sm text-green-100">{roleMetrics[user.role][1]}</p><p className="mt-3 text-4xl font-extrabold">{roleMetrics[user.role][0]}</p><p className="mt-7 text-xs text-green-100">Updated a few moments ago</p></article>
        <article className="rounded-2xl border border-green-100 bg-white p-6"><p className="text-sm font-semibold text-slate-500">Pending actions</p><p className="mt-3 text-4xl font-extrabold text-slate-900">{user.role === 'CUSTOMER' ? '1' : '12'}</p><p className="mt-7 text-xs font-bold text-green-700">View details →</p></article>
        <article className="rounded-2xl border border-green-100 bg-[#fbfbdc] p-6 sm:col-span-2 xl:col-span-1"><p className="text-sm font-semibold text-green-800">Quick access</p><p className="mt-3 text-sm leading-6 text-slate-600">Use the navigation to move through your permitted Pectrack modules securely.</p></article>
      </div>
      <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Recent activity</h2><p className="mt-1 text-sm text-slate-500">Latest updates relevant to your role.</p></div><button type="button" className="rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-800">View all</button></div>
        <div className="mt-5 divide-y divide-slate-100">{['Order #PT-2084 was updated', 'Payment status was confirmed', 'New activity was assigned'].map((item, index) => <div key={item} className="flex items-center justify-between gap-4 py-4 text-sm"><span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-green-100 text-green-800">✓</span>{item}</span><span className="whitespace-nowrap text-xs text-slate-400">{index + 1}h ago</span></div>)}</div>
      </div>
    </section>
  )
}
