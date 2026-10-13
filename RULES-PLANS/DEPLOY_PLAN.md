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

## Decided (2026-10-14)

- **Host:** Railway.
- **Email:** Gmail API (D5, option 1).
- **Online floor:** PHP 1.
- **PayMongo's payer form:** filled in from the customer.

Step 2 is built (commit `b066ecf`).

## Steps

### Step 1 — accounts **(team)** ✔ PayMongo and Railway done

Still to do: in PayMongo's business settings, set the business name the
checkout page shows to **Pecto's Bakery**.

### Step 2 — code changes ✔ done (commit `b066ecf`)

- Express serves the built website and `/api` from one address.
- Unknown `/api` paths get a JSON 404.
- `DATABASE_URL` / `DATABASE_SSL` for the hosted database.
- Gmail API email, set up with `npm run gmail:auth`.
- PHP 1 online floor.
- PayMongo's payer form is filled in from the customer on the order.
- `engines: node >= 22`.
- Tests: 449 pass.

### Step 3 — Gmail API setup **(team, about 15 minutes, on the laptop)**

Use the Gmail account that sends PECTRACK's emails today (`SMTP_USER` in
`.env`).

1. Go to **console.cloud.google.com**, signed in as that Gmail account.
   Create a project named **PECTRACK**.
2. **APIs & Services → Library → Gmail API → Enable.**
3. **OAuth consent screen** (also called **Google Auth Platform**):
   - User type **External**; app name **PECTRACK**; your email as support
     and developer contact.
   - Scopes: you can skip adding them here; the script asks for
     `gmail.send` itself.
   - **Publish the app** (Audience → **Publish app**, status **In
     production**). Do not leave it in "Testing": a Testing app's sign-in
     expires after 7 days, and the emails would stop.
4. **Credentials (Clients) → Create client → Application type: Desktop
   app**, name **PECTRACK mail**. Copy the **Client ID** and **Client
   secret** into `.env`:
   ```
   GMAIL_CLIENT_ID=...apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=...
   ```
5. In the project folder, run `npm run gmail:auth`. Open the link it
   prints and sign in with the same Gmail account.
   - Google warns **"Google hasn't verified this app"**. This is expected
     for your own unpublished-to-the-public app: choose **Advanced → Go
     to PECTRACK (unsafe)**, then allow **Send email on your behalf**.
6. The terminal prints `GMAIL_REFRESH_TOKEN=…`. Paste that line into
   `.env`. **Treat it like a password: it lets anyone who has it send
   mail as that Gmail account.**
7. Make sure `MAIL_FROM` in `.env` uses that same Gmail address. The
   Gmail API sends as the signed-in account.
8. Restart `npm run server`, then sign in as the admin. The sign-in code
   now arrives through the Gmail API. Tell Claude if it does not arrive.

### Step 4 — Railway **(team clicks; Claude can guide on a call)**

1. **New project → Database → PostgreSQL.**
   - Open the database's **Variables** tab. It has `DATABASE_URL`
     (internal) and `DATABASE_PUBLIC_URL` (reachable from the laptop).
   - Check the PostgreSQL version (first lines of its **Deploy logs**, or
     ask Claude to run `SELECT version()` through the public URL). The
     local database is 18.6: if Railway's is older, the restore in
     Step 5 uses the plain-SQL fallback.
2. In the same project, **+ New → GitHub Repository →
   `PECTRACK-Capstone-Project`**, branch `main`.
3. In that service's **Settings**:
   - **Build command:** `npm ci && npm run build`
   - **Start command:** `npm start`
   - **Networking → Generate Domain.** This is the public address, e.g.
     `https://pectrack-production.up.railway.app`.
   - Leave **Serverless** (app sleeping) **off**.
4. In the service's **Variables** tab, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` — turns on the HTTPS redirect, HSTS and secure cookies |
| `CLIENT_ORIGIN` | the public address from 3, no trailing slash |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway's reference to the database's internal URL) |
| `TRUST_PROXY_HOPS` | `1` |
| `MAIL_FROM` | same as `.env` |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | same as `.env` (Step 3) |
| `PAYMONGO_SECRET_KEY` | the `sk_test_…` key |
| `PAYMONGO_WEBHOOK_SECRET` | later, from Step 7 |

   Notes on the variables:
   - Leave `SMTP_*` out: Railway blocks SMTP, and the Gmail API settings
     take over.
   - `DATABASE_SSL` is not needed on Railway's internal network.
   - `PORT` is set by Railway.
   - `PAYMONGO_SUCCESS_URL` and `PAYMONGO_CANCEL_URL` are no longer used.

5. **No volume yet.** Product photos come with the code. Proof-of-delivery
   photos taken during testing are lost on each redeploy, which is
   acceptable for testing. For real use, a volume and a separate uploads
   folder for proofs come later.

### Step 5 — database **(Claude runs the commands, team watches)**

1. Refresh the demo data locally (D3): clear and re-seed, regenerate the
   assumed demand up to yesterday, and run the forecast.
2. Back up locally, leaving out sessions and one-time codes:
   ```
   pg_dump -U postgres -d pectrack -F c -f pectrack.backup --exclude-table-data=sessions --exclude-table-data=otp_codes --exclude-table-data=password_reset_tokens --exclude-table-data=email_verification_tokens
   ```
3. Restore into Railway, using the database's **public** URL:
   ```
   pg_restore --no-owner --no-privileges -d "<DATABASE_PUBLIC_URL>" pectrack.backup
   ```
   If Railway's PostgreSQL is older than 18, use a plain-SQL dump instead
   (`pg_dump … -F p -f pectrack.sql`, then `psql "<DATABASE_PUBLIC_URL>" -f pectrack.sql`).
4. Delete the local `pectrack.backup` file afterwards; it holds customer
   data and password hashes.

### Step 6 — deploy and smoke-test (Claude, with the team's phone)

1. Redeploy (Railway → **Deploy**), and watch the build log for errors.
2. On a phone, over mobile data (not the laptop's Wi-Fi):
   - Open the home page.
   - Register a test customer and confirm the email (the link must open
     on the phone).
   - Sign in, order for delivery, pay with the GCash simulator.
   - Check the receipt shows **paid** on return (confirm-on-return).
3. As admin: sign in with the email code, confirm the order, assign a
   driver. As driver on a phone: start the delivery, upload a photo,
   mark it delivered.
4. Check that `http://` redirects to `https://` and that
   `Strict-Transport-Security` is present.

### Step 7 — PayMongo webhook **(team, then Claude verifies)**

In PayMongo → Developers → **Webhooks**, add an endpoint:
- URL: `https://<public address>/api/payments/webhook`
- Events: `payment.paid` and `payment.failed`

Copy its secret (`whsk_…`) into Railway's `PAYMONGO_WEBHOOK_SECRET`.
Payments then confirm even if the payer never returns to the site;
confirm-on-return remains the backup.

### Step 8 — measuring for the test **(team)**

- **Loading:** for each test session, note the first-visit and
  repeat-visit load times on a phone (Chrome → Lighthouse, or simply a
  stopwatch from tap to usable).
- **Responsiveness:** go through every customer screen and the driver's
  screens on a phone. Note anything cut off, too small to tap, or needing
  sideways scrolling.

---

## Not in this plan

- Live PayMongo (real money) — needs the bakery's business verification.
- A custom domain (e.g. `pectosbakery.ph`) — optional, any time later.
- Backups of the hosted database — use the host's own backup setting if
  the system will hold real data after testing.
