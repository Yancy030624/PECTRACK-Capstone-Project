import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { Eyebrow, LineIcon, ScallopEdge, WheatSprig } from '../../components/storefront/Decor.jsx'
import { ProductCard } from './ProductCard.jsx'
import { sectionAnchor, useMenuData } from './useMenuData.js'

// The storefront's front window. Laid out the way a bakery site sells —
// Conti's was the reference the adviser gave: a warm photo-led hero, the
// counter by category, the most-loved items, how to get them, the story,
// and a nudge toward big orders for fiestas and pasalubong.
//
// Everything shown is the live catalogue: the photos, prices and counts
// come from /api/products, so nothing here goes stale when the menu
// changes.

// The bakery's signature items, in the order the hero and "Most loved"
// should show them when they are on the menu. Matched by name, so a
// renamed or removed product simply drops out.
const signature = ['Broas', 'Ensaymada', 'Pandesal', 'Spanish Bread', 'Hopia', 'Ube', 'Cheese', 'Monay']
const rank = (product) => {
  const index = signature.findIndex((word) => product.name.toLowerCase().includes(word.toLowerCase()))
  return index === -1 ? signature.length : index
}

export function HomePage() {
  const { openLogin, user } = useOutletContext()
  const navigate = useNavigate()
  const { loading, sections } = useMenuData()
  const isCustomer = user?.role === 'CUSTOMER'

  const products = sections.flatMap((section) => section.items)
  const withPhoto = products.filter((product) => product.imageUrl && product.inStock !== false)
  // One per signature item (and otherwise one per name), so "Broas" in
  // four sizes does not fill the whole row.
  const family = (product) => signature[rank(product)] ?? product.name
  const favourites = [...withPhoto]
    .sort((a, b) => rank(a) - rank(b))
    .filter((product, index, list) => list.findIndex((other) => family(other) === family(product)) === index)
    .slice(0, 8)
  const heroPhotos = favourites.slice(0, 3)

  const orderCta = isCustomer
    ? <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white shadow-lg shadow-crust-700/25 transition hover:-translate-y-0.5 hover:bg-crust-700">Order now</Link>
    : <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white shadow-lg shadow-crust-700/25 transition hover:-translate-y-0.5 hover:bg-crust-700">See today&apos;s menu</Link>

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden bg-cream-50">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-112 w-md rounded-full bg-butter-100" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-cream-200/70" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-7 sm:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <Eyebrow>Pecto&apos;s Bakery · Lucban, Quezon</Eyebrow>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.02] text-cocoa-900 sm:text-6xl lg:text-7xl">
              Warm bread,<br />
              <span className="italic text-crust-600">baked every morning.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-cocoa-700">
              Our own Broas, soft ensaymada, and pandesal straight from the oven. Order ahead and pick it up at the bakery, or have it delivered anywhere in Lucban.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {orderCta}
              {!user && (
                <button type="button" onClick={openLogin} className="inline-flex min-h-12 items-center rounded-full bg-white px-7 text-base font-bold text-cocoa-900 ring-1 ring-cream-300 transition hover:bg-cream-100">Sign in to order</button>
              )}
              {user && !isCustomer && (
                <Link to="/dashboard" className="inline-flex min-h-12 items-center rounded-full bg-white px-7 text-base font-bold text-cocoa-900 ring-1 ring-cream-300 transition hover:bg-cream-100">Go to dashboard</Link>
              )}
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm font-bold text-cocoa-700">
              <li className="flex items-center gap-2"><LineIcon name="oven" className="h-5 w-5 text-crust-500" />Baked in-house</li>
              <li className="flex items-center gap-2"><LineIcon name="pickup" className="h-5 w-5 text-crust-500" />Pickup ready on time</li>
              <li className="flex items-center gap-2"><LineIcon name="delivery" className="h-5 w-5 text-crust-500" />Delivery within Lucban</li>
            </ul>
          </div>

          <HeroCollage photos={heroPhotos} loading={loading} />
        </div>
        <ScallopEdge className="text-cream-100" />
      </section>

      {/* ---- Shop by category ---- */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-7">
        <SectionHeading eyebrow="From our counter" title="Shop by category" action={<Link to="/menu" className="text-sm font-bold text-crust-600 hover:underline">Full menu →</Link>} />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-5">
          {loading
            ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="aspect-4/5 animate-pulse rounded-[1.75rem] bg-cream-200" />)
            : sections.map(({ category, items }) => {
              const cover = items.find((item) => item.imageUrl)
              return (
                <Link key={category.id} to={`/menu#${sectionAnchor(category.id)}`} className="group relative aspect-4/5 overflow-hidden rounded-[1.75rem] bg-cream-200 shadow-[0_10px_30px_-12px_rgb(58_35_20/0.35)]">
                  {cover && <img src={cover.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
                  <span className="absolute inset-0 bg-linear-to-t from-cocoa-900/85 via-cocoa-900/20 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                    <span className="block font-display text-xl font-semibold leading-tight text-cream-50 sm:text-2xl">{category.name}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-butter-300">{items.length} item{items.length === 1 ? '' : 's'} · Shop →</span>
                  </span>
                </Link>
              )
            })}
        </div>
      </section>

      {/* ---- Most loved ---- */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-7">
        <SectionHeading eyebrow="Bestsellers" title="Most loved picks" lead="The ones Lucban keeps coming back for — tap any to find it on the menu." />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-3/4 animate-pulse rounded-[1.75rem] bg-cream-200" />)
            : favourites.map((product) => (
              <ProductCard key={product.id} product={product} mode="link" onOpen={() => navigate(`/menu#${sectionAnchor(product.categoryId)}`)} />
            ))}
        </div>
      </section>

      {/* ---- How to get it ---- */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-7">
        <SectionHeading eyebrow="Your way" title="Fresh to you, however you like" center />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ServiceCard icon="pickup" title="Pickup" text="Order online and collect at 93 Quezon Avenue — ready when you said." />
          <ServiceCard icon="delivery" title="Delivery" text="We bring it to your door anywhere within Lucban." />
          <ServiceCard icon="clock" title="Order ahead" text="Pick a time up to 30 days ahead for breakfasts, meetings and merienda." />
          <ServiceCard icon="bulk" title="Big orders" text="Fiestas, pasalubong and parties — large orders are reviewed and confirmed by the bakery." />
        </div>
      </section>

      {/* ---- Story ---- */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-7">
        <div className="grid overflow-hidden rounded-4xl bg-cocoa-900 text-cream-100 lg:grid-cols-2">
          <div className="relative min-h-72 bg-cocoa-700">
            {heroPhotos[0] && <img src={heroPhotos[0].imageUrl} alt={heroPhotos[0].name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
          </div>
          <div className="p-8 sm:p-12">
            <Eyebrow className="text-butter-300">Our signature</Eyebrow>
            <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-cream-50 sm:text-5xl">Broas, the Lucban way.</h2>
            <p className="mt-5 text-base leading-7 text-cream-200">
              Light, crisp ladyfinger biscuits — the taste of Lucban that families carry home as pasalubong. From a single pack to the gallon tin for the fiesta, baked the same way it always has been.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-butter-400 px-7 text-base font-bold text-cocoa-900 transition hover:bg-butter-300">Order Broas</Link>
              <Link to="/about" className="inline-flex min-h-12 items-center rounded-full px-7 text-base font-bold text-cream-50 ring-1 ring-cream-50/40 transition hover:bg-cream-50/10">Our story</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Fiesta / bulk CTA ---- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-7">
        <div className="relative overflow-hidden rounded-4xl bg-butter-100 px-6 py-10 text-center ring-1 ring-butter-300 sm:px-12">
          <WheatSprig className="mx-auto h-10 w-10 text-crust-500" />
          <h2 className="mt-3 font-display text-3xl font-bold text-cocoa-900 sm:text-4xl">Planning a fiesta or a big merienda?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-cocoa-700">Order by the tray or the gallon tin. Large orders are checked by the bakery first, so we can promise they will be ready on time.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {isCustomer
              ? <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white transition hover:bg-crust-700">Start an order</Link>
              : <button type="button" onClick={user ? () => navigate('/menu') : openLogin} className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white transition hover:bg-crust-700">{user ? 'See the menu' : 'Sign in to order'}</button>}
            <a href="tel:0425404366" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-7 text-base font-bold text-cocoa-900 ring-1 ring-cream-300 transition hover:bg-cream-50">
              <LineIcon name="phone" className="h-5 w-5 text-crust-600" />(042) 540-4366
            </a>
          </div>
        </div>
      </section>
    </>
  )
}

// Three photos in arched frames, like loaves on a shelf. Falls back to
// warm blank frames while loading or when there are no photos.
function HeroCollage({ photos, loading }) {
  const frame = 'overflow-hidden bg-cream-200 shadow-[0_20px_50px_-20px_rgb(58_35_20/0.45)] ring-4 ring-white'
  const img = (photo) => (photo && !loading ? <img src={photo.imageUrl} alt={photo.name} className="h-full w-full object-cover" /> : null)
  return (
    <div className="relative mx-auto grid w-full max-w-xl grid-cols-2 gap-4 sm:gap-5">
      <div className={`${frame} row-span-2 aspect-3/5 rounded-t-full rounded-b-4xl`}>{img(photos[0])}</div>
      <div className={`${frame} aspect-square rounded-4xl`}>{img(photos[1])}</div>
      <div className={`${frame} aspect-square rounded-b-full rounded-t-4xl`}>{img(photos[2])}</div>
      <div className="absolute -left-3 bottom-8 -rotate-6 rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-cream-200 sm:-left-8">
        <p className="font-display text-lg font-bold leading-none text-crust-600">Fresh today</p>
        <p className="mt-1 text-xs font-bold text-cocoa-500">Open from 6 AM, Mon–Sat</p>
      </div>
      <div className="absolute -right-2 -top-4 grid h-24 w-24 rotate-12 place-items-center rounded-full bg-butter-400 text-center shadow-lg ring-4 ring-white sm:-right-6">
        <span className="font-display text-sm font-bold leading-tight text-cocoa-900">Lucban&apos;s<br />best</span>
      </div>
    </div>
  )
}

function SectionHeading({ eyebrow, title, lead, action, center = false }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${center ? 'flex-col items-center text-center' : ''}`}>
      <div className={center ? 'flex flex-col items-center' : ''}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-3 font-display text-4xl font-bold text-cocoa-900 sm:text-5xl">{title}</h2>
        {lead && <p className="mt-3 max-w-2xl text-base text-cocoa-500">{lead}</p>}
      </div>
      {action}
    </div>
  )
}

function ServiceCard({ icon, title, text }) {
  return (
    <div className="rounded-[1.75rem] bg-white p-6 ring-1 ring-cream-200 transition hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgb(58_35_20/0.35)]">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-cream-100 text-crust-600 ring-1 ring-cream-300">
        <LineIcon name={icon} className="h-7 w-7" />
      </span>
      <h3 className="mt-5 font-display text-2xl font-semibold text-cocoa-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-cocoa-500">{text}</p>
    </div>
  )
}
