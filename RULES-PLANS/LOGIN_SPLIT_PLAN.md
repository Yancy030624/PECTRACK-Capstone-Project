# LOGIN_SPLIT_PLAN.md — two sign-in modes, and a working recovery path

Two changes that belong together, because the second is what makes the
first's copy honest.

1. **Split the sign-in form into a customer mode and a staff mode**, both
   inside the existing pop-up, with a link to switch between them.
2. **Let an admin reset a staff member's password**, which today is
   impossible — closing the hole behind the "Forgot password?" link.

---

## Step 0 — Inspect: what is actually true today

- **One endpoint.** `POST /api/auth/login` (`auth.js:90`) takes an
  identifier and a password, and returns the account with its role. It
  has no notion of which form the request came from, and no
  role-restricted variant exists.
- **Self-registration is customer-only.** `POST /api/auth/register`
  hard-codes `'CUSTOMER'` (`auth.js:68-69`). There is no way for anyone
  to self-register as staff, by design — staff accounts are created by an
  admin in Staff Management.
- **The current form tells staff something false.** `LoginForm.jsx`
  renders the badge "Customer Login" for every visitor, and offers
  "Create account" to everyone — including a cashier, for whom that
  button can never do anything useful.
- **No password can ever be reset through the app.** `PATCH
  /api/staff/:id` accepts `name`, `email`, `contactNumber`, `isActive`
  and nothing else (`staff.js:121-141`); `PATCH /api/customers/:id` is the
  same. An admin sets a staff password once at creation and can never
  change it. `PATCH /api/auth/me` lets a signed-in person change *their
  own* password, which is no help to someone who cannot sign in.
- So the "Forgot password?" link (`href="#forgot"`) is not merely
  unfinished — there is no recovery path behind it to link to.

---

## Decisions

### Decision 1 — the split is about affordances, not enforcement

Both modes post to the same `/api/auth/login`. Signing in through the
staff form as a customer will succeed, and `landingPathFor` will route
that person to `/menu` exactly as it does today.

**That is correct behaviour and must not be "fixed".** Rejecting a valid
credential because someone used the wrong door is hostile, and it cannot
be done cleanly anyway — by the time the client knows the role, the
server has already set the session cookie, so "undoing" it means an
immediate forced logout the user never asked for.

What the split genuinely buys:

- Each audience sees only affordances that are real for them. "Create
  account" disappears from the staff mode, where it could never work.
- The badge stops lying to staff.
- The role boundary becomes visible at the front door, which is worth
  something in a defence.

**This is the same principle already recorded in `UI_AUDIT.md`
Decision 16:** presentation-level separation is a usability decision, not
a security control. The backend guards are the security control. Say it
that way if asked — do not let the split be described as access control
in the paper.

### Decision 2 — one `LoginForm` with a `mode` prop, not two components

`LoginForm` is already shared by the `/login` page and the header pop-up
so there is exactly one copy of the auth logic (`UI_REVISIONS_PLAN.md`
Decision 2). Splitting into `CustomerLoginForm` and `StaffLoginForm`
would undo that and give the project two copies of the same submit
handler to keep in sync.

Add `mode: 'customer' | 'staff'`, defaulting to `'customer'`. It changes
four things and nothing else:

| | customer | staff |
| --- | --- | --- |
| Badge | Customer Login | Staff Login |
| Heading | Sign in to your account | Staff sign in |
| "Create account" button | shown | **hidden** |
| Recovery hint | contact the bakery | ask an admin to reset it |

The switch is a plain text button under the form: "Staff sign in →" and
"← Customer sign in". `mode` is component state, so switching does not
navigate, does not touch the URL, and resets nothing the person typed
except what the mode itself hides.

Both `/login` and the pop-up inherit this automatically, because both
render the same component.

### Decision 3 — the OTP branch stays in both modes

`data.otpRequired` is currently unreachable (`UI_REVISIONS_PLAN.md`
Decision 5), but `/verify-otp` still works and the branch is the client
half of it. It belongs to whichever mode the person signed in through —
so it stays in the shared form, not duplicated per mode.

### Decision 4 — an admin resets a staff password by typing one, not by generating one

Staff Management's create form already has the admin type an initial
password ("Set an initial password"). Reset should work the same way:
the admin types the new password, reads it to the cashier, and the
cashier can change it afterwards from My Profile.

A generated 16-character string would be safer in the abstract and is
what `scripts/reset-password.mjs` does for the command line — but it is
the wrong shape for someone standing at a bakery counter reading it
aloud. Consistency with the existing create flow wins.

Validation reuses `validatePasswordField(password, { username, email })`
from `lib/validation.js` — the same 12-character/mixed-class rule as
account creation, including its check that the password does not contain
the username or email name.

### Decision 5 — resetting a password ends that account's sessions

There is already a precedent: `PATCH /api/auth/me` ends the caller's
*other* sessions when they change their own password
(`auth.js:290` — `DELETE FROM sessions WHERE user_id = $1 AND session_id
<> $2`).

An admin resetting *someone else's* password is the stronger case: the
reason to reset is usually that the old password is forgotten,
compromised, or shared. So delete **all** of that user's sessions. The
admin is not the session holder, so there is no "except mine" clause.

Without this, a reset would leave any already-open session on that
account working indefinitely, which defeats the point.

### Decision 6 — staff only for now; customer reset is a separate decision

This plan gives the admin reset power over **staff accounts only**.

The distinction is not arbitrary. An admin already sets a staff
member's password at creation, so reset restores a power they
effectively have. An admin has never held a customer's password, and
granting reset would be a **new** power over customer accounts — one
that would let the shop sign in as a customer and read their order
history. In systems with email delivery, customer reset is deliberately
self-service precisely to avoid that.

Consequence to accept knowingly: **a customer who forgets their password
still has no in-app recovery path.** The customer-mode hint says to
contact the bakery, which is honest about what the system does, and the
real answer for the paper is that self-service reset needs email or SMS
delivery, which is outside the approved scope. Revisit only if the user
decides the privacy trade is worth it.

---

## Implementation steps

### Part A — the login split (frontend only)

1. `LoginForm.jsx`: add `mode` state defaulting to `'customer'`, derive
   the four differing strings from it, hide "Create account" in staff
   mode, and add the switch button.
2. Replace the dead `href="#forgot"` with the mode-aware recovery hint.
   It is plain text, not a link — there is nothing to link to, and a link
   that goes nowhere is what caused this in the first place.
3. Nothing else changes. `LoginPage`, `LoginModal`, `App.jsx`'s
   `LoginRoute` and `landingPathFor` are all untouched — role routing
   already works and is not mode-dependent.

### Part B — admin password reset (backend + Staff Management)

1. `server/routes/staff.js`, `PATCH /:id`: accept `password`, validate
   with `validatePasswordField`, hash with `bcrypt` at `bcryptRounds`,
   and write it to `users.password_hash` inside the existing
   transaction. Then delete that user's sessions (Decision 5).
   - The route is already `requireRole('ADMIN')` router-wide
     (`staff.js:45`) and already scopes `:id` to
     `CASHIER`/`DELIVERY_PERSONNEL` — so an admin cannot reach another
     admin's account through it. Keep both properties.
2. `server/routes/staff.test.js`: cover that a reset succeeds and the
   new password works at `/api/auth/login`; that the old password stops
   working; that a weak password is rejected 422 without changing
   anything; and that the account's existing sessions are gone.
3. `StaffManagement.jsx`: a "Reset password" action per row, opening a
   small form with the new password. On success, confirm plainly that
   the person has been signed out and must use the new password.

---

## Files affected

**Changed**
- `src/components/LoginForm.jsx` — mode, switch, recovery hint
- `server/routes/staff.js` — password on PATCH, session invalidation
- `server/routes/staff.test.js` — the four cases above
- `src/pages/dashboard/StaffManagement.jsx` — reset action

**Deliberately untouched**
- `server/routes/auth.js` — one login endpoint serves both modes
  (Decision 1)
- `server/routes/customers.js` — customer reset is Decision 6's open
  question
- `App.jsx`, `LoginPage.jsx`, `LoginModal.jsx` — role routing is already
  correct and mode-independent

---

## How to test

- The pop-up opens in customer mode: badge "Customer Login", "Create
  account" present.
- Switching to staff mode hides "Create account" and changes the badge;
  switching back restores it. The URL never changes.
- `cashier1` can still sign in from **either** mode and lands on
  `/dashboard`; `customer1` from either mode lands on `/menu`. Decision 1
  — neither is an error.
- `/login` directly shows the same two modes.
- As `ymata_admin`: reset `cashier1`'s password, confirm the new one
  works and the old one is refused, and confirm a weak password is
  rejected without changing anything.
- **Then set `cashier1` back to `Cashier@Pectrack1`** — it is the
  documented demo credential and other plans reference it.
- `npm test` — the staff suite grows by the new cases.

---

## Known gaps left open

- **Customer self-service reset.** Decision 6. Needs email or SMS
  delivery, which is out of scope; the customer hint says to contact the
  bakery.
- **No forced change on first use.** A staff member keeps the password
  the admin typed until they change it themselves in My Profile. A
  "must change on next login" flag is a schema change and is not worth
  one for a four-account system.
- **The split enforces nothing.** Decision 1, stated here so the paper
  does not overclaim it.
