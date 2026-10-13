import { LineIcon } from '../../components/storefront/Decor.jsx'
import { bakery, bakeryAddress, bakeryMapsUrl, telHref } from '../../lib/bakery.js'
import { PageBanner } from '../../components/storefront/PageBanner.jsx'

export function ContactPage() {
  return (
    <>
      <PageBanner eyebrow="Visit us" title="Come by the bakery" lead="We are easiest to reach in person — the smell of fresh bread will find you. Here is where we are and how to call." />
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-7">
        <div className="grid gap-5 md:grid-cols-3">
          <InfoCard icon="pin" title="Address">
            <p>{bakeryAddress}</p>
            <a href={bakeryMapsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-10 items-center rounded-full bg-crust-600 px-5 text-sm font-bold text-white transition hover:bg-crust-700">Get directions →</a>
          </InfoCard>
          <InfoCard icon="clock" title="Opening hours">
            <p>{bakery.hours.days}</p>
            <p className="font-display text-2xl font-bold text-cocoa-900">{bakery.hours.time}</p>
            {bakery.hours.note && <p className="mt-1 text-sm text-cocoa-500">{bakery.hours.note}</p>}
          </InfoCard>
          <InfoCard icon="phone" title="Call us">
            {bakery.phones.map((number) => (
              <a key={number} href={telHref(number)} className="block py-1 font-display text-2xl font-bold text-cocoa-900 hover:text-crust-600">{number}</a>
            ))}
            <p className="mt-1 text-sm text-cocoa-500">For big orders, call ahead and we will plan the bake.</p>
          </InfoCard>
        </div>
      </section>
    </>
  )
}

function InfoCard({ icon, title, children }) {
  return (
    <div className="rounded-[1.75rem] bg-white p-7 text-base leading-7 text-cocoa-700 ring-1 ring-cream-200">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-cream-100 text-crust-600 ring-1 ring-cream-300"><LineIcon name={icon} className="h-7 w-7" /></span>
      <h2 className="mt-5 font-display text-2xl font-semibold text-cocoa-900">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  )
}
