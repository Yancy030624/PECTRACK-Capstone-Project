// Define the available modules and the roles that can open each one.
//
// 'Inventory Management' used to be the nav label for the CATALOG screen
// (categories + products — see InventoryManagement.jsx's own file header),
// which was a misnomer once Phase 5 introduced actual stock management.
// Relabelled to 'Product Management' to match what that screen has always
// done, freeing the name for the real inventory (stock level) screen below.
// A customer's dashboard nav intentionally looks different from staff's —
// see the comment above the CUSTOMER-only entries below for why.
export const modules = [
  // ADMIN/CASHIER only. A customer's own landing screen is 'My Orders'
  // (Dashboard.jsx defaults them there directly) — the generic admin-style
  // "Dashboard" overview never had real content for a customer role to
  // begin with (see DashboardHome.jsx's own history), and the storefront
  // itself is already a customer's real landing page, reachable from
  // anywhere via the header — a second, INTERNAL landing page one level
  // deeper was a redundant stop, not a second front door.
  //
  // DELIVERY PERSONNEL was removed for the same reason (CHECKOUT_PLAN.md
  // follow-on work) — their 'Dashboard' only ever showed a fabricated
  // "8 deliveries today" (DashboardHome.jsx's old roleMetrics), since the
  // real numbers live in Reporting & Analytics, which that role can't
  // reach. Delivery Management is a driver's actual work queue and is now
  // where they land instead (Dashboard.jsx's defaultModuleFor) — the same
  // "send them to real content, not a placeholder" call already made for
  // customers.
  { name: 'Dashboard', icon: '▦', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Staff Management', icon: '☺', roles: ['ADMIN'] },
  // Staff manage every order; a customer only ever needs their own — two
  // different screens with two different names, not one screen wearing
  // two labels. Both map to the SAME component (OrderManagement.jsx,
  // Dashboard.jsx's moduleComponents), which dispatches on role
  // internally — the exact shape Delivery Management already established
  // for ADMIN/CASHIER vs DELIVERY PERSONNEL below.
  { name: 'Order Management', icon: '□', roles: ['ADMIN', 'CASHIER'] },
  { name: 'My Orders', icon: '□', roles: ['CUSTOMER'] },
  // Read-only for CASHIER (CustomerManagement.jsx hides Edit/Deactivate
  // for anyone but ADMIN, and customers.js:53's PATCH route backs that up
  // server-side) — a cashier still needs to look a customer up to attach
  // one to a delivery order, but only ADMIN may change a customer's
  // record. See UI_REVISIONS_PLAN.md Decision 12.
  { name: 'Customer Management', icon: '♙', roles: ['ADMIN', 'CASHIER'] },
  // ADMIN only — every write in products.js is already admin-gated, so a
  // cashier opening this screen previously saw a catalogue where every
  // button failed. They already see products (with prices) inside the
  // order screen and stock levels in Inventory Management, so the screen
  // was redundant for them, not merely restricted. See
  // UI_REVISIONS_PLAN.md Decision 13.
  { name: 'Product Management', icon: '▤', roles: ['ADMIN'] },
  { name: 'Inventory Management', icon: '⛁', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Payment & Billing', icon: '◫', roles: ['ADMIN', 'CUSTOMER', 'CASHIER'] },
  // Phase 7 (see PHASE7_PLAN.md) — one nav entry shared by three roles.
  // ADMIN/CASHIER get the assignment queue; DELIVERY PERSONNEL get their
  // own workflow instead — DeliveryManagement.jsx dispatches between the
  // two based on role, the same shape Order Management now also uses.
  { name: 'Delivery Management', icon: '⛟', roles: ['ADMIN', 'CASHIER', 'DELIVERY PERSONNEL'] },
  { name: 'Reporting & Analytics', icon: '⌁', roles: ['ADMIN', 'CASHIER'] },
  { name: 'My Profile', icon: '◉', roles: ['ADMIN', 'CUSTOMER', 'CASHIER', 'DELIVERY PERSONNEL'] },
  // No separate 'Address Book' entry any more — a customer's saved
  // delivery addresses moved INTO My Profile as a tab (MyProfile.jsx),
  // alongside their profile details and password. One place for
  // "everything about my account" instead of two.
]
