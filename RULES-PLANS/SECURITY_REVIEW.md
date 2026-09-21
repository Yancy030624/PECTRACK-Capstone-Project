# SECURITY_REVIEW.md — audit, findings, and hardening plan

Audit of the PECTRACK API and client at commit `64273f0` (2026-09-21),
combining a first-pass review with a second structured pass over
eighteen areas. Everything below was verified by reading the
implementation, not by trusting the documentation.

**Headline:** the application layer — authentication, authorization, and
injection — is correct and was clearly built deliberately. The gaps are
at the infrastructure edge. The single biggest risk to the paper is not
a vulnerability: it is that **three documented controls are not running**.

---

## Part 0 — Thesis claims vs. actual implementation

Correct these in the paper. A panelist who tests a documented control
that does not run is the worst outcome available.

| Thesis claim | Reality |
|---|---|
| "RBAC for Admin, Cashier, and Customer" | Four roles exist — ADMIN, CASHIER, CUSTOMER, **DELIVERY PERSONNEL**. The thesis undercounts. |
| "Admin Two-Factor Authentication using **email** OTP" | The OTP login branch was **switched off** (`routes/auth.js`, the comment above `createSession` in `/login`). `createOtpCode()` had no callers. The dormant code also targeted **SMS**, not email. *(Being fixed — see Part 3, item 5.)* |
| "HTTPS/TLS in production, HTTP-to-HTTPS redirection" | **Not implemented in this codebase.** The only related code is the `secure` cookie flag keyed off `NODE_ENV`. TLS termination belongs to the deployment platform. |
| "Activity/audit logs" | Partial. `order_status_history`, `inventory_movements`, `ingredient_movements` and `report_logs` exist. **No authentication events were logged at all.** *(Being fixed — see Part 3, item 6.)* |
| "bcrypt password hashing" | Accurate — cost 12. Describe it as *adaptive password hashing with a per-password salt*, never as "encryption". |
| "Parameterized SQL" | Accurate, everywhere. |
| "No storage of raw card credentials" | Accurate. |
| "Temporary account lockout" | Accurate, and correctly designed (see Part 1, H). |

**Controls implemented but NOT claimed.** These are stronger than some of
what the paper does claim, and belong in it:

- Enumeration-safe login timing (bcrypt runs against a throwaway hash for
  unknown users, so a real and a fake account answer in the same ~250 ms).
- Password-reset tokens stored **hashed**, single-use, time-limited.
- Immediate session revocation — `is_active` is re-checked on every
  request, so deactivating an account ends its live sessions at once.
- Webhook authentication by HMAC-SHA256 with `crypto.timingSafeEqual`.
- Object-level ownership checks on every customer-facing record.
- Server-generated UUID storage keys, so no client filename ever reaches
  a filesystem path.
- Unauthorized access answers **404, not 403**, so the existence of
  another customer's record is not disclosed.

---

## Part 1 — Area-by-area findings

### A. Authentication — IMPLEMENTED AND ADEQUATE

Enforced server-side. The React route guards in `src/App.jsx` are
convenience only; deleting the whole front end would not grant access to
anything. Registration hard-codes `CUSTOMER`. Logout deletes the session
row. Sessions are re-issued at every login, so fixation is impossible.
Expiry is a fixed 7 days with hourly pruning.

*Gap (Low):* no inactivity timeout, only the absolute expiry.

### B. RBAC / Authorization — IMPLEMENTED AND ADEQUATE

**No IDOR found.** Every customer-facing object is scoped by a lookup
from `request.user.id`, never from a client-supplied id:
`orders.js:101-106` and `:130-131`, `addresses.js:284-287`,
`payments.js:265, 553, 703`, `deliveries.js:449-451, 469-471`.

Privilege escalation is blocked at three points: `PATCH /api/auth/me`
reads `user_type` from the database rather than the body; `PATCH
/api/staff/:id` carries `WHERE u.user_type IN ('CASHIER',
'DELIVERY_PERSONNEL')` in its SQL, so an admin row cannot be edited
through the API at all; and `POST /api/staff` maps the role through a
hard-coded lookup in which `ADMIN` is not a value.

`requireRole` tests `request.user?.role`, so an `optionalAuth` route
cannot leak a write to an anonymous caller.

### C. Admin 2FA — NOT IMPLEMENTED (dormant code, well built)

The dormant implementation was sound: `crypto.randomInt` (not
`Math.random`), 6 digits, 5-minute expiry, **SHA-256 hashed at rest**,
5-attempt cap, single-use via `consumed_at`, and bound to a
`challengeToken` so an intercepted code alone is not a login. No code
value reaches any log.

*Gaps to close when re-enabling:* issuing a new code did not invalidate
the previous one, and nothing rate-limited OTP requests.

### D. Password Security — IMPLEMENTED AND ADEQUATE

bcrypt cost 12. Policy: ≥12 characters, four character classes, 72-byte
cap, common-password blocklist, and rejection of any password containing
the username or email name. No password is returned, logged, or stored
in plaintext. Reset deletes every session for that user.

### E. Input Validation — IMPLEMENTED AND ADEQUATE

Server-side in `lib/validation.js`, independent of React. Types,
lengths, enums, emails, contact numbers, dates, quantities. Money and
quantities are NUMERIC strings, never JS floats. Bodies are capped
(10 kb JSON, 5 MB upload) and an oversized body answers 413.

### F. SQL Injection — IMPLEMENTED AND ADEQUATE

Every `${...}` inside a query string across `server/` was inspected.
Each is a module-level constant fragment or part of an error message.
**No request input is ever concatenated into SQL.** Sorting is not
user-controlled; search uses `ILIKE $1` with a bound `%term%`.

### G. Session Security — IMPLEMENTED AND ADEQUATE

**This is session-based authentication, not token-based.** An opaque
256-bit random identifier in an `httpOnly` cookie, with all state in a
server-side `sessions` table. Not JWT: there is no signed claims
payload, and revocation is a row delete rather than a blocklist.

`httpOnly` means XSS cannot steal the session. No auth credential is in
`localStorage` or `sessionStorage` — the only `localStorage` use is the
shopping cart, which holds product ids and quantities.

### H. Brute-Force / Rate Limiting — PARTIALLY IMPLEMENTED

Account lockout exists **and cannot be weaponised**: while an account is
locked, `WHERE user_id = $1 AND (locked_until IS NULL OR locked_until <=
CURRENT_TIMESTAMP)` matches no rows, so further wrong guesses can neither
extend the lockout nor re-lock the account. It is temporary, not
permanent. Keep this pattern.

*Gap (High):* no rate limiting anywhere. Unlimited password-reset emails
(an attack on the **customer**, not the server), unlimited registration,
and password spraying across many usernames — lockout is per account.

### I. Error Handling — IMPLEMENTED AND ADEQUATE

`app.js` logs server-side and returns one of three generic messages. No
stack trace, SQL, file path, or PostgreSQL error text ever reaches a
response. Postgres error codes are caught by number and translated.

### J. Security Logging — PARTIALLY IMPLEMENTED

Business events are well covered (order status history, both stock
ledgers, report generation). **No authentication events were recorded.**
No log contains a password, OTP, token, or card detail.

### K. HTTPS / TLS — NOT IMPLEMENTED

No redirect, no HSTS, no `trust proxy`. The `secure` cookie flag makes
the browser withhold the cookie over plain HTTP; it does not create TLS.

*`trust proxy` has a concrete consequence:* behind a reverse proxy,
`request.ip` is the proxy's address, so a rate limiter would throttle
every user as one.

Honest phrasing for the paper: *"TLS termination is delegated to the
deployment platform; the application enforces secure-cookie
transmission, HSTS, and HTTP-to-HTTPS redirection when
`NODE_ENV=production`."*

### L. PayMongo — IMPLEMENTED AND ADEQUATE

Secret keys are env-only and `undefined` when unset. **No `VITE_`
variable exists**, so nothing can leak into the client bundle. Card data
never reaches this server.

**Payment status is never trusted from the client** — the checkout route
inserts `PENDING`; only the signature-verified webhook moves a row to
`PAID` or `FAILED`.

Wording for the paper: *"Card data is handled entirely by PayMongo, a
PCI-DSS compliant provider; PECTRACK never receives, transmits, or
stores cardholder data. PECTRACK is therefore out of scope for
cardholder-data requirements but remains responsible for securing its
own payment records, API credentials, and webhook verification."* Do
**not** write that PECTRACK is PCI-DSS compliant.

### M. CORS — IMPLEMENTED AND ADEQUATE

A single explicit origin from `CLIENT_ORIGIN`, `credentials: true`, no
wildcard. Set that variable in the deployment environment or the API
will refuse the real front end.

### N. Security Headers — NOT IMPLEMENTED

Three consequences that are real for this app:

1. **Clickjacking.** Any site can iframe the dashboard and overlay
   invisible buttons — a cashier tricked into clicking Approve on a
   production batch, or Delete on a product.
2. **MIME sniffing on user uploads.** `/api/products/:id/image` and the
   proof-of-delivery download serve bytes an ordinary user uploaded.
   Without `nosniff`, a crafted polyglot can be sniffed as HTML and
   executed **on this origin** — stored XSS with access to the session
   cookie.
3. **Referrer leakage.** The password-reset link carries its token in the
   URL; the default referrer policy can leak it to a third-party host.

### O. CSRF — NOT APPLICABLE, and deliberately so

Credentials travel in a cookie, which the browser attaches
automatically, so CSRF is the relevant class of attack. **`sameSite:
'lax'` closes it**: the browser does not attach the cookie to a
cross-site POST/PATCH/DELETE. The remaining exposure would be a
state-changing GET, and there are none — every mutation is
POST/PATCH/PUT/DELETE. The one cookie-less endpoint, the PayMongo
webhook, is authenticated by HMAC instead.

A CSRF token layer would add ceremony without closing a gap. Document
the `SameSite` reasoning instead; it is a stronger answer than a token
nobody can explain.

### P. Environment Secrets — IMPLEMENTED AND ADEQUATE

`.env` and `uploads/` are gitignored and `git ls-files` confirms no
`.env` was ever committed. No `VITE_`-prefixed variable exists, so
nothing leaks into the client bundle. Unset secrets are `undefined`,
never a placeholder that could be mistaken for a working credential.

*One item before deployment:* `scripts/create-test-accounts.mjs` carries
a fixed admin password in source. Fine for a demo machine, and commented
as such — change it before the app is reachable from the internet.

### Q. Dependency Security — NEEDS HARDENING

One moderate advisory: `qs` (array-limit bypass; DoS via
attacker-controlled `isBuffer`), transitive through Express's query
parser. `npm audit fix` resolves it without a breaking change. No other
advisories; 12 runtime packages, nothing unnecessary.

### R. Data Privacy — IMPLEMENTED AND ADEQUATE

Covered by B.

---

## Part 2 — Deliberately not done

- **No CSRF token layer** — see O. The `SameSite` attribute already
  closes it for every state-changing method in this API.
- **No password-policy changes** — the existing policy already exceeds
  what most student projects carry.
- **No penetration testing or exploit tooling** — this is a code review
  and a hardening pass on a system the team owns.
- **No TLS implementation** — that belongs to whatever hosts the app.
  The application's part (secure cookies, HSTS, redirect) is in scope
  and is being added.

---

## Part 3 — Implementation order

### Must fix — before demo or deployment

1. **Reconcile the thesis with the code** (Part 0). Writing only.
2. **Security headers** — closes clickjacking, stored-XSS-via-upload,
   and reset-token leakage in one middleware.
3. **Rate limiting** plus `trust proxy` — stops reset-email flooding
   aimed at customers, and password spraying.
4. **`npm audit fix`** — clears the one advisory.

### Should fix — real hardening

5. **Re-enable OTP as email 2FA.** `lib/mail.js` already works. Add:
   invalidate the previous unconsumed code when issuing a new one, and
   rate-limit requests.
6. **`security_events` audit table** — login, failed login, logout,
   password change, role change. Answers "how would you know if someone
   got in?"
7. **Move the reset token out of the URL query**, or shorten its
   lifetime, so the Referer-leak class is removed rather than mitigated.

### Status

Items 1-7 are implemented as of 2026-09-21 (commits `6d7b0c2`,
`182c7e1`, `a87a2b5` and the reset-token change). Items 8-10 below are
open, and are recorded as limitations rather than defects.

### Optional — scope-dependent

8. Inactivity timeout alongside the 7-day absolute expiry.
9. Cap the `uploads/` directory size.
10. A Content-Security-Policy beyond `frame-ancestors` (the app loads no
    third-party scripts, so the marginal gain is small).
