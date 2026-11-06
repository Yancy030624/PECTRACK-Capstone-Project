// What a field accepts as it is typed, so a wrong character never reaches it.
// The server still checks every value (server/lib/validation.js): a request
// can be sent without using these forms.

// A person's name: letters, spaces, periods, apostrophes and hyphens, the
// same characters the server's name rules allow.
export const nameOnly = (value) => String(value ?? '').replace(/[^\p{L}\s.'-]/gu, '')

// Digits only, at most maxLength of them: quantities, codes and references.
export const wholeNumber = (value, maxLength) => String(value ?? '').replace(/\D/g, '').slice(0, maxLength)

// A positive decimal: digits and one point, with at most `places` digits
// after it. 12.5 stays 12.5; 1.2.3 cannot be typed.
export function decimalNumber(value, places = 2, maxLength = 12) {
  const text = String(value ?? '').replace(/[^\d.]/g, '')
  const point = text.indexOf('.')
  if (point === -1) return text.slice(0, maxLength)
  const whole = text.slice(0, point)
  const fraction = text.slice(point + 1).replace(/\./g, '').slice(0, places)
  return `${whole}.${fraction}`.slice(0, maxLength)
}
