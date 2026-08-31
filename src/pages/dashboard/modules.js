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
  { name: 'Reporting & Analytics', icon: '⌁', roles: ['ADMIN', 'CASHIER'] },
  { name: 'My Profile', icon: '◉', roles: ['ADMIN', 'CUSTOMER', 'CASHIER', 'DELIVERY PERSONNEL'] },
]
