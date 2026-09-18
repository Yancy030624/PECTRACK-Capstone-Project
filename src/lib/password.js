// The live hint under a password field. Mirrors the server's own
// validatePasswordField (server/lib/validation.js) closely enough to
// guide typing — the server remains the authority. One copy, used by
// registration and the reset page.
export const strongPasswordHint = 'Strong password format.'

export function passwordHint(password) {
  if (password.length < 12) return 'Use at least 12 characters.'
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return 'Add uppercase, lowercase, number, and symbol.'
  return strongPasswordHint
}
