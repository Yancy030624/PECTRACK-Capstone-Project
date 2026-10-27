import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import broasBasket from '../../assets/home/broas-basket.jpg'
import custardPie from '../../assets/home/custard-pie.jpg'
import giantChef from '../../assets/home/giant-chef.jpg'
import heroBasket from '../../assets/home/hero-broas-basket.jpg'
import { Eyebrow, LineIcon, ScallopEdge } from '../../components/storefront/Decor.jsx'
import { bakery, bakeryAddress, bakeryMapsUrl, telHref } from '../../lib/bakery.js'
import { ProductCard } from './ProductCard.jsx'
import { sectionAnchor, useMenuData } from './useMenuData.js'

// The storefront's front window. Laid out the way a bakery site sells —
// Conti's was the reference the adviser gave: a warm photo-led hero, the
// counter by category, the most-loved items, how to get them, the story,
// and a nudge toward big orders for fiestas and pasalubong.
//
// The big photographs are the bakery's own product photography (by
// Lorenz Panganiban, Louie Ongkeko and Kel Gundran, credited on the
// page). Everything else — category tiles, most-loved picks, prices,
// counts — is the live catalogue from /api/products, so nothing goes
// stale when the menu changes.

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

  const orderCta = isCustomer
    ? <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white shadow-lg shadow-crust-700/25 transition hover:-translate-y-0.5 hover:bg-crust-700">Order now</Link>
    : <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white shadow-lg shadow-crust-700/25 transition hover:-translate-y-0.5 hover:bg-crust-700">See today&apos;s menu</Link>

  return (
    <>
      {/* ---- Hero ----
          The photograph is mostly black on the left, so the words sit on
          it directly; a gradient keeps them readable where the basket
          reaches across on narrow screens. */}
      <section className="relative isolate overflow-hidden bg-[#0d0a08] text-cream-50">
        {/* On wide screens the photograph takes the right part only, so the
            basket sits beside the words, not behind them; on a phone it
            fills the hero, dimmed. */}
        <img src={heroBasket} alt="A hand holding out a basket of Pecto's Broas" className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-[70%_center] lg:w-[68%] lg:object-center" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-r from-[#0d0a08] via-[#0d0a08]/85 to-transparent lg:from-[#0d0a08] lg:from-35% lg:via-[#0d0a08]/40 lg:via-50%" />
        <div className="mx-auto flex max-w-7xl flex-col justify-center px-4 py-8 sm:py-20 sm:min-h-[38rem] sm:px-7 lg:min-h-[42rem]">
          <div className="max-w-xl">
            <Eyebrow className="text-butter-300">Lucban&apos;s Best Delicacies · Since 1947</Eyebrow>
            <h1 className="mt-3 font-display text-4xl sm:mt-5 font-bold leading-[1.08] min-[400px]:text-5xl sm:text-6xl lg:text-7xl">
              Warm bread,<br />
              <span className="italic text-butter-300">baked every morning.</span>
            </h1>
            <p className="mt-4 text-base leading-7 text-cream-200 sm:mt-6 sm:text-lg sm:leading-8">
              Broas, ensaymada and pandesal, baked fresh in Lucban. Order ahead for bakery pickup or delivery within Lucban.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
              {orderCta}
              {!user && (
                <button type="button" onClick={openLogin} className="inline-flex min-h-12 items-center rounded-full px-7 text-base font-bold text-cream-50 ring-1 ring-cream-50/50 transition hover:bg-cream-50/10">Sign in to order</button>
              )}
              {user && !isCustomer && (
                <Link to="/dashboard" className="inline-flex min-h-12 items-center rounded-full px-7 text-base font-bold text-cream-50 ring-1 ring-cream-50/50 transition hover:bg-cream-50/10">Go to dashboard</Link>
              )}
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-cream-100 sm:mt-10 sm:gap-x-7 sm:gap-y-3 sm:text-sm">
              <li className="flex items-center gap-2"><LineIcon name="oven" className="h-5 w-5 text-butter-400" />Baked in-house</li>
              <li className="flex items-center gap-2"><LineIcon name="pickup" className="h-5 w-5 text-butter-400" />Pickup ready on time</li>
              <li className="flex items-center gap-2"><LineIcon name="delivery" className="h-5 w-5 text-butter-400" />Delivery within Lucban</li>
            </ul>
          </div>
        </div>
        <ScallopEdge className="absolute inset-x-0 bottom-0 text-cream-100" />
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
        <SectionHeading eyebrow="From our bakery" title="Bakery favorites" lead="A selection of our signature breads and pastries — tap any to find it on the menu." />
        <div className="mt-8 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:gap-6 lg:grid-cols-4">
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
          <ServiceCard icon="pickup" title="Pickup" text={`Order online and collect at ${bakery.street} — ready when you said.`} />
          <ServiceCard icon="delivery" title="Delivery" text="We bring it to your door anywhere within Lucban." />
          <ServiceCard icon="clock" title="Order ahead" text="Pick a time up to 30 days ahead for breakfasts, meetings and merienda." />
          <ServiceCard icon="bulk" title="Big orders" text="Fiestas, pasalubong and parties — order ahead and choose the day and time you need it." />
        </div>
      </section>

      {/* ---- Story ---- */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-7">
        <div className="grid overflow-hidden rounded-4xl bg-cocoa-900 text-cream-100 lg:grid-cols-2">
          <div className="relative min-h-96 bg-[#2a2826] lg:min-h-[34rem]">
            <img src={broasBasket} alt="A basket of Pecto's Broas, Lucban's ladyfinger biscuit" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" />
          </div>
          <div className="p-8 sm:p-12">
            <Eyebrow className="text-butter-300">Our signature</Eyebrow>
            <h2 className="mt-4 font-display text-3xl font-bold min-[400px]:text-4xl leading-tight text-cream-50 sm:text-5xl">Broas, the Lucban way.</h2>
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

      {/* ---- Fiesta / bulk CTA, over the custard pie ---- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-7">
        <div className="relative isolate overflow-hidden rounded-4xl bg-[#0b0806] text-cream-50">
          <img src={custardPie} alt="A golden custard pie fresh from the oven" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover object-right" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-r from-[#0b0806] via-[#0b0806]/80 to-transparent" />
          <div className="max-w-xl px-6 py-14 sm:px-12 sm:py-20">
            <Eyebrow className="text-butter-300">Fiestas &amp; pasalubong</Eyebrow>
            <h2 className="mt-4 font-display text-3xl font-bold min-[400px]:text-4xl leading-tight sm:text-5xl">Planning a fiesta or a big merienda?</h2>
            <p className="mt-4 text-lg leading-8 text-cream-200">Order by the tray or the gallon tin, up to 30 days ahead, and pick the day and time you need it ready.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isCustomer
                ? <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-butter-400 px-7 text-base font-bold text-cocoa-900 transition hover:bg-butter-300">Start an order</Link>
                : <button type="button" onClick={user ? () => navigate('/menu') : openLogin} className="inline-flex min-h-12 items-center rounded-full bg-butter-400 px-7 text-base font-bold text-cocoa-900 transition hover:bg-butter-300">{user ? 'See the menu' : 'Sign in to order'}</button>}
              <a href={telHref(bakery.phones[0])} className="inline-flex min-h-12 items-center gap-2 rounded-full px-7 text-base font-bold text-cream-50 ring-1 ring-cream-50/50 transition hover:bg-cream-50/10">
                <LineIcon name="phone" className="h-5 w-5 text-butter-300" />{bakery.phones[0]}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Find us: the giant chef out front ---- */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-7">
        <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <figure className="relative mx-auto w-full max-w-sm">
            <div className="overflow-hidden rounded-t-full rounded-b-4xl bg-cream-200 shadow-[0_20px_50px_-20px_rgb(58_35_20/0.45)] ring-4 ring-white">
              <img src={giantChef} alt="The giant Pecto's chef standing outside the bakery" loading="lazy" className="aspect-3/5 w-full object-cover object-top" />
            </div>
            <span className="absolute right-2 top-10 rotate-6 rounded-2xl bg-butter-400 px-4 py-2 font-display text-base font-bold text-cocoa-900 shadow-lg sm:-right-8">Say hi to our chef!</span>
          </figure>
          <div>
            <Eyebrow>Visit the bakery</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold min-[400px]:text-4xl leading-tight text-cocoa-900 sm:text-5xl">Look for the giant chef on Quezon Avenue</h2>
            <p className="mt-4 max-w-xl text-lg leading-8 text-cocoa-700">You can&apos;t miss us — our chef stands guard right outside the door. Come in for the full counter, warm from the oven, and pasalubong to take home.</p>
            <dl className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.75rem] bg-white p-5 ring-1 ring-cream-200">
                <dt className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa-900"><LineIcon name="pin" className="h-5 w-5 text-crust-600" />Address</dt>
                <dd className="mt-1 text-cocoa-700">{bakeryAddress}</dd>
              </div>
              <div className="rounded-[1.75rem] bg-white p-5 ring-1 ring-cream-200">
                <dt className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa-900"><LineIcon name="clock" className="h-5 w-5 text-crust-600" />Open</dt>
                <dd className="mt-1 text-cocoa-700">{bakery.hours.days}, {bakery.hours.time}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={bakeryMapsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white transition hover:bg-crust-700">Get directions</a>
              <Link to="/about" className="inline-flex min-h-12 items-center rounded-full bg-white px-7 text-base font-bold text-cocoa-900 ring-1 ring-cream-300 transition hover:bg-cream-50">Our story</Link>
            </div>
          </div>
        </div>
        <p className="mt-14 text-center text-xs text-cocoa-500">Product photography by Lorenz Panganiban, Louie Ongkeko and Kel Gundran.</p>
      </section>
    </>
  )
}

function SectionHeading({ eyebrow, title, lead, action, center = false }) {
  return (
    // Centred and side-by-side are two separate class sets: putting
    // items-center next to items-end let the stylesheet's order decide,
    // and the centred heading sat to one side (the user, 2026-10-22).
    <div className={center ? 'flex flex-col items-center gap-4 text-center' : 'flex flex-wrap items-end justify-between gap-4'}>
      <div className={center ? 'flex w-full flex-col items-center' : ''}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-3 font-display text-3xl font-bold min-[400px]:text-4xl text-cocoa-900 sm:text-5xl">{title}</h2>
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
