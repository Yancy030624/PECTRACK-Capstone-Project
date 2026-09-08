import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCart } from '../../cart/CartContext.jsx'
import { sectionAnchor, useMenuData } from './useMenuData.js'

// The signed-in customer's Menu: everything PublicMenu shows, plus a name
// search and real ordering (quantity stepper, Add to cart). The header's
// search icon navigates here with ?focus=search, which just focuses the
// input below rather than opening anything separate — the products are
// already all in memory, so filtering is a plain .filter() (Decision 9).
export function CustomerMenu() {
  const { loading, sections, message } = useMenuData()
  const { addItem } = useCart()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef(null)

  useEffect(() => {
    if (searchParams.get('focus') !== 'search') return
    searchInputRef.current?.focus()
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const term = searchTerm.trim().toLowerCase()
  const visibleSections = !term ? sections : sections
    .map((section) => ({ ...section, items: section.items.filter((item) => item.name.toLowerCase().includes(term)) }))
    .filter((section) => section.items.length > 0)

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-7">
      <p className="text-sm font-semibold text-green-700">OUR MENU</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Fresh from Pecto's oven</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-500">Everything currently available at the bakery, grouped the same way our counter is.</p>

      <div className="relative mt-6 max-w-sm">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" /></svg>
        <input ref={searchInputRef} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search the menu" aria-label="Search the menu" className="w-full rounded-full border border-green-100 bg-white py-2.5 pl-10 pr-4 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />
      </div>

      {message && <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}

      {!loading && !term && sections.length > 1 && (
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
      ) : visibleSections.length === 0 ? (
        <p className="mt-10 text-sm text-stone-500">{term ? `Nothing matches "${searchTerm.trim()}".` : 'Nothing is available right now — please check back soon.'}</p>
      ) : (
        visibleSections.map(({ category, items }) => (
          <div key={category.id} id={sectionAnchor(category.id)} className="scroll-mt-20 pt-10">
            <h2 className="text-xl font-bold text-stone-900">{category.name}</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((product) => <CustomerMenuCard key={product.id} product={product} onAdd={addItem} />)}
            </div>
          </div>
        ))
      )}
    </section>
  )
}

function CustomerMenuCard({ product, onAdd }) {
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const handleAdd = () => {
    onAdd(product.id, quantity)
    setQuantity(1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

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
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-full border border-green-100">
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="grid h-6 w-6 place-items-center text-xs font-bold text-green-800">−</button>
              <span className="w-4 text-center text-[11px] font-bold">{quantity}</span>
              <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="Increase quantity" className="grid h-6 w-6 place-items-center text-xs font-bold text-green-800">+</button>
            </div>
            <button type="button" onClick={handleAdd} className="whitespace-nowrap rounded-full bg-green-700 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800">{added ? 'Added ✓' : 'Add to cart'}</button>
          </div>
        </div>
      </div>
    </article>
  )
}
