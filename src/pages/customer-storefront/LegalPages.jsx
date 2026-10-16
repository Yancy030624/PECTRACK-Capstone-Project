// Privacy Policy (/privacy) and Terms of Service (/terms). The registration
// form asks every customer to agree to both, and Google requires both,
// hosted on the app's own site, before the Gmail API sign-in can be
// published (DEPLOY_PLAN.md, Step 3).
//
// Written from what PECTRACK actually stores and does (checked against the
// schema and routes on 2026-10-14) — not a generic template. Change the
// wording here when the system changes. It is the team's draft for the
// adviser and the bakery to review; it is not legal advice.
import { Link } from 'react-router-dom'
import { PageBanner } from '../../components/storefront/PageBanner.jsx'
import { bakery, bakeryAddress, deliveryTown, telHref } from '../../lib/bakery.js'

const lastUpdated = 'October 15, 2026'

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
        <><strong>Your account:</strong> full name, username, email address and contact number. Your password is stored only as a one-way hash, so nobody — not even the bakery — can read it.</>,
        <><strong>Delivery addresses you save:</strong> a label, the recipient's name and contact number, the street, barangay, town, province, postal code and any delivery notes.</>,
        <><strong>Your orders:</strong> the items, prices and totals, pickup or delivery, the date and time you asked for, special instructions, and each change of status.</>,
        <><strong>Payments:</strong> the method (cash or GCash), the amount, the date, and the GCash reference number. Online payments are made on PayMongo's own page; we never see or store your GCash login, PIN or wallet details.</>,
        <><strong>Delivery records:</strong> who delivered your order, when, and the photo taken as proof of delivery.</>,
        <><strong>Security records:</strong> sign-ins, failed sign-in attempts and account changes, with the time, the internet (IP) address and the browser used, so we can spot and stop someone trying to get into your account.</>,
      ]} />
    ),
  },
  {
    id: 'use',
    title: 'Why we use it',
    body: (
      <List items={[
        'To create and run your account, and to confirm your email address.',
        'To prepare, deliver and hand over your orders, and to let you follow them.',
        'To take and record payments and issue receipts.',
        'To keep your account safe: one-time sign-in codes for the bakery\'s administrator, locking an account after repeated wrong passwords, and the security records above.',
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
          <><strong>Bakery staff</strong>, only as their role needs: the administrator and cashiers see customer records, orders and payments; a delivery person sees only the name, contact number and address for the deliveries assigned to them.</>,
          <><strong>PayMongo</strong>, the payment provider, receives your name, email, contact number and the amount when you pay online with GCash.</>,
          <><strong>Google</strong> delivers the emails we send you (email confirmation, password reset, notices about your account).</>,
          <><strong>Our hosting provider</strong> stores the system and its database on our behalf.</>,
        ]} />
        <p>We do not sell your information, and we do not share it for advertising.</p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and your browser',
    body: <p>We use one cookie, to keep you signed in. Your cart is kept in your own browser until you order. We use no advertising or tracking cookies and no analytics services.</p>,
  },
  {
    id: 'keep',
    title: 'How long we keep it',
    body: <p>We keep your account while it is active. Records of orders and payments are kept for as long as the bakery needs them for its books and for any question about an order. If you ask us to close your account, we deactivate it so it can no longer be used, and keep only the order and payment records we still need.</p>,
  },
  {
    id: 'protect',
    title: 'How we protect it',
    body: <p>The site uses an encrypted (HTTPS) connection. Passwords are hashed, staff see only what their role needs, accounts are locked after five wrong passwords in a row, and the administrator must also enter a one-time code sent by email. Online payments are handled entirely by PayMongo.</p>,
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
        'Give your real name and a working email address and contact number. You must confirm your email before you can place an order.',
        'Keep your password to yourself. You are responsible for orders placed from your account.',
        'After five wrong passwords in a row, your account is locked for 15 minutes to protect it.',
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
        'An order is accepted only if the products are in stock and not past their date; the menu shows only what is available.',
        'You may ask for a date and time from today up to 30 days ahead, between 5:00 AM and 10:00 PM. An order for right now can be placed between 5:00 AM and 10:00 PM.',
        'Every order is paid first. An order is placed only once it is paid; it is then ready for pickup, or ready to be delivered, on the day you chose.',
        'Once placed, the items in an order cannot be changed.',
      ]} />
    ),
  },
  {
    id: 'pay',
    title: 'Payment',
    body: (
      <List items={[
        'Online orders are paid with GCash through PayMongo when you place them. At the counter, walk-in orders are paid in cash or GCash before they are rung up.',
        'If you do not finish paying, the order is held for 15 minutes and then let go; nothing is charged. We do not offer cash on delivery.',
        'Online payments are processed by PayMongo, and PayMongo\'s own terms apply to them.',
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
        'Our delivery staff take a photo when they hand over an order, as proof of delivery.',
      ]} />
    ),
  },
  {
    id: 'cancel',
    title: 'Cancellations',
    body: (
      <List items={[
        'Before you pay, you can cancel the order from the payment page; nothing is charged.',
        'The bakery does not give refunds. Once an order has been paid, it can no longer be cancelled; for any problem with a paid order, please contact the bakery.',
      ]} />
    ),
  },
  {
    id: 'use',
    title: 'Using the site',
    body: <p>Please do not try to get into other people's accounts, interfere with the site, or place orders you do not mean to collect or pay for. The bakery may suspend an account that does.</p>,
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
  return <LegalPage eyebrow="Terms" title="Terms of Service" lead="The terms for ordering from Pecto's Bakery online: accounts, orders, payment, delivery and cancellations." sections={termsSections} />
}
