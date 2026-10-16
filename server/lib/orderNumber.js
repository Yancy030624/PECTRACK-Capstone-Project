// How an order is named to people. The adviser (2026-10-16) brought back
// the order's own permanent id as its number ("#21170"): unique for good,
// so it never needs a date beside it to tell two orders apart. The daily
// number of CLIENT_REVISIONS_PLAN.md R4 (migration 024) is still kept in
// the database, but no longer shown. src/lib/orderNumber.js is the screen
// version.
//
// "#21170" — for messages and the PayMongo description.
export const orderLabel = (orderId) => `#${orderId}`
