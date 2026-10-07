import { Link } from 'react-router-dom'
import { Eyebrow, LineIcon, ScallopEdge } from '../../components/storefront/Decor.jsx'
import { useMenuData } from './useMenuData.js'

export function AboutPage() {
  const { sections } = useMenuData()
  const photos = sections.flatMap((section) => section.items).filter((product) => product.imageUrl)
  const broas = photos.find((product) => product.name.toLowerCase().includes('broas')) ?? photos[0]
  const second = photos.find((product) => product !== broas && product.name.toLowerCase().includes('ensaymada')) ?? photos[1]

  return (
    <>
      <PageBanner eyebrow="Our story" title="A small bakery, baking for Lucban every day" lead={'Known locally simply as "Lucban\'s Best Delicacies" — the name on the wrapper of everything we bake.'} />

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-14 sm:px-7 lg:grid-cols-2">
        <div className="space-y-5 text-base leading-8 text-cocoa-700">
          <p>Pecto&apos;s Bakery has been part of Lucban, Quezon&apos;s daily routine — fresh bread every morning, and the kind of pastries people plan their day around.</p>
          <p>Our <span className="font-bold text-crust-600">Broas</span> — Lucban&apos;s own ladyfinger biscuit — is what we are best known for, sold by the pack all the way up to the gallon tin for fiestas and pasalubong. Alongside it: ensaymada, pandesal, and a full counter of everyday pastries.</p>
          <p>We are still a small, family-run bakery at heart. Every batch is baked in-house, and every order is prepared to be picked up or delivered fresh.</p>
          <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white transition hover:bg-crust-700">See what&apos;s fresh today</Link>
        </div>
        <div className="relative grid grid-cols-2 gap-4">
          <div className="aspect-3/4 overflow-hidden rounded-t-full rounded-b-4xl bg-cream-200 ring-4 ring-white shadow-lg">
            {broas && <img src={broas.imageUrl} alt={broas.name} className="h-full w-full object-cover" />}
          </div>
          <div className="mt-12 aspect-3/4 overflow-hidden rounded-4xl bg-cream-200 ring-4 ring-white shadow-lg">
            {second && <img src={second.imageUrl} alt={second.name} className="h-full w-full object-cover" />}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-7">
        <div className="grid gap-4 sm:grid-cols-3">
          <Fact icon="oven" value="Every morning" label="Baked fresh, Monday to Saturday" />
          <Fact icon="bulk" value="40+ items" label="On the counter — breads, broas, pastries" />
          <Fact icon="delivery" value="All of Lucban" label="Pickup at the bakery or delivered" />
        </div>
      </section>
    </>
  )
}

function Fact({ icon, value, label }) {
  return (
    <div className="flex items-center gap-4 rounded-[1.75rem] bg-white p-6 ring-1 ring-cream-200">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-cream-100 text-crust-600 ring-1 ring-cream-300"><LineIcon name={icon} className="h-7 w-7" /></span>
      <span>
        <span className="block font-display text-2xl font-bold text-cocoa-900">{value}</span>
        <span className="block text-sm text-cocoa-500">{label}</span>
      </span>
    </div>
  )
}

// The cream banner the Menu, About and Visit Us pages open with.
export function PageBanner({ eyebrow, title, lead, children }) {
  return (
    <section className="relative overflow-hidden bg-cream-50">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-butter-100" />
      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-7 sm:pt-16">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 max-w-4xl font-display text-5xl font-bold leading-tight text-cocoa-900 sm:text-6xl">{title}</h1>
        {lead && <p className="mt-4 max-w-2xl text-lg leading-8 text-cocoa-700">{lead}</p>}
        {children}
      </div>
      <ScallopEdge className="text-cream-100" />
    </section>
  )
}
