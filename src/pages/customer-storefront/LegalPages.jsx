// Privacy Policy (/privacy) and Terms of Service (/terms). The registration
// form asks every customer to agree to both, and Google requires both,
// hosted on the app's own site, before the Gmail API sign-in can be
// published (DEPLOY_PLAN.md, Step 3).
//
// Written from what PECTRACK actually stores and does (checked against the
// schema and routes on 2026-11-06) — not a generic template. Change the
// wording here when the system changes. It is the team's draft for the
// adviser and the bakery to review; it is not legal advice.
import { Link } from 'react-router-dom'
import { PageBanner } from '../../components/storefront/PageBanner.jsx'
import { bakery, bakeryAddress, deliveryFee, deliveryTown, telHref } from '../../lib/bakery.js'

const lastUpdated = 'November 6, 2026'

function LegalPage({ eyebrow, title, lead, sections }) {
  return (
    <>
      <PageBanner eyebrow={eyebrow} title={title} lead={lead} />
      <article className="mx-auto max-w-3xl px-4 pt-12 pb-4 text-base leading-7 text-cocoa-700 sm:px-7">
        <p className="text-sm text-cocoa-500">Last updated: {lastUpdated}</p>
        <nav aria-label="On this page" className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-cream-200">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-crust-600">On this page</p>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id}><a href={`#${section.id}`} className="font-semibold text-cocoa-700 hover:text-crust-600 hover:underline">{index + 1}. {section.title}</a></li>
            ))}
          </ol>
        </nav>
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 pt-10">
            <h2 className="font-display text-2xl font-semibold text-cocoa-900">{index + 1}. {section.title}</h2>
            <div className="mt-3 space-y-3">{section.body}</div>
          </section>
        ))}
        <ContactBlock />
      </article>
    </>
  )
}

function ContactBlock() {
  return (
    <section id="contact" className="mt-12 rounded-[1.75rem] bg-butter-100 p-7 ring-1 ring-cream-300">
      <h2 className="font-display text-2xl font-semibold text-cocoa-900">Contact us</h2>
      <p className="mt-2">{bakery.name}, {bakeryAddress}</p>
      <p className="mt-1">
        Call {bakery.phones.map((phone, index) => (
          <span key={phone}>{index > 0 && ' or '}<a href={telHref(phone)} className="font-bold text-crust-700 hover:underline">{phone}</a></span>
        ))}, {bakery.hours.days.toLowerCase()}, {bakery.hours.time}.
      </p>
    </section>
  )
}

const List = ({ items }) => (
  <ul className="list-disc space-y-1.5 pl-6 marker:text-crust-500">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
)

const privacySections = [
  {
    id: 'who',
    title: 'Who we are',
    body: <p>This website and its ordering system, PECTRACK, are run by {bakery.name} of {bakeryAddress}. The bakery decides how your personal information is used and is responsible for protecting it, as the personal information controller under the Data Privacy Act of 2012 (Republic Act No. 10173).</p>,
  },
  {
    id: 'collect',
    title: 'What we collect',
    body: (
      <List items={[
        <><strong>Your account:</strong> first and last name, username, email address and mobile number, which you confirm with a code sent by text. Your password is stored only as a one-way hash, so nobody — not even the bakery — can read it.</>,
        <><strong>Delivery addresses you save:</strong> a label, the recipient's name and contact number, the street, barangay, town, province, postal code and any delivery notes.</>,
        <><strong>Your orders:</strong> the items, prices and totals, pickup or delivery, the date and time you asked for, special instructions, and each change of status.</>,
        <><strong>Payments:</strong> the method (cash or GCash), the amount, the date, the cash you handed over at the counter, the reference number of a GCash payment, and a screenshot of it if you choose to attach one. You pay the bakery's GCash QR code in your own GCash app; we never see or store your login, PIN or account details.</>,
        <><strong>Delivery records:</strong> the progress of your delivery, when it was delivered, and any note staff add. Records of older deliveries may also name the person who delivered them and hold a proof photo; these are kept but no longer shown.</>,
        <><strong>Counter orders:</strong> a walk-in order may carry your name. An advanced order also needs your mobile number, confirmed with a code, and may carry your email, so that we can send you the order number and receipt.</>,
        <><strong>Security records:</strong> sign-ins, failed sign-in attempts and account changes, with the time, the internet (IP) address and the browser used, so we can spot and stop someone trying to get into your account.</>,
      ]} />
    ),
  },
  {
    id: 'use',
    title: 'Why we use it',
    body: (
      <List items={[
        'To create and run your account, and to confirm your mobile number.',
        'To prepare, deliver and hand over your orders, and to tell you about them by email or text.',
        'To check and record payments and issue receipts.',
        'To keep your account safe: one-time sign-in codes for the bakery\'s administrator, locking an account after repeated wrong passwords, keeping each account signed in on one device at a time, and the security records above.',
        'To run the bakery: sales and stock reports, and estimates of how much to bake. These use totals, not your personal details.',
      ]} />
    ),
  },
  {
    id: 'share',
    title: 'Who can see it',
    body: (
      <>
        <List items={[
          <><strong>Bakery staff</strong>, only as their role needs. The administrator and cashiers see orders, payments and the delivery details needed to hand over an order, and can look up a customer's record to take an order. Only the administrator can edit customer accounts or open the reports.</>,
          <><strong>GCash</strong> processes your payment under its own terms. We receive only the reference number, and the screenshot if you attach one. Bakery staff check them against the bakery's GCash account.</>,
          <><strong>Google</strong> delivers the emails we send you through Gmail (password reset, receipts, notices about your orders and your account).</>,
          <><strong>Textbee</strong> sends our text messages, such as sign-up codes and advanced-order numbers, through a connected phone. It receives your mobile number and the message.</>,
          <><strong>Railway</strong>, our hosting provider, runs the system and stores its database on our behalf.</>,
        ]} />
        <p>We do not sell your information, and we do not share it for advertising.</p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and your browser',
    body: <p>We use one cookie, to keep you signed in. An administrator who chooses to trust a device for 30 days gets a second cookie for that. Your cart is kept in your own browser until you order. We use no advertising or tracking cookies and no analytics services.</p>,
  },
  {
    id: 'keep',
    title: 'How long we keep it',
    body: <p>We keep your account while it is active. Records of orders and payments are kept for as long as the bakery needs them for its books and for any question about an order. If you ask us to close your account, we deactivate it so it can no longer be used, and keep only the order and payment records we still need.</p>,
  },
  {
    id: 'protect',
    title: 'How we protect it',
    body: <p>The site uses an encrypted (HTTPS) connection. Passwords are hashed, staff see only what their role needs, accounts are locked after five wrong passwords in a row, and the administrator must also enter a one-time code sent by email. Each account stays signed in on one device at a time, so a new sign-in ends the older one.</p>,
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under the Data Privacy Act, you have the right to be informed about how your information is used, to access it, to have it corrected, to object to its use, to have it blocked or erased when it is no longer needed or was collected unlawfully, to receive a copy of it, and to be compensated for damage caused by its misuse.</p>
        <p>You can update your name, contact number, email, addresses and password yourself in <Link to="/account" className="font-bold text-crust-700 hover:underline">My Account</Link>. For anything else, contact the bakery below. If you believe your rights were not respected, you may also file a complaint with the National Privacy Commission.</p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: <p>If we change this policy, we will update it on this page and change the date at the top.</p>,
  },
]

const termsSections = [
  {
    id: 'about',
    title: 'About these terms',
    body: <p>These terms apply when you use this website to browse, create an account, and order from {bakery.name}. By creating an account or placing an order, you agree to them. How we handle your personal information is explained in our <Link to="/privacy" className="font-bold text-crust-700 hover:underline">Privacy Policy</Link>.</p>,
  },
  {
    id: 'account',
    title: 'Your account',
    body: (
      <List items={[
        'Give your real name, a working email address, and a Philippine mobile number. You confirm the number with a code sent by text when you register.',
        'Keep your password to yourself. You are responsible for orders placed from your account.',
        'After five wrong passwords in a row, your account is locked for 15 minutes to protect it.',
        'Your account stays signed in on one device at a time. Signing in on another device signs out the first one.',
        'The bakery may deactivate an account that is used to place false orders or to misuse the site.',
      ]} />
    ),
  },
  {
    id: 'orders',
    title: 'Orders',
    body: (
      <List items={[
        'Prices are in Philippine pesos and are the prices shown when you place the order.',
        'An order is accepted only if there is enough stock when you place it. The menu shows how many are left. Adding a product to your cart does not reserve it.',
        'You may choose a pickup or delivery date from today up to 30 days ahead, and a time in 30-minute steps between 6:00 AM and 10:00 PM. Pickup and delivery start at 6:00 AM so the morning breads can cool. An order for right now can be placed between 6:00 AM and 10:00 PM.',
        'An order paid by GCash is placed once the bakery confirms the payment. A pickup paid in cash is placed right away, and you pay at the counter. You may have one unpaid cash pickup at a time.',
        'Please collect your order on the day you chose. Once that day is over, a paid order is closed as completed, and an unpaid order is cancelled.',
        'Once placed, the items in an order cannot be changed.',
      ]} />
    ),
  },
  {
    id: 'pay',
    title: 'Payment',
    body: (
      <List items={[
        "Online orders are paid by scanning the bakery's GCash QR code in your GCash app, then sending the reference number. Bakery staff check it against the bakery's GCash account before releasing the order. A pickup may also be paid in cash at the counter. Walk-in orders are paid in cash or GCash at the counter.",
        'Please send the right reference number. A number already used for another payment is refused. If the bakery cannot find your payment, it rejects it and cancels the order, and the stock goes back on sale.',
        `Delivery orders are paid in full by GCash, with a flat delivery fee of ₱${deliveryFee}. We do not offer cash on delivery.`,
        'If you do not send your payment, the order is held for 15 minutes and then let go, and its stock goes back on sale.',
        'GCash\'s own terms apply to payments made through it.',
      ]} />
    ),
  },
  {
    id: 'delivery',
    title: 'Pickup and delivery',
    body: (
      <List items={[
        `Delivery is available only to addresses in ${deliveryTown}. Pickup is at the bakery, ${bakeryAddress}.`,
        'Please give an address and contact number where someone can receive the order. If a delivery cannot be completed, the bakery will contact you to arrange another try or a pickup.',
        'The bakery will email you when your order leaves and when it is marked delivered. If you did not receive it, call the bakery the same day.',
      ]} />
    ),
  },
  {
    id: 'cancel',
    title: 'Cancellations',
    body: (
      <List items={[
        'Before you pay, you can cancel a GCash order from the payment page. You can cancel a cash pickup until it is paid.',
        'Once an order has been paid, it can no longer be cancelled, and the bakery does not give refunds. For any problem with a paid order, including a payment sent after the order was let go, please contact the bakery.',
      ]} />
    ),
  },
  {
    id: 'use',
    title: 'Using the site',
    body: <p>Please do not try to get into other people's accounts, interfere with the site, or place orders you do not mean to collect or pay for. The bakery may deactivate an account that does.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: <p>We may update these terms. The date at the top shows the latest version; orders already placed follow the terms in effect when they were placed.</p>,
  },
]

export function PrivacyPage() {
  return <LegalPage eyebrow="Privacy" title="Privacy Policy" lead="What we collect when you order from us, why, who can see it, and your rights under the Data Privacy Act." sections={privacySections} />
}

export function TermsPage() {
  return <LegalPage eyebrow="Terms" title="Terms of Service" lead="The terms for ordering from Pecto's Bakery: accounts, orders, payment, delivery and cancellations." sections={termsSections} />
}
