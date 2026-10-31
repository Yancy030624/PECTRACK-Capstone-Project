import { useState } from 'react'
import { Button } from '../../components/ui/Button.jsx'
import { ModuleHeader } from '../../components/ui/ModuleHeader.jsx'
import { CustomerManagement } from './CustomerManagement.jsx'
import { StaffManagement } from './StaffManagement.jsx'

// User Management (the user, 2026-10-16): Customer Management and Staff
// Management in one module, one tab each. A cashier sees Customers only
// (read-only, as before); the Staff tab is the admin's.
export function UserManagement({ user }) {
  const tabs = user.role === 'ADMIN' ? ['Customers', 'Staff'] : ['Customers']
  const [tab, setTab] = useState('Customers')
  return (
    <section className="staff-module min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <ModuleHeader role={user.role} title="User Management" description="Manage customer records and staff accounts." />
      {tabs.length > 1 && (
        <div className="staff-tabs mt-6 flex flex-wrap gap-2" role="tablist" aria-label="User sections">
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
