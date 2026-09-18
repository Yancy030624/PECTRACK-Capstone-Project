// Display formatting shared by every screen that shows money or a time.
//
// The API returns NUMERIC columns as strings ('12289.50') precisely so no
// JavaScript arithmetic touches them; this only FORMATS for display —
// thousands separators and a fixed two decimals — and never feeds a number
// back to the server. Intl handles the grouping; the peso sign is written
// literally so it renders the same in every locale the browser might be in.
const pesoFormatter = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatPeso(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '₱—'
  return `₱${pesoFormatter.format(number)}`
}

// A timestamp for a human: "Sep 3, 2026, 6:03 PM". Seconds were noise in
// every status history and payment log that showed them.
export function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}
