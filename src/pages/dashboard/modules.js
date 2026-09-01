// Define the available modules and the roles that can open each one.
//
// 'Inventory Management' used to be the nav label for the CATALOG screen
// (categories + products — see InventoryManagement.jsx's own file header),
// which was a misnomer once Phase 5 introduced actual stock management.
// Relabelled to 'Product Management' to match what that screen has always
// done, freeing the name for the real inventory (stock level) screen below.
export const modules = [
  { name: 'Dashboard', icon: '▦', roles: ['ADMIN', 'CUSTOMER', 'CASHIER', 'DELIVERY PERSONNEL'] },
  { name: 'Staff Management', icon: '☺', roles: ['ADMIN'] },
  { name: 'Order Management', icon: '□', roles: ['ADMIN', 'CUSTOMER', 'CASHIER', 'DELIVERY PERSONNEL'] },
  { name: 'Customer Management', icon: '♙', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Product Management', icon: '▤', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Inventory Management', icon: '⛁', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Payment & Billing', icon: '◫', roles: ['ADMIN', 'CUSTOMER', 'CASHIER'] },
  // Phase 7 (see PHASE7_PLAN.md) — one nav entry shared by three roles.
  // ADMIN/CASHIER get the assignment queue; DELIVERY PERSONNEL get their
  // own workflow instead — DeliveryManagement.jsx dispatches between the
  // two based on role, the same shape Order Management already uses.
  { name: 'Delivery Management', icon: '⛟', roles: ['ADMIN', 'CASHIER', 'DELIVERY PERSONNEL'] },
  // Also Phase 7 — a customer's own saved delivery addresses. CUSTOMER
  // only, the same self-service shape as My Profile below.
  { name: 'Address Book', icon: '⌂', roles: ['CUSTOMER'] },
  { name: 'Reporting & Analytics', icon: '⌁', roles: ['ADMIN', 'CASHIER'] },
  { name: 'My Profile', icon: '◉', roles: ['ADMIN', 'CUSTOMER', 'CASHIER', 'DELIVERY PERSONNEL'] },
]
