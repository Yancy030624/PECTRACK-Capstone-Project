// ============================================================================
// PECTRACK API — lib/mail.js (annotated for learning)
// Outgoing email. One caller today: the password-reset link in
// routes/auth.js /forgot-password.
//
// Why a module at all for one function: the transport (nodemailer over
// SMTP) is configured from SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in
// server/config.js, and "not configured" is a supported state, not an
// error. With no SMTP_HOST the message is printed to the server console
// (outside production) — the same way the admin OTP code used to be
// readable there before an SMS gateway existed. That keeps the reset flow
// testable on a developer machine, and it is what auth.test.js reads the
// token back from.
//
// The route never learns whether the email really went anywhere. That is
// deliberate: /forgot-password must answer identically for an address that
// exists and one that does not, or the response becomes a way to test
// which emails have accounts.
// ============================================================================
// The live implementation is server/lib/mail.js — 40 lines, commented in
// place.
