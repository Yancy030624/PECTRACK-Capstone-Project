// Define the available modules and the roles that can open each one.
//
// STAFF ONLY, as of 2026-09-21. A customer no longer passes through this
// shell at all: /dashboard sends them to /account, where
// customer-account/CustomerAccount.jsx gives them the same three screens
// (My Profile, My Orders, My Payments — in that order) in the
// storefront's own design instead of the staff console's. The CUSTOMER
// entries that used to live here were removed with that change; the
// components themselves are shared and still dispatch on role, so
// nothing was duplicated.
//
// 'Inventory Management' used to be the nav label for the CATALOG screen
// (categories + products — see InventoryManagement.jsx's own file header),
// which was a misnomer once Phase 5 introduced actual stock management.
// Relabelled to 'Product Management' to match what that screen has always
// done, freeing the name for the real inventory (stock level) screen below.
// A customer's dashboard nav intentionally looks different from staff's —
// see the comment above the CUSTOMER-only entries below for why.
//
// ORDER = IMPORTANCE. The sidebar lists modules in this order, so the
// list runs from what the bakery needs every few minutes to what it
// needs now and then:
//   1. Dashboard            — what needs attention right now
//   2. Order Management     — taking and moving orders, all day
//   3. Production           — what has to be ready, by when
//   4. Inventory Management — is there stock to sell
//   5. Payment & Billing    — getting paid
//   6. Delivery Management  — getting orders out the door
//   7. Product Management   — the catalogue; changes now and then
//   8. Customer Management  — looking a customer up
//   9. Reporting & Analytics — looking back, planning ahead
//  10. Staff Management     — accounts; rarely touched
//  11. My Profile           — your own account
// Each role sees only its own entries, in this same relative order.
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
  { name: 'Dashboard', icon: 'dashboard', roles: ['ADMIN', 'CASHIER'] },
  // Staff manage every order; a customer only ever needs their own — two
  // different screens with two different names, not one screen wearing
  // two labels. Both map to the SAME component (OrderManagement.jsx,
  // Dashboard.jsx's moduleComponents), which dispatches on role
  // internally — the exact shape Delivery Management already established
  // for ADMIN/CASHIER vs DELIVERY PERSONNEL below.
  { name: 'Order Management', icon: 'orders', roles: ['ADMIN', 'CASHIER'] },
  // Production is the Due today schedule: open orders by the hour they
  // are due. Ingredients, recipes and production batches were removed as
  // out of the paper's scope (migration 022) — the system inventories
  // finished products only.
  { name: 'Production', icon: 'production', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Inventory Management', icon: 'inventory', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Payment & Billing', icon: 'payments', roles: ['ADMIN', 'CASHIER'] },
  // Phase 7 (see PHASE7_PLAN.md) — one nav entry shared by three roles.
  // ADMIN/CASHIER get the assignment queue; DELIVERY PERSONNEL get their
  // own workflow instead — DeliveryManagement.jsx dispatches between the
  // two based on role, the same shape Order Management now also uses.
  { name: 'Delivery Management', icon: 'deliveries', roles: ['ADMIN', 'CASHIER'] },
  // The driver's screen has always titled itself "My Deliveries"; the nav
  // said "Delivery Management". One name, the driver's own.
  { name: 'My Deliveries', icon: 'deliveries', roles: ['DELIVERY PERSONNEL'] },
  // ADMIN only — every write in products.js is already admin-gated, so a
  // cashier opening this screen previously saw a catalogue where every
  // button failed. They already see products (with prices) inside the
  // order screen and stock levels in Inventory Management, so the screen
  // was redundant for them, not merely restricted. See
  // UI_REVISIONS_PLAN.md Decision 13.
  { name: 'Product Management', icon: 'products', roles: ['ADMIN'] },
  // Read-only for CASHIER (CustomerManagement.jsx hides Edit/Deactivate
  // for anyone but ADMIN, and customers.js:53's PATCH route backs that up
  // server-side) — a cashier still needs to look a customer up to attach
  // one to a delivery order, but only ADMIN may change a customer's
  // record. See UI_REVISIONS_PLAN.md Decision 12.
  { name: 'Customer Management', icon: 'customers', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Reporting & Analytics', icon: 'reports', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Staff Management', icon: 'staff', roles: ['ADMIN'] },
  { name: 'My Profile', icon: 'profile', roles: ['ADMIN', 'CASHIER', 'DELIVERY PERSONNEL'] },
]
