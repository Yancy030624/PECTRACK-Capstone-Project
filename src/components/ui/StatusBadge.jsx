// One badge, one map. UI_AUDIT.md's H7 found six copy-pasted
// `statusStyles` objects (OrderManagement, PaymentLog, PaymentBilling,
// DeliveryManagement, MyDeliveries, InventoryRequests) and the badge
// markup itself — `rounded-full px-2.5 py-1 text-[10px] font-bold ...` —
// pasted at 8 call sites. Concretely, MyDeliveries' own copy only listed
// 2 of the 5 real delivery statuses, so DELIVERED/FAILED silently fell
// back to grey there while showing correctly everywhere else — a bug
// that a single shared map makes structurally impossible, instead of
// something to notice and fix six times.
//
// The colour semantics are NOT new — every one of the six existing maps
// already agreed on them (amber=waiting, blue=acknowledged, teal=in
// transit, green=done, red=failed), this file just gives them one home.
// Statuses are grouped into that semantic token, not styled individually,
// so adding a new status is a one-line addition to STATUS_TOKEN rather
// than a new colour decision.
const STATUS_TOKEN = {
  // wait — needs someone to act
  PLACED: 'wait',
  PENDING: 'wait',
  PENDING_ASSIGNMENT: 'wait',
  // active — acknowledged, in hand
  CONFIRMED: 'active',
  ASSIGNED: 'active',
  IN_PRODUCTION: 'active',
  // transit — moving to the customer
  READY_FOR_PICKUP: 'transit',
  OUT_FOR_DELIVERY: 'transit',
  // done — finished, money in
  COMPLETED: 'done',
  PAID: 'done',
  DELIVERED: 'done',
  APPROVED: 'done',
  // ACTIVE is not an order/delivery workflow status — it's
  // CustomerManagement's isActive flag reusing the "done" (green) token,
  // which is exactly the colour that screen already used for it.
  ACTIVE: 'done',
  // fail — failed or reversed
  CANCELLED: 'fail',
  FAILED: 'fail',
  REFUNDED: 'fail',
  REJECTED: 'fail',
  INACTIVE: 'fail',
}

const TOKEN_CLASSES = {
  wait: 'bg-status-wait-bg text-status-wait-fg',
  active: 'bg-status-active-bg text-status-active-fg',
  transit: 'bg-status-transit-bg text-status-transit-fg',
  done: 'bg-status-done-bg text-status-done-fg',
  fail: 'bg-status-fail-bg text-status-fail-fg',
  idle: 'bg-status-idle-bg text-status-idle-fg',
}

// `?? idle` mirrors the `?? 'bg-slate-100'` fallback every existing map
// already had (UI_AUDIT.md calls this out as "disciplined defensive
// rendering" worth keeping) — an unknown status degrades to a neutral
// pill instead of rendering unstyled.
export function StatusBadge({ status, label }) {
  const token = STATUS_TOKEN[status] ?? 'idle'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TOKEN_CLASSES[token]}`}>
      {label ?? status?.replaceAll('_', ' ')}
    </span>
  )
}
