import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCart } from '../../cart/CartContext.jsx'
import { MenuLayout } from './MenuLayout.jsx'
import { ProductCard } from './ProductCard.jsx'
import { useMenuData } from './useMenuData.js'

// The signed-in customer's Menu: everything PublicMenu shows, plus a name
// search and real ordering: Add to cart, which then shows the amount in the
// cart with − and + (the user, 2026-10-28). The header's
// search icon navigates here with ?focus=search, which just focuses the
// input below — the products are already all in memory, so filtering is a
// plain .filter() (Decision 9).
export function CustomerMenu() {
  const { loading, sections, message } = useMenuData()
  const { lines, addItem, setQuantity } = useCart()
  const inCart = new Map(lines.map((line) => [line.productId, line.quantity]))
  // The card's Add and its − / + change the same cart line the Cart shows;
  // the first Add creates it, and − at 1 removes it.
  const setCardQuantity = (productId, quantity) => (inCart.has(productId) ? setQuantity(productId, quantity) : addItem(productId, quantity))
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
    <MenuLayout
      loading={loading}
      sections={visibleSections}
      message={message}
      showChips={!term}
      emptyText={term ? `Nothing matches "${searchTerm.trim()}".` : 'Nothing is available right now — please check back soon.'}
      toolbar={
        <div className="relative mt-6 max-w-md">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cocoa-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" /></svg>
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search for pandesal, broas, ensaymada…"
            aria-label="Search the menu"
            className="w-full rounded-full border-0 bg-white py-3.5 pl-12 pr-4 text-base text-cocoa-900 shadow-sm ring-1 ring-cream-300 outline-none transition placeholder:text-cocoa-500/70 focus:ring-2 focus:ring-crust-500"
          />
        </div>
      }
      renderCard={(product) => <ProductCard product={product} mode="customer" cartQuantity={inCart.get(product.id) ?? 0} onSetQuantity={setCardQuantity} />}
    />
  )
}
