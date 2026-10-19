# Reserve and SMS plan (adviser consultation, 2026-10-19)

## What was asked

1. **SMS OTP for contact numbers** (the adviser).
2. **Reserve** at the counter (the adviser). It sits in the Walk-in tab as a Walk-in / Reserve switch, because the two need different details:
   - Walk-in: name and date.
   - Reserve: name, contact number and email.
3. **Proof of order** (the team). After a reservation is taken:
   - its receipt and details are emailed to the customer;
   - a private receipt page on the storefront shows the pickup date and time;
   - an SMS carries the order number, for a customer with no internet.

## Decisions (the user, 2026-10-19)

| Question | Answer |
|---|---|
| SMS service | **Semaphore**, a Philippine gateway (about ₱0.50 per SMS on prepaid credits; OTP and priority texts cost 2 credits). |
| Where OTP runs | **Customer sign-up** (online ordering), and **inside Reserve** before the order is saved. |
| Reserve payment | **Paid in full at the counter**, like a walk-in (payment first, no refunds). |
| Proof of order | A **private receipt link** in the email, plus an **SMS with the order number** that works without internet. |

## Design

### SMS (server/lib/sms.js)

- `POST https://api.semaphore.co/api/v4/messages` (order texts) and `/priority` (codes), form-encoded, with `apikey`, `number`, `message` and `sendername`.
- Settings:
  - `SEMAPHORE_API_KEY`;
  - `SEMAPHORE_SENDER_NAME` (optional; Semaphore uses the account's default name until a custom one is approved).
- With no key, the message is printed to the server console outside production, the same as email (lib/mail.js), and nothing is sent.
- Under the test runner nothing is ever sent. Messages go to an in-memory outbox that the tests read.
- Numbers are normalised to `09XXXXXXXXX`. A Philippine mobile number is required wherever a code is sent.
- A text never starts with "TEST", because Semaphore silently drops those.

### Phone codes (migration 032, lib/phoneVerification.js, routes/phoneVerification.js)

- Table `phone_verifications` columns:

  | Column | Holds |
  |---|---|
  | `phone` | the normalised number |
  | `purpose` | REGISTER or RESERVE |
  | `code_hash` | SHA-256 of the code |
  | `token_hash` | SHA-256 of the verification token |
  | `expires_at` | 10 minutes from sending |
  | `attempt_count` | wrong guesses so far, at most 5 |
  | `verified_at` | when the code was confirmed |
  | `consumed_at` | when an account or order used it |

  This has the same shape as `otp_codes`: only hashes are stored.
- `POST /api/phone-verification/send { phone, purpose }` sends a 6-digit code and returns `verificationToken`:
  - REGISTER is public, rate-limited per address, with a 60-second cooldown per number. It refuses a number another account already uses.
  - RESERVE is for cashier and admin only.
- `POST /api/phone-verification/check { verificationToken, code }` marks the number verified.
- The account or order that uses the number consumes the token in its own transaction. The token must be verified within the last 30 minutes, for the same number and purpose.
- `GET /api/phone-verification/status` returns `{ required }`.
- **When codes are required:** whenever a Semaphore key is set, and always on a developer machine (codes print in the server console). On the live site without a key, codes stay off, so sign-up and Reserve keep working until the credits are bought. They are never required under the test runner unless a test turns them on.

### Sign-up

- With codes required, `POST /api/auth/register` needs `phoneVerificationToken` for the same number. `customers.contact_verified_at` is set.
- The form has **Send code** beside Contact number, then a code box and **Verify**. Create account waits until the number is verified.

### Walk-in and Reserve (orders, migration 032)

- New columns on `orders`:
  - `guest_name`, `guest_contact`, `guest_email`;
  - `guest_contact_verified_at`;
  - `is_reservation`;
  - `receipt_token_hash`.
- The Walk-in tab gets a **Walk-in | Reserve** switch:
  - **Walk-in:** Name and Pickup date (today, filled in). Time is optional.
  - **Reserve:** Name, Contact number (Send code / Verify), Email, and Pickup date and time (both required).
- Both are pickup orders, paid in full at the counter (cash or GCash), and Ready for pickup at once.
- The server:
  - stores the walk-in name;
  - for a reservation, requires name, a valid email, a pickup time and, with codes required, a verified number.
- Staff lists show `COALESCE(customer name, guest name)`. The staff order detail shows the reservation's contact number and email.

### Proof of order

- **Email** to the reservation's address: order number, items, total paid, pickup date and time, bakery address and hours, and the private receipt link.
- **Receipt page** `/r/:token` on the storefront. It needs no sign-in, and the long random token in the link is the key. It shows the order number, status, items, total, paid, pickup date and time, and the bakery. `GET /api/receipts/:token` is rate-limited, and only the token hash is stored.
- **SMS** after a reservation: "PECTRACK order #N is paid (P…). Pick up {date}, {time}. Show this text at the counter." It stays under 160 characters (one credit) and has no link, because it is meant for no internet.
- Email and SMS are sent after the order is committed, in the background. A failure never fails the order.

## What the team must do (cannot be done in code)

1. Create a Semaphore account at semaphore.co and buy credits.
2. Optionally, apply for the sender name "PECTRACK" (approval takes a few days).
3. Put `SEMAPHORE_API_KEY` (and `SEMAPHORE_SENDER_NAME` once approved) in Railway's Variables, and in `.env` to text real phones locally.
