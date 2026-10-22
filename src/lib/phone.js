// A contact number as it is typed: digits only, at most 11 — a Philippine
// mobile number, 09XXXXXXXXX (the adviser, 2026-10-23). Letters, spaces
// and symbols never reach the field, so a typo cannot fail validation later.
export const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 11)
