import { useEffect, useState } from 'react'
import { formatPeso } from '../../lib/format.js'

// One product card for every storefront list — Home's "Most loved", the
// guest Menu and the customer Menu. Photo first and large, because a
// bakery sells with its bread; name in the display serif; price in the
// crust colour. What the card lets a visitor DO depends on `mode`:
//
//   guest     "Sign in to order" (STOREFRONT_PLAN.md Decision 3)
//   customer  a round + beside the price, which becomes a compact − 2 +
//             once the bread is in the cart — as GrabFood and foodpanda do
//             (the user, 2026-10-28). It and the Cart change the same line.
//   link      the whole card links to the Menu (Home's showcase)

// "Only 5 left" below this; a plain count above it.
const lowStockAt = 10

export function ProductCard({ product, mode = 'guest', onSignIn, cartQuantity = 0, onSetQuantity, onOpen }) {
  // Sold out is a fact about stock, not a choice about the catalogue: the
  // card stays visible so the customer knows it exists, but cannot be
  // added — checkout would only refuse it (routes/orders.js stock guard).
  const soldOut = product.inStock === false
  const left = product.stockLeft
  const limit = Number.isInteger(left) && left > 0 ? left : Infinity
  const lowStock = !soldOut && Number.isInteger(left) && left <= lowStockAt

  const photo = (
    <div className="relative aspect-square overflow-hidden rounded-t-[1.75rem] bg-cream-200">
      {product.imageUrl
        ? <img src={product.imageUrl} alt={product.name} loading="lazy" className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${soldOut ? 'grayscale-60' : ''}`} />
        : <div className="grid h-full w-full place-items-center text-6xl" aria-hidden="true">🥖</div>}
      {product.variant && (
        <span className="absolute left-3 top-3 rounded-full bg-cream-50/95 px-3 py-1 text-[11px] font-bold text-cocoa-700 shadow-sm">{product.variant}</span>
      )}
      {/* Stock left, on the photo where the eye already is (MINOR_REVISIONS
          M6, restyled 2026-10-28): plain while there is plenty, amber when
          it is running low, dark when it is gone. Live. */}
      {Number.isInteger(left) && (
        <span
          className={`absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur ${
            soldOut ? 'bg-cocoa-900/85 text-cream-50' : lowStock ? 'bg-amber-400/95 text-cocoa-900' : 'bg-white/90 text-cocoa-700'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${soldOut ? 'bg-cream-50/70' : lowStock ? 'bg-cocoa-900' : 'bg-leaf-600'}`} aria-hidden="true" />
          {soldOut ? 'Sold out' : lowStock ? `Only ${left} left` : `${left} in stock`}
        </span>
      )}
    </div>
  )

  const roundButton = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition disabled:cursor-not-allowed'
  const plusIcon = <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>

  // The add control beside the price: + alone, or − n + once in the cart.
  const addControl = mode !== 'customer' ? null : cartQuantity > 0 && !soldOut ? (
    <div className="flex h-10 items-center rounded-full bg-crust-600 text-white shadow-sm" role="group" aria-label={`${product.name} in your cart`}>
      <button type="button" onClick={() => onSetQuantity(product.id, cartQuantity - 1)} aria-label={cartQuantity === 1 ? `Remove ${product.name} from the cart` : `One fewer ${product.name}`} className={`${roundButton} hover:bg-white/15`}>
        {cartQuantity === 1
          ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
          : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>}
      </button>
      <AmountInput value={cartQuantity} limit={limit} name={product.name} onCommit={(quantity) => onSetQuantity(product.id, quantity)} />
      <button type="button" onClick={() => onSetQuantity(product.id, Math.min(cartQuantity + 1, limit))} disabled={cartQuantity >= limit} aria-label={`One more ${product.name}`} className={`${roundButton} hover:bg-white/15 disabled:opacity-40`}>{plusIcon}</button>
    </div>
  ) : (
    <button type="button" disabled={soldOut} onClick={() => onSetQuantity(product.id, 1)} aria-label={soldOut ? `${product.name} is sold out` : `Add ${product.name} to the cart`} className={`${roundButton} bg-crust-600 shadow-sm hover:scale-105 hover:bg-crust-700 disabled:bg-cocoa-500/30 disabled:shadow-none disabled:hover:scale-100`}>
      {plusIcon}
    </button>
  )

  const body = (
    <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
      <h3 className="font-display text-lg font-semibold leading-snug text-cocoa-900 sm:text-xl">{product.name}</h3>
      {product.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-cocoa-500 sm:text-sm">{product.description}</p>}
      <div className="mt-auto pt-3">
        <div className="flex min-h-10 items-center justify-between gap-2">
          <p className="font-display text-xl font-bold text-crust-600">{formatPeso(product.price)}</p>
          {addControl}
        </div>
        {mode === 'guest' && (
          <button type="button" onClick={onSignIn} className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-full bg-crust-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-crust-700">
            Sign in to order
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

// The amount in the pill can be typed as well as stepped (the user,
// 2026-10-28): e.g. 24 pandesal at once. Applied when the box is left or
// Enter is pressed, kept to 1 up to the stock left; an empty or zero box
// goes back to what it was (the bin removes the bread).
function AmountInput({ value, limit, name, onCommit }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = () => {
    const typed = Number(draft)
    if (!draft || !Number.isInteger(typed) || typed < 1) {
      setDraft(String(value))
      return
    }
    const next = Math.min(typed, limit)
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      onFocus={(event) => event.target.select()}
      inputMode="numeric"
      aria-label={`How many ${name}`}
      className="w-9 rounded-md bg-transparent text-center text-sm font-bold tabular-nums text-white outline-none focus:bg-white/20"
    />
  )
}
