# DEPLOY_PLAN.md — putting PECTRACK online for testing

**Goal (2026-10-13, the team's decision):** test the system online, not
on one laptop. Testers use their own phones, so loading time,
responsiveness, email links and GCash payments are tested the way the
bakery's customers will meet them.

**Already done for this:** confirm-on-return (commit `783c797`). A GCash
payment is confirmed when the payer comes back to the receipt, so
payments work even before PayMongo's webhook is set up.

Use this plan with `PHASES-RULES-PLANNING.md`. Steps marked **(team)**
need someone's own account or decision; the rest is code or
configuration that Claude can do.

---

## Findings (2026-10-14)

**Host checks, from each host's own docs:**

| | Railway | Render (free) |
|---|---|---|
| Sleeps when idle? | No. "Serverless" sleeping is opt-in per service — leave it off. | Yes, after 15 minutes; waking takes about a minute. |
| Outbound SMTP? | **Blocked** on Trial and Hobby ("SMTP is only available on the Pro plan and above"). | **Blocked** on free web services (ports 25, 465, 587). |
| Disk for uploads | Volumes: 0.5 GB on Trial, 5 GB on Hobby. | None on free. |
| Database | Included; check the PostgreSQL version when adding it. | Free database expires after 30 days. |
| Cost | Trial: one-time $5 credit, 30 days. Hobby: $5/month, includes $5 of usage, needs a card. | Free, with the limits above. |

**Choice: Railway**, because it doesn't sleep, which matters for measuring loading time. Start on the Trial; move to Hobby if the $5 runs out
before testing ends.

**Email must change on either host (D5 is now required).** Gmail over
SMTP cannot be used. The decision is in D5 below.

**PayMongo test mode, checked with the team's test key:**
- A full GCash test payment works end to end. PayMongo's simulator
  authorizes it, and the checkout-session lookup used by
  confirm-on-return returns the paid payment's id (`pay_…`).
- **The ₱100 floor is not PayMongo's.** Test-mode GCash payments of ₱1,
  ₱19.99, ₱20 and ₱28 all went through. Our own
  `paymongoMinimumAmountCentavos` (₱100) is what refuses small balances,
  and with no cash on delivery that blocks small delivery orders from
  paying online. **Decision for the team:** lower the floor to ₱1, which
  removes it in practice. Live mode may have its own limit; if so,
  PayMongo refuses the payment and the customer pays at the counter.
- PayMongo's checkout asks the payer for their name and email. **Possible
  improvement:** the system can pass the customer's name, email and
  phone when it creates the checkout, so the customer doesn't type them
  again.
- The checkout page shows the PayMongo account's business name (currently
  the account owner's name). **(team)** Set it to Pecto's Bakery in
  PayMongo's business settings before testers see it.

---

## Decisions

**D1. One web service serves both the website and the API, from the same
address.** Express serves the built React app (`dist/`) as well as
`/api`. Reasons:
- The sign-in cookie is `SameSite=Lax` and `HttpOnly`. With the website
  on one host (for example Vercel) and the API on another, the browser
  would not send the cookie, and every signed-in screen would fail.
- One address means no CORS setup, one HTTPS certificate, and one URL to
  give testers.
- Vercel alone cannot run this server: the API needs a long-running
  Node process, a PostgreSQL database, and a disk for uploads.

**D2. Host: Railway (recommended) or Render. Choose after checking the
points below at sign-up — hosts change these policies, so confirm them
on the host's own pricing and docs pages, not from memory.**

| Check | Why it matters here |
|---|---|
| Does a free or cheap service **sleep** when idle? | The team wants to measure loading time. A sleeping service adds a long cold start (often 30–60 s) to the first visit, which would look like a slow system. If it sleeps, either pay for an always-on plan during testing or open the site a minute before each session. |
| Is **outbound SMTP** (port 587) allowed on the plan? | The admin's sign-in code, email confirmation and password reset are sent through Gmail SMTP. Some hosts block SMTP on free or hobby plans. If blocked, see D5. |
| **PostgreSQL 18** available? | The local database is 18.6. `pg_restore` from an 18 backup needs an 18 server. |
| **Persistent disk / volume** for `uploads/`? | Product photos come from git, so they survive. Proof-of-delivery photos are written to disk at runtime and are lost on each redeploy without a volume. For testing that may be acceptable; for real use it is not. |
| Monthly cost | Railway's Hobby plan is usage-based (about $5/month at this size); Render's free web service sleeps and its free database expires after a set period. Confirm current figures. |

**D3. Data: restore the local database once.** Use the same `pg_dump`
backup as for the teammate's laptop (excluding sessions and one-time
codes). Restore it into the hosted PostgreSQL with `pg_restore`, then
run `npm run sync:images -- --apply`. Before restoring, refresh the demo
data (re-seed, regenerate the assumed demand up to yesterday, run the
forecast), so testers see today's orders.

**D4. Secrets live only in the host's environment settings.** Never in
git, never in the plan. The table in Step 4 lists them.

**D5. Email over HTTPS instead of SMTP — required (see Findings).** One
function in `server/lib/mail.js` sends every email, so only that
function changes. Options, for the team to choose:

1. **Gmail API with the same Gmail account (recommended).**
   - Mail still comes from the bakery's Gmail address, so it lands in
     inboxes as it does now.
   - Free, and no new dependency: two HTTPS calls, to get a token and
     to send.
   - Setup (team, with Claude's steps): a Google Cloud project with the
     Gmail API on, an OAuth client, and a one-time sign-in that gives a
     refresh token, stored as an environment variable.
2. **An email service with a free tier (Brevo, about 300 emails a day).**
   - Quicker to set up.
   - Sending "from" a gmail.com address through a third party can fail
     Gmail's DMARC checks and land in spam. Check the service's current
     rules on free-mail senders first.
3. **Buy a domain** (for example pectosbakery.com) and use an email
   service with that domain.
   - The most professional, and it also gives the site a proper address.
   - It costs money and takes DNS setup.

The test suite keeps printing mail to the console instead of sending it
(`NODE_TEST_CONTEXT`), whichever option is chosen.

**D6. PayMongo stays in test mode for testing.** Test keys (`sk_test_…`)
use PayMongo's GCash simulator: no real money moves. Live keys need
PayMongo's business verification by the bakery and are out of scope
for testing.

---

## Steps

### Step 1 — accounts **(team)**

1. **PayMongo:** sign up at paymongo.com. Test mode works right after
   sign-up. Copy the **test secret key** (`sk_test_…`) from Developers →
   API Keys. Keep it private.
2. **Host:** create the Railway (or Render) account and go through the
   D2 checks. Tell Claude the results, especially SMTP and sleeping.
3. If SMTP is blocked: create the email-service account (D5).

### Step 2 — code changes (Claude)

1. **Serve the website from Express in production** (`server/app.js`):
   - Serve `dist/` with long cache headers for the hashed files in
     `dist/assets/`.
   - Any GET that is not `/api/…` returns `dist/index.html`, so links
     like `/account?tab=payments&order=12` work when opened directly.
   - Register this after the API routes, so a wrong `/api` path still
     gets the JSON 404, not the website.
2. **Database connection from one URL** (`server/config.js`,
   `server/db.js`): accept `DATABASE_URL` (what hosts provide) and keep
   the separate `PG*` variables for local use. Add `ssl` when the host
   requires it (`DATABASE_SSL=true`).
3. **`package.json`:** `"engines": { "node": ">=22" }` so the host uses
   a supported Node version. The build command is `npm ci && npm run build`,
   and the start command is `npm start` (already `node server/index.js`).
4. If D5 applies: the email-service change in `server/lib/mail.js`, with
   the test suite still printing mail to the console instead of sending
   it (`NODE_TEST_CONTEXT`).
5. Tests for 1 and 2:
   - A non-API path returns the website.
   - `/api/unknown` returns the JSON 404.
   - `DATABASE_URL` is parsed.

   Then `npm test` (twice), `npm run build`, `npm run lint`.

### Step 3 — database **(team, with Claude's commands)**

1. Refresh the demo data locally (D3).
2. Back up: `pg_dump … -F c` (same command as for the teammate).
3. Restore into the host's database with `pg_restore --no-owner -d "<DATABASE_URL>"`.
4. Run `npm run sync:images -- --apply` against the hosted database.
   Expected result: "0 products to update".

### Step 4 — environment variables (set in the host's dashboard)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` — turns on the HTTPS redirect, HSTS and secure cookies |
| `CLIENT_ORIGIN` | the public address, e.g. `https://pectrack.up.railway.app` (no trailing slash) — used in email links and the PayMongo return link |
| `DATABASE_URL` | from the host's PostgreSQL |
| `DATABASE_SSL` | `true` if the host requires it |
| `TRUST_PROXY_HOPS` | `1` — the host's proxy, so HTTPS and client IPs are read correctly |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | same as local `.env` (or the email-service key, if D5) |
| `PAYMONGO_SECRET_KEY` | the `sk_test_…` key |
| `PAYMONGO_WEBHOOK_SECRET` | from Step 6 |

`PORT` is set by the host. `PAYMONGO_SUCCESS_URL` and
`PAYMONGO_CANCEL_URL` are no longer used.

### Step 5 — deploy and smoke-test (Claude, with the team's phone)

1. Deploy from GitHub `main`.
2. On a phone, over mobile data (not the laptop's Wi-Fi):
   - Open the home page.
   - Register a test customer and confirm the email (the link must open
     on the phone).
   - Sign in, order for delivery, pay with the GCash simulator.
   - Check the receipt shows **paid** on return (confirm-on-return).
3. As admin: sign in with the email code, confirm the order, assign a
   driver. As driver on a phone: start the delivery, upload a photo,
   mark it delivered.
4. Check the response headers: HTTP redirects to HTTPS, and
   `Strict-Transport-Security` is present.
5. **Check the online-payment minimum.** The system refuses GCash below
   ₱100 (`paymongoMinimumAmountCentavos`, set during Phase 6.5).
   PayMongo's current docs do not state a minimum. Try a ₱28 order in
   test mode:
   - **If PayMongo accepts it:** lower or remove the floor.
   - **If PayMongo refuses it:** the team decides how small delivery
     orders are paid. Options: a ₱100 minimum for delivery orders, or
     pay at the counter.

   This matters because there is no cash on delivery.

### Step 6 — PayMongo webhook **(team, then Claude verifies)**

In PayMongo → Developers → Webhooks, add an endpoint:
- URL: `https://<public address>/api/payments/webhook`
- Events: `payment.paid` and `payment.failed`

Copy its secret (`whsk_…`) into `PAYMONGO_WEBHOOK_SECRET` and redeploy.
Payments then confirm even if the payer never returns to the site.
Confirm-on-return remains the backup.

### Step 7 — measuring for the test **(team)**

- **Loading:** for each test session, note the first-visit and repeat-
  visit load times on a phone (Chrome → Lighthouse, or simply a
  stopwatch from tap to usable). Separate any cold start (D2) from
  normal loading.
- **Responsiveness:** go through every customer screen and the driver's
  screens on a phone. Note anything cut off, too small to tap, or
  needing sideways scrolling.

---

## Not in this plan

- Live PayMongo (real money) — needs the bakery's business verification.
- A custom domain (e.g. `pectosbakery.ph`) — optional, any time later.
- Backups of the hosted database — use the host's own backup setting if
  the system will hold real data after testing.
