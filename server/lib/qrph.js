// QR Ph payments (RULES-PLANS/QRPH_PLAN.md). Shared by routes/qrph.js and
// the Dashboard summary in routes/reports.js.

// A reference number left unconfirmed this long is shown to staff as
// overdue (Q8). Nothing is cancelled because of it: only a person decides.
export const qrphOverdueMinutes = 30
