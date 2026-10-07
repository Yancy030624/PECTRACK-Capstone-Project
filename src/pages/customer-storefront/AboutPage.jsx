import { Link } from 'react-router-dom'
import heritagePhoto from '../../assets/about/heritage-storefront.jpg'
import missionPhoto from '../../assets/about/mission-oven.jpg'
import visionPhoto from '../../assets/about/vision-baker.jpg'
import { Eyebrow, ScallopEdge, WheatSprig } from '../../components/storefront/Decor.jsx'

// Our Story. Layout and words from the bakery's own About page: the old
// storefront and the founding line, the heritage story, then mission and
// vision beside photos of the oven. Colours are the storefront's own
// (cream, crust, cocoa). The three photos are the bakery's.
export function AboutPage() {
  return (
    <>
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden bg-cream-50">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-butter-100" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-7 sm:py-20 lg:grid-cols-2">
          <div>
            <Eyebrow>Est. 1947 · Lucban, Quezon</Eyebrow>
            <h1 className="mt-5 font-display text-5xl font-bold leading-tight text-cocoa-900 sm:text-6xl">Pecto&apos;s Bakery</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-cocoa-700">
              Pecto&apos;s Bakery is a proudly homegrown bakery in Lucban, Quezon, bringing traditional Filipino baked goods to every household, every fiesta, every day.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/menu" className="inline-flex min-h-12 items-center rounded-full bg-crust-600 px-7 text-base font-bold text-white shadow-lg shadow-crust-700/25 transition hover:-translate-y-0.5 hover:bg-crust-700">Explore our menu</Link>
              <Link to="/contact" className="inline-flex min-h-12 items-center rounded-full bg-white px-7 text-base font-bold text-cocoa-900 ring-1 ring-cream-300 transition hover:bg-cream-100">Visit us</Link>
            </div>
          </div>
          <figure className="mx-auto w-full max-w-md lg:max-w-lg">
            <div className="overflow-hidden rounded-4xl bg-cream-200 shadow-[0_20px_50px_-20px_rgb(58_35_20/0.45)] ring-4 ring-white">
              <img src={heritagePhoto} alt="The old Pecto's Bakery storefront in Lucban" className="aspect-6/5 h-full w-full object-cover" />
            </div>
            <figcaption className="mt-3 text-center text-sm text-cocoa-500">Where it all began — the first Pecto&apos;s Bakery in Lucban.</figcaption>
          </figure>
        </div>
        <ScallopEdge className="text-cream-100" />
      </section>

      {/* ---- Heritage ---- */}
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-7 sm:py-20">
        <div className="flex justify-center"><Eyebrow>Our heritage</Eyebrow></div>
        <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-cocoa-900 sm:text-5xl">Baking traditions, one loaf at a time</h2>
        <div className="mt-8 space-y-6 text-base leading-8 text-cocoa-700 sm:text-lg">
          <p>
            Pecto&apos;s Bakery was built on a simple belief: that the warmth of freshly baked bread can bring people together — family, neighbors, and friends. We believe that great baked goods aren&apos;t just food — they&apos;re a moment of comfort, right when you need it. But that kind of warmth shouldn&apos;t be hard to find or come at a high price. That&apos;s why we built a bakery that&apos;s always fresh, always welcoming, and always affordable — without compromising on quality and taste.
          </p>
          <p>
            With our bakery right in the heart of Lucban and a menu crafted from generations-old recipes using locally sourced ingredients, Pecto&apos;s Bakery is made to be part of your every day, not just the special fiestas.
          </p>
          <p>
            No pretension. No shortcuts. Just great bread made for everyone. Because everybody deserves great baked goods. And that&apos;s why no matter how we grow, our purpose will always stay the same: to bring warmth to everyone, everywhere — one loaf at a time.
          </p>
        </div>
        <div className="mt-10 flex items-center justify-center gap-3 text-crust-500" aria-hidden="true">
          <span className="h-px w-16 bg-cream-300" />
          <WheatSprig className="h-6 w-6" />
          <span className="h-px w-16 bg-cream-300" />
        </div>
      </section>

      {/* ---- Mission and vision ---- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-7">
        <div className="overflow-hidden rounded-4xl bg-cocoa-900 text-cream-100">
          <StoryRow
            eyebrow="Heart & soul"
            title="Our mission"
            text="Bring warmth to every Filipino home with fresh, delicious, and surprisingly affordable baked goods, everywhere — one loaf at a time."
            photo={missionPhoto}
            alt="Loaves going into the Pecto's Bakery brick oven"
          />
          <StoryRow
            eyebrow="The horizon"
            title="Our vision"
            text="To be the most loved neighborhood bakery brand in the Philippines, creating heartwarming experiences through quality, tradition, and exceptional value."
            photo={visionPhoto}
            alt="A Pecto's baker taking a fresh tray out of the oven"
            photoFirst
          />
        </div>
      </section>
    </>
  )
}

// One half text, one half photo; `photoFirst` puts the photo on the left
// on wide screens, so the two rows alternate the way the bakery's page does.
function StoryRow({ eyebrow, title, text, photo, alt, photoFirst = false }) {
  return (
    <div className="grid lg:grid-cols-2">
      <div className={`flex flex-col justify-center p-8 sm:p-12 lg:p-16 ${photoFirst ? 'lg:order-2' : ''}`}>
        <Eyebrow className="text-butter-300">{eyebrow}</Eyebrow>
        <h2 className="mt-4 font-display text-4xl font-bold text-cream-50 sm:text-5xl">{title}</h2>
        <p className="mt-5 max-w-lg text-lg leading-8 text-cream-200">{text}</p>
      </div>
      <div className={`relative min-h-72 bg-cocoa-700 sm:min-h-96 ${photoFirst ? 'lg:order-1' : ''}`}>
        <img src={photo} alt={alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    </div>
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
