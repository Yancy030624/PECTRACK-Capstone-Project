import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../../api/client.js'
import { useCart } from '../../cart/CartContext.jsx'
import { formatPeso } from '../../lib/format.js'

export function CartPage() {
  const { lines, setQuantity, removeItem } = useCart()
  const [products, setProducts] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    apiGet('/api/products')
      .then((data) => setProducts(data.products))
      .catch((error) => setMessage(error.message))
  }, [])

  const loading = products === null
  const productsById = loading ? new Map() : new Map(products.map((product) => [product.id, product]))
  useEffect(() => {
    if (loading) return
    for (const line of lines) {
      const product = productsById.get(line.productId)
      if (!product || !product.availabilityStatus) removeItem(line.productId)
    }
  }, [loading, lines])

  const validLines = lines
    .map((line) => ({ line, product: productsById.get(line.productId) }))
    .filter(({ product }) => product && product.availabilityStatus)

  const subtotal = validLines.reduce((total, { line, product }) => total + Number(product.price) * line.quantity, 0)

  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-7">
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-crust-600">YOUR CART</p>
      <h1 className="mt-1 font-display text-4xl font-bold text-cocoa-900 sm:text-5xl">Review your order</h1>

      {message && <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}

      {loading ? (
        <div className="mt-10 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-cream-200" />)}
        </div>
      ) : validLines.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-cream-200 bg-white p-8 text-center">
          <p className="text-sm text-cocoa-500">Your cart is empty.</p>
          <Link to="/menu" className="mt-4 inline-block rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Browse the menu</Link>
        </div>
      ) : (
        <>
          <div className="mt-8 divide-y divide-cream-200 rounded-2xl border border-cream-200 bg-white">
            {validLines.map(({ line, product }) => (
              <div key={line.productId} className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-cream-200 text-2xl">
                  {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true">🥖</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold text-cocoa-900">{product.name}</p>
                  {product.variant && <p className="text-xs font-semibold text-crust-600">{product.variant}</p>}
                  <p className="mt-1 text-xs text-cocoa-500">{formatPeso(product.price)} each</p>
                </div>
                <QuantityBox quantity={line.quantity} max={product.stockLeft} name={product.name} onChange={(quantity) => setQuantity(line.productId, quantity)} />
                <p className="w-20 shrink-0 text-right text-sm font-extrabold text-crust-700">{formatPeso(Number(product.price) * line.quantity)}</p>
                <button type="button" onClick={() => removeItem(line.productId)} className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50">Remove</button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cream-200 bg-butter-100 p-5">
            <div>
              <p className="text-xs font-semibold text-crust-700">Estimated subtotal</p>
              <p className="text-2xl font-extrabold text-cocoa-900">{formatPeso(subtotal)}</p>
              <p className="mt-1 text-xs text-cocoa-500">The exact total is confirmed when you place the order.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/menu" className="inline-flex min-h-9 items-center text-xs font-bold text-crust-700 hover:underline">Continue shopping</Link>
              <Link to="/checkout" className="rounded-full bg-crust-600 px-6 py-3 text-xs font-bold text-white shadow-md transition hover:bg-crust-700">Proceed to checkout</Link>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

// The amount of one cart line (the panel, 2026-10-26; MINOR_REVISIONS_PLAN.md
// M5): − and + as before, and the number itself can be typed. A typed
// amount is kept to 1 up to the stock left, and is applied when the box is
// left or Enter is pressed — not on every keystroke, so clearing the box to
// type "12" does not remove the line on the way.
function QuantityBox({ quantity, max, name, onChange }) {
  const [draft, setDraft] = useState(String(quantity))
  useEffect(() => setDraft(String(quantity)), [quantity])
  const limit = Number.isInteger(max) && max > 0 ? max : Infinity

  const commit = () => {
    const typed = Number(draft)
    if (!draft || !Number.isInteger(typed) || typed < 1) {
      setDraft(String(quantity))
      return
    }
    const next = Math.min(typed, limit)
    setDraft(String(next))
    if (next !== quantity) onChange(next)
  }

  return (
    <div className="flex items-center rounded-full border border-cream-200">
      <button type="button" onClick={() => onChange(quantity - 1)} aria-label={`Fewer ${name}`} className="grid h-9 w-9 place-items-center text-base font-bold text-crust-700">−</button>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 4))}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
        inputMode="numeric"
        aria-label={`How many ${name}`}
        className="w-12 rounded-md bg-transparent text-center text-sm font-bold outline-none focus:bg-cream-100"
      />
      <button type="button" onClick={() => onChange(Math.min(quantity + 1, limit))} disabled={quantity >= limit} aria-label={`More ${name}`} className="grid h-9 w-9 place-items-center text-base font-bold text-crust-700 disabled:opacity-40">+</button>
    </div>
  )
}
