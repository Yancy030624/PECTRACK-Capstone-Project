import { useState } from 'react'
import { Button } from '../../components/ui/Button.jsx'
import { CustomerManagement } from './CustomerManagement.jsx'
import { StaffManagement } from './StaffManagement.jsx'

// User Management (the user, 2026-10-16): Customer Management and Staff
// Management in one module, one tab each. A cashier sees Customers only
// (read-only, as before); the Staff tab is the admin's.
export function UserManagement({ user }) {
  const tabs = user.role === 'ADMIN' ? ['Customers', 'Staff'] : ['Customers']
  const [tab, setTab] = useState('Customers')
  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">User Management</h1>
      {tabs.length > 1 && (
        <div className="mt-4 flex gap-2" role="tablist">
          {tabs.map((name) => (
            <Button key={name} type="button" size="sm" role="tab" aria-selected={tab === name} variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>
              {name}
            </Button>
          ))}
        </div>
      )}
      {tab === 'Staff' ? <StaffManagement embedded /> : <CustomerManagement user={user} embedded />}
    </section>
  )
}
