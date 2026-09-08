import { sectionAnchor, useMenuData } from './useMenuData.js'

// What an anonymous visitor sees: browse everything, no quantity stepper,
// no cart — "Sign in to order" is the only thing a card lets them do
// (STOREFRONT_PLAN.md Decision 3). CustomerMenu.jsx is the signed-in
// counterpart with search and real ordering.
export function PublicMenu({ openLogin }) {
  const { loading, sections, message } = useMenuData()

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-7">
      <p className="text-sm font-semibold text-green-700">OUR MENU</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Fresh from Pecto's oven</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-500">Everything currently available at the bakery, grouped the same way our counter is.</p>

      {message && <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}

      {!loading && sections.length > 1 && (
        <nav aria-label="Jump to category" className="sticky top-0 z-10 -mx-4 mt-6 flex gap-2 overflow-x-auto border-y border-green-100 bg-[#f5f7f2]/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7">
          {sections.map(({ category }) => (
            <a key={category.id} href={`#${sectionAnchor(category.id)}`} className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-xs font-bold text-green-800 shadow-sm ring-1 ring-green-100 transition hover:bg-green-50">{category.name}</a>
          ))}
        </nav>
      )}

      {loading ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl bg-white/70" />)}
        </div>
      ) : sections.length === 0 ? (
        <p className="mt-10 text-sm text-stone-500">Nothing is available right now — please check back soon.</p>
      ) : (
        sections.map(({ category, items }) => (
          <div key={category.id} id={sectionAnchor(category.id)} className="scroll-mt-20 pt-10">
            <h2 className="text-xl font-bold text-stone-900">{category.name}</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((product) => <PublicMenuCard key={product.id} product={product} openLogin={openLogin} />)}
            </div>
          </div>
        ))
      )}
    </section>
  )
}

function PublicMenuCard({ product, openLogin }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-green-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="aspect-4/3 overflow-hidden bg-linear-to-br from-green-50 to-amber-50">
        {product.imageUrl
          ? <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
          : <div className="grid h-full w-full place-items-center text-5xl">🥐</div>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-bold text-stone-900">{product.name}</h3>
        {product.variant && <p className="text-xs font-semibold text-green-700">{product.variant}</p>}
        {product.description && <p className="mt-1 flex-1 text-xs text-stone-500">{product.description}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-lg font-extrabold text-green-800">₱{product.price}</span>
          <button type="button" onClick={openLogin} className="whitespace-nowrap rounded-full bg-green-700 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800">Sign in to order</button>
        </div>
      </div>
    </article>
  )
}
