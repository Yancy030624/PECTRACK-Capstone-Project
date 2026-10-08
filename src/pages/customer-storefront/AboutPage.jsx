import { Link } from 'react-router-dom'
import heritagePhoto from '../../assets/about/heritage-storefront.jpg'
import ovenPhoto from '../../assets/about/mission-oven.jpg'
import bakerPhoto from '../../assets/about/vision-baker.jpg'
import guestsPhoto from '../../assets/about/visit-guests.jpg'
import tvPhoto from '../../assets/about/visit-tv-feature.jpg'
import { Eyebrow, LineIcon, ScallopEdge, WheatSprig } from '../../components/storefront/Decor.jsx'
import { bakery } from '../../lib/bakery.js'

// Our Story. Words from the bakery's own About page, laid out so no
// section is a column of text with empty space either side: the founding
// photo beside the intro, the heritage story beside the oven photos,
// the visitors, then what the bakery stands for. Colours are the
// storefront's own (cream, crust, cocoa); every photo is the bakery's.
export function AboutPage() {
  return (
    <>
      {/* ---- Hero: the first storefront ---- */}
      <section className="relative overflow-hidden bg-cream-50">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -bottom-32 h-80 w-80 rounded-full bg-butter-100" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-7 sm:py-20 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <Eyebrow>Est. 1947 · Lucban, Quezon</Eyebrow>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] text-cocoa-900 sm:text-6xl lg:text-7xl">
              Pecto&apos;s Bakery<span className="mt-2 block text-3xl italic text-crust-600 sm:text-4xl">since 1947</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-cocoa-700">
              Pecto&apos;s Bakery is a proudly homegrown bakery in Lucban, Quezon, bringing traditional Filipino baked goods to every household, every fiesta, every day.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white shadow-lg shadow-crust-700/25 transition hover:-translate-y-0.5 hover:bg-crust-700">Explore our menu</Link>
              <Link to="/contact" className="inline-flex min-h-12 items-center rounded-full bg-white px-7 text-base font-bold text-cocoa-900 ring-1 ring-cream-300 transition hover:bg-cream-100">Visit us</Link>
            </div>
            <dl className="mt-10 grid max-w-xl grid-cols-3 divide-x divide-cream-300 rounded-[1.75rem] bg-white py-5 ring-1 ring-cream-200">
              <Fact value="1947" label="Baking since" />
              <Fact value="Lucban" label="Quezon, our home" />
              <Fact value={bakery.hours.opens} label="Fresh every morning" />
            </dl>
          </div>
          <figure className="relative mx-auto w-full max-w-xl">
            {/* A butter block behind the photo, offset, so the frame sits
                on something instead of floating in empty cream. */}
            <div aria-hidden="true" className="absolute -right-4 -top-4 h-full w-full rounded-4xl bg-butter-300/70 sm:-right-6 sm:-top-6" />
            <div className="relative overflow-hidden rounded-4xl bg-cream-200 shadow-[0_24px_60px_-24px_rgb(58_35_20/0.55)] ring-4 ring-white">
              <img src={heritagePhoto} alt="The first Pecto's Bakery storefront in Lucban" className="aspect-5/4 w-full object-cover" />
            </div>
            <figcaption className="absolute -bottom-6 left-6 -rotate-3 rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-cream-200">
              <span className="block font-display text-lg font-bold leading-none text-crust-600">Where it began</span>
              <span className="mt-1 block text-xs font-bold text-cocoa-500">Our first store, Lucban</span>
            </figcaption>
          </figure>
        </div>
        <ScallopEdge className="text-cream-100" />
      </section>

      {/* ---- Heritage: story beside the oven ---- */}
      <section className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-7 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Eyebrow>Our heritage</Eyebrow>
          <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-cocoa-900 sm:text-5xl">Baking traditions, one loaf at a time</h2>
          <div className="mt-7 space-y-5 text-base leading-8 text-cocoa-700 sm:text-lg">
            <p>
              Pecto&apos;s Bakery was built on a simple belief: that the warmth of freshly baked bread can bring people together — family, neighbors, and friends. We believe that great baked goods aren&apos;t just food — they&apos;re a moment of comfort, right when you need it.
            </p>
            <p>
              But that kind of warmth shouldn&apos;t be hard to find or come at a high price. That&apos;s why we built a bakery that&apos;s always fresh, always welcoming, and always affordable — without compromising on quality and taste.
            </p>
            <p>
              With our bakery right in the heart of Lucban and a menu crafted from generations-old recipes using locally sourced ingredients, Pecto&apos;s Bakery is made to be part of your every day, not just the special fiestas.
            </p>
          </div>
          <blockquote className="mt-8 border-l-4 border-crust-500 pl-5">
            <p className="font-display text-2xl italic leading-snug text-cocoa-900 sm:text-3xl">&ldquo;No pretension. No shortcuts. Just great bread made for everyone.&rdquo;</p>
          </blockquote>
        </div>
        {/* Two photos overlapping, oven behind and baker in front, with a
            small cocoa label in the corner they leave free. */}
        <div className="relative mx-auto aspect-50/51 w-full max-w-xl">
          <figure className="absolute left-0 top-0 h-[62%] w-[84%] overflow-hidden rounded-4xl bg-cocoa-700 shadow-[0_24px_60px_-24px_rgb(58_35_20/0.55)]">
            <img src={ovenPhoto} alt="Loaves going into the Pecto's Bakery brick oven" loading="lazy" className="h-full w-full object-cover" />
          </figure>
          <figure className="absolute bottom-0 right-0 h-[52%] w-[66%] overflow-hidden rounded-4xl bg-cocoa-700 shadow-[0_24px_60px_-24px_rgb(58_35_20/0.55)] ring-[6px] ring-cream-100">
            <img src={bakerPhoto} alt="A Pecto's baker taking a fresh tray out of the oven" loading="lazy" className="h-full w-full object-cover object-left" />
          </figure>
          <div className="absolute bottom-[8%] left-0 w-[30%] rounded-3xl bg-cocoa-900 p-4 text-cream-50 shadow-lg sm:p-5">
            <WheatSprig className="h-7 w-7 text-butter-400" />
            <p className="mt-2 font-display text-base font-bold leading-tight sm:text-lg">Brick oven, every morning</p>
          </div>
        </div>
      </section>

      {/* ---- Visitors ---- */}
      <section className="relative overflow-hidden bg-butter-100 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-7">
          <div className="mx-auto max-w-2xl text-center">
            <div className="flex justify-center"><Eyebrow>Visitors &amp; features</Eyebrow></div>
            <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-cocoa-900 sm:text-5xl">Familiar faces, same warm bread</h2>
            <p className="mt-4 text-lg leading-8 text-cocoa-700">Over the years, Filipino celebrities and TV crews have stopped by our Lucban store — and like everyone else, they leave with Broas and pasalubong for the road.</p>
          </div>
          <div className="mt-12 grid items-start gap-10 md:grid-cols-2 md:gap-8 lg:gap-14">
            <Snapshot photo={tvPhoto} alt="A TV crew filming a feature inside the Pecto's Bakery store" caption="On camera at the counter — a TV feature filmed in our store." tilt="-rotate-2" />
            <Snapshot photo={guestsPhoto} alt="Celebrity guests holding Pecto's Broas and gift boxes in the store" caption="Leaving with Broas by the bag and the box." tilt="rotate-2 md:mt-10" />
          </div>
        </div>
      </section>

      {/* ---- What we stand for (replaces mission and vision) ---- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-7 sm:pt-20">
        <div className="rounded-4xl bg-cocoa-900 px-6 py-12 text-cream-100 sm:px-12 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <Eyebrow className="text-butter-300">What we stand for</Eyebrow>
              <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-cream-50 sm:text-5xl">Warmth for everyone, everywhere</h2>
              <p className="mt-4 text-lg leading-8 text-cream-200">No matter how we grow, our purpose stays the same: to bring warmth to everyone, everywhere — one loaf at a time.</p>
            </div>
            <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-butter-400 px-7 text-base font-bold text-cocoa-900 transition hover:bg-butter-300">Taste it for yourself</Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Value icon="oven" title="Always fresh" text="Baked in our own brick oven every morning, never shipped in." />
            <Value icon="heart" title="Always welcoming" text="A neighborhood bakery for family, neighbors and friends." />
            <Value icon="tag" title="Always affordable" text="Great baked goods at prices everyone can come back for." />
            <Value icon="pin" title="Made in Lucban" text="Generations-old recipes and locally sourced ingredients." />
          </div>
        </div>
      </section>
    </>
  )
}

function Fact({ value, label }) {
  return (
    <div className="px-3 text-center">
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block font-display text-2xl font-bold text-crust-600 sm:text-3xl">{value}</span>
        <span className="mt-1 block text-xs font-bold text-cocoa-500 sm:text-sm">{label}</span>
      </dd>
    </div>
  )
}

function Value({ icon, title, text }) {
  return (
    <div className="rounded-[1.75rem] bg-cream-50/5 p-6 ring-1 ring-cream-50/10 transition hover:bg-cream-50/10">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-butter-400 text-cocoa-900"><LineIcon name={icon} className="h-6 w-6" /></span>
      <h3 className="mt-5 font-display text-2xl font-semibold text-cream-50">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-cream-200">{text}</p>
    </div>
  )
}

// A photo pinned to the page like a snapshot: white border, a strip of
// tape, a slight tilt that straightens on hover, and a caption beneath.
function Snapshot({ photo, alt, caption, tilt }) {
  return (
    <figure className={`relative mx-auto w-full max-w-xl bg-white p-3 pb-5 shadow-[0_20px_45px_-18px_rgb(58_35_20/0.45)] transition duration-300 hover:rotate-0 sm:p-4 sm:pb-6 ${tilt}`}>
      <span aria-hidden="true" className="absolute -top-3 left-1/2 h-7 w-28 -translate-x-1/2 -rotate-3 bg-butter-300/80 shadow-sm" />
      <img src={photo} alt={alt} loading="lazy" className="aspect-4/3 w-full object-cover" />
      <figcaption className="mt-4 text-center font-display text-lg italic text-cocoa-700">{caption}</figcaption>
    </figure>
  )
}

// The cream banner the Visit Us page opens with.
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
