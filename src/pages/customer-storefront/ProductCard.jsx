import { useState } from 'react'
import { formatPeso } from '../../lib/format.js'

// One product card for every storefront list — Home's "Most loved", the
// guest Menu and the customer Menu. Photo first and large, because a
// bakery sells with its bread; name in the display serif; price in the
// crust colour. What the card lets a visitor DO depends on `mode`:
//
//   guest     "Sign in to order" (STOREFRONT_PLAN.md Decision 3)
//   customer  Add to cart, one at a time; the amount is changed in the
//             cart (the panel, 2026-10-26; MINOR_REVISIONS_PLAN.md M5)
//   link      the whole card links to the Menu (Home's showcase)
export function ProductCard({ product, mode = 'guest', onSignIn, onAdd, onOpen }) {
  const [added, setAdded] = useState(false)
  // Sold out is a fact about stock, not a choice about the catalogue: the
  // card stays visible so the customer knows it exists, but cannot be
  // added — checkout would only refuse it (routes/orders.js stock guard).
  const soldOut = product.inStock === false

  const handleAdd = () => {
    if (soldOut) return
    onAdd(product.id, 1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  const photo = (
    <div className="relative aspect-square overflow-hidden rounded-t-[1.75rem] bg-cream-200">
      {product.imageUrl
        ? <img src={product.imageUrl} alt={product.name} loading="lazy" className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${soldOut ? 'grayscale-[60%]' : ''}`} />
        : <div className="grid h-full w-full place-items-center text-6xl" aria-hidden="true">🥖</div>}
      {product.variant && (
        <span className="absolute left-3 top-3 rounded-full bg-cream-50/95 px-3 py-1 text-[11px] font-bold text-cocoa-700 shadow-sm">{product.variant}</span>
      )}
      {soldOut && (
        <span className="absolute right-3 top-3 rounded-full bg-cocoa-900/85 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-cream-50">Sold out</span>
      )}
    </div>
  )

  const body = (
    <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
      <h3 className="font-display text-lg font-semibold leading-snug text-cocoa-900 sm:text-xl">{product.name}</h3>
      {product.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-cocoa-500 sm:text-sm">{product.description}</p>}
      <div className="mt-auto pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-xl font-bold text-crust-600">{formatPeso(product.price)}</p>
          {/* How many are left (MINOR_REVISIONS_PLAN.md M6); live. */}
          {product.stockLeft != null && (
            <p className={`text-xs font-bold ${soldOut ? 'text-cocoa-500' : 'text-leaf-600'}`}>{soldOut ? 'Sold out' : `${product.stockLeft} left`}</p>
          )}
        </div>
        {mode === 'guest' && (
          <button type="button" onClick={onSignIn} className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-full bg-crust-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-crust-700">
            Sign in to order
          </button>
        )}
        {mode === 'customer' && (
          <button type="button" disabled={soldOut} onClick={handleAdd} className={`mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-full px-3 text-sm font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-cocoa-500/40 ${added ? 'bg-leaf-600' : 'bg-crust-600 hover:bg-crust-700'}`}>
            {soldOut ? 'Sold out' : added ? 'Added ✓' : 'Add to cart'}
          </button>
        )}
      </div>
    </div>
  )

  const shell = 'group flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-[0_2px_0_rgb(58_35_20/0.06),0_10px_30px_-12px_rgb(58_35_20/0.25)] ring-1 ring-cream-200 transition duration-300 hover:-translate-y-1 hover:shadow-[0_2px_0_rgb(58_35_20/0.06),0_18px_40px_-14px_rgb(58_35_20/0.35)]'

  if (mode === 'link') {
    return (
      <button type="button" onClick={onOpen} className={`${shell} text-left`} aria-label={`${product.name}${product.variant ? `, ${product.variant}` : ''} — see it on the menu`}>
        {photo}
        {body}
      </button>
    )
  }
  return <article className={shell}>{photo}{body}</article>
}
