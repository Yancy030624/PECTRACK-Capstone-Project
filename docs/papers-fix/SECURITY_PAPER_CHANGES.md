# PECTRACK security: system changes and paper text

**For:** the whole group, before the final defense. The lead panelist specializes in security.
**Date:** 2026-10-30
**System changes:** commit `9576e6c` on main. All 524 automated tests pass, and the built site was checked in Chrome with no Content-Security-Policy violations.
**Paper:** this replaces the System Security section (Chapter 3, p. 101–103) and **supersedes Round 5g** of `CHAPTER_GRILL.md`.

---

## 1. What was added to the system on 2026-10-30

| Threat | Before | Added | Where in the code |
|---|---|---|---|
| **Cross-site scripting (XSS)** | React escapes every value it shows; the Content-Security-Policy only blocked framing | A full **Content-Security-Policy**: scripts may load only from PECTRACK itself, so an injected `<script>` or `onclick=` never runs. Also **Permissions-Policy** (no camera, microphone, location, or payment access) and **Cross-Origin-Opener-Policy** | `server/lib/security.js` (`contentSecurityPolicy`, `securityHeaders`) |
| **Cross-site request forgery (CSRF)** | The sign-in cookie was `SameSite=Lax` | A second check: any request that changes data is refused (403) when the browser marks it as coming from another website (`Sec-Fetch-Site: cross-site`, or a foreign `Origin`) | `server/lib/security.js` (`sameSiteRequests`), mounted in `server/app.js` |
| **SQL injection** | Every query already used parameters | The customer search also escapes the `%` and `_` wildcards, so a search is matched as plain text; new tests send injection payloads and confirm they match nothing and drop nothing | `server/routes/customers.js`; tests in `customers.test.js` |

Tests added: CSP and header tests, five CSRF tests (foreign origin refused, cross-site refused, `null` origin refused, own site allowed, reading never blocked), and the SQL-injection search test.

---

## 2. Every security feature, mapped to the OWASP Top 10 (2021)

A security panelist will likely think in OWASP terms. Keep this table ready; it does not need to go in the paper.

| OWASP risk | How PECTRACK handles it |
|---|---|
| A01 Broken Access Control | Role checks on every route (Admin, Cashier, Customer); a customer asking for someone else's order or payment gets "not found" (404), which does not even confirm that it exists |
| A02 Cryptographic Failures | HTTPS with HSTS; passwords hashed with bcrypt (cost 12); OTP codes, password-reset tokens, and guest receipt tokens stored only as hashes |
| A03 Injection | Parameterized queries everywhere; server-side validation of every field; LIKE wildcards escaped; CSP against script injection (XSS) |
| A04 Insecure Design | Payments confirmed by staff, and each reference number usable once; paid orders cannot be cancelled; stock changes kept in a ledger with who made each change |
| A05 Security Misconfiguration | Security headers on every response, including errors; JSON error messages with no stack traces; requests accepted only from the site's own address (CORS) |
| A07 Identification and Authentication Failures | Password rules; 15-minute lockout after 5 failures; email OTP for the admin; SMS verification for customers; rate limits; the same error message whether or not an account exists |
| A08 Software and Data Integrity Failures | Image uploads limited by type and to 5 MB (admin for products and the QR code; a customer only for their own pending payment), product photos saved under random names, `nosniff` so a file cannot be run as a page |
| A09 Security Logging and Monitoring Failures | `security_events` audit trail (sign-ins, failures, lockouts, OTP, password changes, deactivations, with IP address and device) |
| A10 Server-Side Request Forgery | The server never fetches an address supplied by a user |

---

## 3. Paper text: System Security (replaces Chapter 3, p. 101–103)

> **System Security**
>
> Security is a fundamental aspect of PECTRACK, which handles customer information, order records, payment references, and inventory data. The following measures protect this data from unauthorized access, data breaches, and common web attacks.
>
> **Authentication and Access Control.** PECTRACK implements role-based access control (RBAC) that restricts each feature to the roles that need it: Admin, Cashier, or Customer. The User Management and Reporting and Analytics modules are accessible to the administrator only. Every request is checked on the server, not only on the screen, so hiding a button is never the only protection. A customer who requests another customer's order or payment receives a "not found" response, which does not reveal that the record exists. The sign-in form has separate Customer and Admin entrances, and each refuses the other kind of account. The administrator account uses two-factor authentication: after entering valid credentials, the administrator must enter a six-digit one-time password (OTP) sent by email, which expires in about five minutes and allows five attempts. A device may be trusted for 30 days, and changing the password removes all trusted devices. Customers verify their contact number with a six-digit code sent by SMS before their account is created.
>
> **Password Security.** All passwords are hashed with the bcrypt algorithm at a cost factor of 12 before they are stored. Bcrypt is a one-way function that adds a random salt to each password, so the original password cannot be recovered even if the database is compromised, and two users with the same password are stored with different hashes. Passwords must be at least 12 characters long and include uppercase and lowercase letters, a number, and a symbol; common passwords and passwords containing the username or the email name are refused. Password-reset links expire after 30 minutes, can be used only once, and are stored only as hashes.
>
> **Session Management.** Each user receives a random 256-bit session token upon signing in, stored in a cookie that scripts cannot read (HttpOnly), that is sent only over HTTPS (Secure), and that other websites cannot use (SameSite=Lax). With the "Keep me logged in" option, the session lasts for up to seven days; otherwise, it ends when the browser is closed. Signing out ends the session, and changing the password signs the account out of every other device.
>
> **Protection Against Brute-Force Attacks.** After five failed sign-in attempts, the account is locked for 15 minutes. In addition, the system limits how often each action can be requested: ten sign-in attempts per account and sixty sign-in requests per address every 15 minutes, twenty registrations, ten password-reset requests, and ten SMS codes per hour. The sign-in error message is the same whether the account exists or not, and the system takes the same time to answer in both cases, so attackers cannot use the sign-in form to find out which usernames exist.
>
> **SQL Injection Prevention.** SQL injection is an attack in which a user types database commands into a form field so that they become part of a query. PECTRACK prevents it by using parameterized queries for every database interaction: the query and the user's data are sent to the database separately, so the data is always treated as a value and never as SQL code. For example, typing `' OR '1'='1` into the customer search simply searches for a customer with that name and finds none. The search also escapes the wildcard characters % and _, so they are matched literally. Every form field is validated on the server before it is processed or stored.
>
> **Cross-Site Scripting (XSS) Prevention.** Cross-site scripting is an attack in which a malicious script is saved into, or reflected by, a website and then runs in other users' browsers. PECTRACK prevents it in two layers. First, the interface is built with React, which escapes every value it displays, so text such as a product name or a customer's address is always shown as text and never run as code; the system does not insert raw HTML anywhere, and all emails are sent as plain text. Second, every page is served with a Content-Security-Policy that allows scripts to load only from PECTRACK itself, blocks plugins, and forbids sending forms or connecting to other websites. Even if a script were somehow injected, the browser would refuse to run it.
>
> **Cross-Site Request Forgery (CSRF) Prevention.** Cross-site request forgery is an attack in which another website makes a signed-in user's browser send a request, such as cancelling an order, without the user's knowledge. PECTRACK prevents it in two layers. First, the session cookie is marked SameSite=Lax, so browsers do not send it with requests that change data when another website starts them. Second, the server refuses every request that changes data when the browser reports that it came from another website, based on the Origin and Sec-Fetch-Site headers that browsers add themselves and that a web page cannot forge.
>
> **HTTPS and Security Headers.** All data between the browser and the server is encrypted with HTTPS (TLS). A request over plain HTTP is redirected to HTTPS, and the Strict-Transport-Security header tells browsers to use HTTPS for the site from then on. Every response, including error responses, also carries headers that prevent the site from being shown inside another website's frame (clickjacking), stop browsers from treating an uploaded file as a web page, prevent the password-reset link from leaking to other websites, and deny access to the camera, microphone, and location. The server accepts requests only from the system's own website address.
>
> **File Upload Security.** The system accepts images only: product photos (JPEG, PNG, or WebP) and the bakery's GCash QR code (JPEG or PNG), which only the administrator can upload, and the server also accepts a payment screenshot from a customer for their own pending payment. Each file is limited to 5 MB. The server checks each file's type, saves product photos under random names rather than the names they were uploaded with, and tells the browser never to treat an uploaded image as anything other than an image.
>
> **Payment Security.** Online payments are made in the customer's own GCash app by scanning the bakery's GCash QR code. PECTRACK never receives or stores the customer's GCash credentials or any card details; it stores only the reference number and the amount of each payment. A staff member confirms each payment against the bakery's GCash account before the order is released, and the database allows each reference number to be used only once, so the same payment cannot be claimed for two orders. Each confirmation or rejection is recorded with the staff member who made it and the time it was made.
>
> **Data Privacy and Confidentiality.** PECTRACK handles personal data, including names, contact numbers, addresses, and order histories, in accordance with the principles of Republic Act No. 10173, the Data Privacy Act of 2012. Access to customer records is restricted to authorized staff, and customers can view and change only their own information. The system does not share customer data with any third party beyond what is necessary for sending SMS codes and email notices through its SMS and email services.
>
> **Error Handling and Audit Logging.** Users see only short, friendly error messages; technical details such as error traces and database queries are never shown and are recorded only on the server. The system keeps an audit trail of security events, including successful and failed sign-ins, lockouts, one-time password use, password resets and changes, and account deactivations, each with the user, the IP address, the device, and the time. Every stock change and every order status change is also recorded with the user who made it, providing accountability for daily operations.

---

## 4. Limitations to state honestly (add to Scope and Limitations if the adviser agrees)

> 8. **Single-Server Security Limits.** The request limits are counted in the memory of the single server that runs the system. If the system were run on several servers at once, each would keep its own count, so the effective limit would be higher; a shared store would then be needed. Online payments are confirmed by staff, not by the payment provider, as stated in Limitation 5.

---

## 5. Questions the security panelist may ask

| Question | Answer |
|---|---|
| How do you prevent SQL injection? | "Every query is parameterized: the SQL and the user's values are sent to PostgreSQL separately, so input is never run as SQL. We have a test that types `' OR '1'='1` and `'; DROP TABLE customers; --` into the customer search; both find nothing and the table is still there." |
| Show me. | Open `server/routes/customers.js`: the search is `ILIKE $1` with the value passed as a parameter. Open `server/routes/customers.test.js`: the injection test. |
| How do you prevent XSS? | "Two layers. React escapes everything it displays, and we never insert raw HTML. On top of that, the Content-Security-Policy lets scripts load only from our own site, so even an injected script would be refused by the browser." |
| Why does your CSP allow `'unsafe-inline'` for styles? | "Only for styles, never for scripts. React's style properties and the charts set inline styles. Inline styles cannot run code, and script-src stays `'self'` only." |
| How do you prevent CSRF? Why no CSRF tokens? | "The session cookie is SameSite=Lax, so the browser doesn't send it with another site's data-changing request. As a second check, the server refuses any data-changing request whose Origin or Sec-Fetch-Site header says it came from another site. Browsers set those headers, and a page's script can't fake them. OWASP lists checking these headers as a valid CSRF defense, and together with SameSite it covers the same attack a token would." |
| How are passwords stored? | "bcrypt with cost factor 12, salted per password. Even we cannot read them." |
| What stops someone guessing passwords? | "Five wrong attempts lock the account for 15 minutes, there are rate limits per account and per address, and the admin also needs the emailed code." |
| Can I find out which usernames exist? | "No. The sign-in message is the same either way, and we compare against a dummy hash when the user doesn't exist, so the response time is the same too. Forgot-password also gives the same reply either way." |
| Can a customer see another customer's order? | "No. Every order and payment request checks ownership on the server, and the answer is 'not found', so it doesn't even confirm the order exists." |
| What if someone steals the session cookie? | "The cookie is HttpOnly, so scripts can't read it; it's sent only over HTTPS; and changing the password signs out every other device." |
| Is payment data safe? | "We never handle GCash credentials or cards. We store only the reference number and amount, and each reference can be used once." |
| What is logged? | "Sign-ins, failures, lockouts, OTP use, password changes, and deactivations, with IP address and device, in the security_events table." |
| What would you improve? | "Move the rate-limit counters to a shared store if we ever run more than one server, add automatic payment confirmation through a payment gateway if the bakery accepts the fees, and run an external penetration test." |

---

## 6. Changes to `CHAPTER_GRILL.md`

- Round 5g is replaced by section 3 of this file.
- Round 5b (Technologies) is unchanged.
