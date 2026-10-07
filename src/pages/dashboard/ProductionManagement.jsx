import { ProductionSchedule } from './ProductionSchedule.jsx'

// Production — the Due today schedule (PHASE10 B5): open orders grouped by
// the hour they are due, so the baker sees what has to be ready, by when.
//
// Production batches, recipes and ingredients used to live here too. They
// were removed as out of the paper's scope (migration 022): the system
// inventories finished products only, and stock arrives through Inventory
// Management's restock.
export function ProductionManagement({ user }) {
  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 print:hidden">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900 print:hidden">Production</h1>
      <p className="mt-2 text-sm text-ink-500 print:hidden">Orders due today, grouped by the hour they are due — what has to be ready, and by when.</p>
      <ProductionSchedule user={user} />
    </section>
  )
}
