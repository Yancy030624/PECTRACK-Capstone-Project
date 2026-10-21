// Single source of truth for environment configuration. Every other server
// file reads settings from here instead of touching process.env directly,
// so there's one place to check (and one place to add a default) when a new
// setting is needed.
import 'dotenv/config'

// CLIENT_ORIGIN goes into a response header (CORS) and into every email
// link and PayMongo return link, so it has to be exactly a bare origin.
// A value pasted into a host's dashboard can carry an invisible character
// (a line break, a zero-width space) — on Railway that made Node refuse the
// header on EVERY request, the health check included, and the deploy
// failed. Anything outside printable ASCII is dropped, then the value is
// reduced to scheme://host[:port]; a value that is still not a URL stops
// the server with a clear message instead of failing request by request.
export function normalizeOrigin(raw) {
  const cleaned = String(raw).replace(/[^\x21-\x7e]/g, '')
  let url
  try {
    url = new URL(cleaned)
  } catch {
    throw new Error(`CLIENT_ORIGIN is not a valid address: "${cleaned}". Use the site's address, e.g. https://pectrack.up.railway.app`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`CLIENT_ORIGIN must start with https:// or http:// (got "${cleaned}").`)
  return url.origin
}

function smsSettings() {
  const textbee = process.env.TEXTBEE_API_KEY && process.env.TEXTBEE_DEVICE_ID
    ? { apiKey: process.env.TEXTBEE_API_KEY, deviceId: process.env.TEXTBEE_DEVICE_ID }
    : null
  const semaphore = process.env.SEMAPHORE_API_KEY ? { apiKey: process.env.SEMAPHORE_API_KEY, senderName: process.env.SEMAPHORE_SENDER_NAME } : null
  const provider = textbee ? 'textbee' : semaphore ? 'semaphore' : null
  return {
    provider,
    textbee,
    semaphore,
    verifyPhones: !process.env.NODE_TEST_CONTEXT && process.env.SMS_VERIFY_PHONES !== 'off' && (Boolean(provider) || process.env.NODE_ENV !== 'production'),
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  isProduction: process.env.NODE_ENV === 'production',
  // How many reverse proxies sit in front of this server — 0 locally, 1
  // behind a single load balancer (Render, Railway, an nginx in front).
  // Opt-in on purpose, because BOTH defaults are wrong somewhere:
  // trusting a proxy that is not there lets any caller forge
  // X-Forwarded-For and so forge the key the rate limiter counts by;
  // not trusting one that IS there makes every request look like it came
  // from the proxy, so all users share one rate-limit bucket and
  // request.secure is always false. See RULES-PLANS/SECURITY_REVIEW.md,
  // finding K.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
  clientOrigin: normalizeOrigin(process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'),
  db: {
    // Hosts (Railway) hand over one connection URL; it wins when set, and
    // the separate PG* settings below are for a local database.
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true',
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'pectrack',
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD,
  },
  // Phase 6.5 (see PHASE6.5_PLAN.md) — live PayMongo integration. Both
  // are `undefined`, never a placeholder string, when unset: a bare ''
  // default could be mistaken for a working (if empty) credential, where
  // undefined fails loudly and immediately the first time anything tries
  // to use it. None of these exist in this repo's .env yet — see
  // PHASE6.5_PLAN.md's closing note for where to find them in the
  // PayMongo dashboard once ready to wire them in. The page PayMongo sends
  // the payer back to is built from clientOrigin (routes/payments.js).
  // Ordering hours (lib/orderHours.js). An order for "now" can only be
  // placed between 5:00 AM and 10:00 PM Manila time. Off under the test
  // runner, so the suites can place orders at any hour; orders.test.js and
  // lib/orderHours.test.js turn it on to test the rule itself.
  orders: {
    enforceNowHours: !process.env.NODE_TEST_CONTEXT,
  },
  // SMS (lib/sms.js, RULES-PLANS/RESERVE_SMS_PLAN.md). Two providers:
  // textbee.dev (the team's choice, 2026-10-21: free, sends from the
  // bakery's own Android phone and SIM) and Semaphore (a paid Philippine
  // gateway, kept for later). textbee is used when its key and device are
  // set, else Semaphore when its key is set, else none.
  //
  // `verifyPhones` decides whether sign-up and Reserve need a texted code:
  // on whenever a provider is set, and on a developer machine without one
  // (the code prints in the server console). On the live site with no
  // provider it is off, so sign-up and Reserve keep working.
  // SMS_VERIFY_PHONES=off turns it off even with a provider (the phone is
  // down for a day). Off under the test runner; the tests turn it on.
  sms: smsSettings(),
  paymongo: {
    secretKey: process.env.PAYMONGO_SECRET_KEY,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
  },
  // Outgoing email (server/lib/mail.js) — today only the password-reset
  // link. Same "undefined, never a placeholder" rule as paymongo above:
  // with SMTP_HOST unset nothing is sent, and outside production the
  // message is printed to the server console instead so the flow can be
  // exercised on a developer machine with no mail account at all.
  mail: {
    // Never real mail under the test runner. Once .env holds working SMTP
    // credentials, every test that signs in an admin, registers a customer
    // or requests a reset would otherwise send a genuine email through the
    // developer's own account — hundreds per run, to addresses at
    // example.com. That happened: Gmail answered "454 Too many login
    // attempts" and throttled the account, which also blocked the real
    // admin sign-in code. `node --test` sets NODE_TEST_CONTEXT in every
    // test process, so the suites fall back to the console path they were
    // written against, whatever .env says.
    host: process.env.NODE_TEST_CONTEXT ? undefined : process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? 'PECTRACK <no-reply@pectrack.local>',
    // Gmail API over HTTPS (DEPLOY_PLAN.md, D5) — for hosts that block SMTP.
    // When all three are set, mail goes through the Gmail API as the
    // account that granted the refresh token (scripts/gmail-auth.mjs);
    // otherwise SMTP as before. Off under the test runner, like SMTP.
    gmail: process.env.NODE_TEST_CONTEXT ? null : (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN
      ? { clientId: process.env.GMAIL_CLIENT_ID, clientSecret: process.env.GMAIL_CLIENT_SECRET, refreshToken: process.env.GMAIL_REFRESH_TOKEN }
      : null),
  },
}
