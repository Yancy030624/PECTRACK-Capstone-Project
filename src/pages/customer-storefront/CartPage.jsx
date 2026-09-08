import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../../api/client.js'
import { useCart } from '../../cart/CartContext.jsx'

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
      <p className="text-sm font-semibold text-green-700">YOUR CART</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Review your order</h1>

      {message && <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}

      {loading ? (
        <div className="mt-10 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-white/70" />)}
        </div>
      ) : validLines.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-green-100 bg-white p-8 text-center">
          <p className="text-sm text-stone-500">Your cart is empty.</p>
          <Link to="/menu" className="mt-4 inline-block rounded-full bg-green-700 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-green-800">Browse the menu</Link>
        </div>
      ) : (
        <>
          <div className="mt-8 divide-y divide-green-100 rounded-2xl border border-green-100 bg-white">
            {validLines.map(({ line, product }) => (
              <div key={line.productId} className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-stone-900">{product.name}</p>
                  {product.variant && <p className="text-xs font-semibold text-green-700">{product.variant}</p>}
                  <p className="mt-1 text-xs text-stone-500">₱{product.price} each</p>
                </div>
                <div className="flex items-center rounded-full border border-green-100">
                  <button type="button" onClick={() => setQuantity(line.productId, line.quantity - 1)} aria-label="Decrease quantity" className="grid h-7 w-7 place-items-center text-sm font-bold text-green-800">−</button>
                  <span className="w-6 text-center text-xs font-bold">{line.quantity}</span>
                  <button type="button" onClick={() => setQuantity(line.productId, line.quantity + 1)} aria-label="Increase quantity" className="grid h-7 w-7 place-items-center text-sm font-bold text-green-800">+</button>
                </div>
                <p className="w-20 shrink-0 text-right text-sm font-extrabold text-green-800">₱{(Number(product.price) * line.quantity).toFixed(2)}</p>
                <button type="button" onClick={() => removeItem(line.productId)} className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold text-red-700 transition hover:bg-red-50">Remove</button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-green-100 bg-[#fbfbdc] p-5">
            <div>
              <p className="text-xs font-semibold text-green-800">Provisional subtotal</p>
              <p className="text-2xl font-extrabold text-stone-900">₱{subtotal.toFixed(2)}</p>
              <p className="mt-1 text-[10px] text-stone-500">The exact total is confirmed when you place the order.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/menu" className="text-xs font-bold text-green-800 hover:underline">Continue shopping</Link>
              <Link to="/checkout" className="rounded-full bg-green-700 px-6 py-3 text-xs font-bold text-white shadow-md transition hover:bg-green-800">Proceed to checkout</Link>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
