import { useState } from 'react'
import { Brand } from '../../components/Brand.jsx'
import { AddressBook } from './AddressBook.jsx'
import { CustomerManagement } from './CustomerManagement.jsx'
import { DashboardHome } from './DashboardHome.jsx'
import { DeliveryManagement } from './DeliveryManagement.jsx'
import { InventoryManagement } from './InventoryManagement.jsx'
import { modules } from './modules.js'
import { MyProfile } from './MyProfile.jsx'
import { OrderManagement } from './OrderManagement.jsx'
import { PaymentBilling } from './PaymentBilling.jsx'
import { ProductManagement } from './ProductManagement.jsx'
import { StaffManagement } from './StaffManagement.jsx'

// Maps a module name to the component that renders its content. Modules
// without real content yet fall back to the shared placeholder; give a
// module its own entry here once it has one.
const moduleComponents = {
  ...Object.fromEntries(modules.map((module) => [module.name, DashboardHome])),
  'Staff Management': StaffManagement,
  'Product Management': ProductManagement,
  'Inventory Management': InventoryManagement,
  'Customer Management': CustomerManagement,
  'My Profile': MyProfile,
  'Order Management': OrderManagement,
  'Payment & Billing': PaymentBilling,
  'Delivery Management': DeliveryManagement,
  'Address Book': AddressBook,
}

// Render the protected shell and expose only modules the signed-in role can access.
export function Dashboard({ user, onLogout, onUserUpdated }) {
  // Track which permitted module is currently active.
  const [activeModule, setActiveModule] = useState('Dashboard')
  // Calculate the navigation items for the signed-in role.
  const allowedModules = modules.filter((module) => module.roles.includes(user.role))
  const ActiveModuleComponent = moduleComponents[activeModule]

  // Return the role-based dashboard page.
  return (
    <main className="min-h-screen bg-[#f5f7f2] text-slate-800">
      {/* Make the top bar useful on mobile and desktop. */}
      <header className="flex items-center justify-between border-b border-green-100 bg-white px-4 py-3 shadow-sm sm:px-7"><Brand /><div className="flex items-center gap-3"><span className="hidden text-right text-xs text-slate-500 sm:block"><strong className="block text-slate-800">{user.name}</strong>{user.role}</span><div className="grid h-9 w-9 place-items-center rounded-full bg-green-100 font-bold text-green-800">{user.name[0]}</div><button type="button" onClick={onLogout} className="rounded-lg border border-green-700 px-3 py-2 text-xs font-bold text-green-800 hover:bg-green-50">Log out</button></div></header>
      <div className="mx-auto flex max-w-7xl">
        {/* Render only the modules authorized for this role. */}
        <aside className="sticky top-0 hidden h-[calc(100vh-65px)] w-64 shrink-0 border-r border-green-100 bg-white p-5 md:block"><p className="mb-4 px-3 text-[10px] font-bold tracking-widest text-slate-400">MAIN MENU</p><nav className="space-y-1">{allowedModules.map((module) => <button type="button" key={module.name} onClick={() => setActiveModule(module.name)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${activeModule === module.name ? 'bg-green-700 text-white shadow-md shadow-green-700/20' : 'text-slate-600 hover:bg-green-50 hover:text-green-800'}`}><span className="text-lg">{module.icon}</span>{module.name}</button>)}</nav><div className="mt-8 rounded-xl bg-[#fbfbdc] p-4 text-xs leading-5 text-green-950"><strong className="block">{user.role} access</strong>You can use {allowedModules.length} permitted module{allowedModules.length === 1 ? '' : 's'}.</div></aside>
        {/* Provide a horizontally scrollable mobile navigation alternative. */}
        <div className="absolute top-16.25 z-10 flex w-full gap-2 overflow-x-auto border-b border-green-100 bg-white p-3 md:hidden">{allowedModules.map((module) => <button type="button" key={module.name} onClick={() => setActiveModule(module.name)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold ${activeModule === module.name ? 'bg-green-700 text-white' : 'bg-green-50 text-green-800'}`}>{module.name}</button>)}</div>
        {/* Delegate the main content area entirely to the active module's own component. */}
        <ActiveModuleComponent user={user} activeModule={activeModule} onUserUpdated={onUserUpdated} />
      </div>
    </main>
  )
}
