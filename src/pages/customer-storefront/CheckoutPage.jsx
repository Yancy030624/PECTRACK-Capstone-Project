import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../../api/client.js'
import { AddressForm } from '../../components/AddressForm.jsx'
import { useCart } from '../../cart/CartContext.jsx'

const instructionsMaxLength = 500

export function CheckoutPage() {
  const navigate = useNavigate()
  const { lines, clear, removeItem } = useCart()

  const [products, setProducts] = useState(null)
  const [addresses, setAddresses] = useState(null)
  const [addingAddress, setAddingAddress] = useState(false)

  const [orderType, setOrderType] = useState('PICKUP')
  const [addressId, setAddressId] = useState(null)
  const [instructions, setInstructions] = useState('')

  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiGet('/api/products').then((data) => setProducts(data.products)).catch(() => setProducts([]))
    apiGet('/api/addresses').then((data) => {
      setAddresses(data.addresses)
      const defaultAddress = data.addresses.find((address) => address.isDefault) ?? data.addresses[0]
      if (defaultAddress) setAddressId(defaultAddress.id)
    }).catch(() => setAddresses([]))
  }, [])

  const loading = products === null || addresses === null
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

  const handleAddressSaved = (address) => {
    setAddresses((current) => [...current, address])
    setAddressId(address.id)
    setAddingAddress(false)
  }

  const handleSubmit = async () => {
    setErrors({})
    setMessage('')

    if (validLines.length === 0) return
    if (orderType === 'DELIVERY' && !addressId) {
      setErrors({ addressId: 'Select a delivery address.' })
      return
    }

    setSubmitting(true)
    try {
      const body = { orderType, items: validLines.map(({ line }) => ({ productId: line.productId, quantity: line.quantity })) }
      if (instructions.trim()) body.instructions = instructions.trim()
      if (orderType === 'DELIVERY') body.addressId = addressId

      const data = await apiPost('/api/orders', body)
      clear()
      navigate(`/order-placed/${data.order.id}`)
    } catch (error) {
      if (error.status === 409 || (error.status === 422 && error.errors?.items)) {
        setMessage('Some items in your cart are no longer available, or do not have enough stock right now. Please review the quantities below and try again.')
        setMessageFailed(true)
        apiGet('/api/products').then((data) => setProducts(data.products)).catch(() => {})
      } else {
        setErrors(error.errors ?? {})
        setMessage(error.message)
        setMessageFailed(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-7">
        <div className="h-64 animate-pulse rounded-2xl bg-white/70" />
      </section>
    )
  }

  if (validLines.length === 0) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-7">
        <p className="text-sm font-semibold text-green-700">CHECKOUT</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Your cart is empty</h1>
        <Link to="/menu" className="mt-6 inline-block rounded-full bg-green-700 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-green-800">Browse the menu</Link>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-7">
      <p className="text-sm font-semibold text-green-700">CHECKOUT</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Place your order</h1>

      {message && <p role={messageFailed ? 'alert' : 'status'} className={`mt-6 rounded-lg px-3 py-2 text-xs font-semibold ${messageFailed ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-green-100 bg-white p-5">
            <h2 className="text-sm font-bold text-stone-900">How would you like your order?</h2>
            <div className="mt-3 flex gap-3">
              <button type="button" onClick={() => setOrderType('PICKUP')} className={`flex-1 rounded-xl border px-4 py-3 text-xs font-bold transition ${orderType === 'PICKUP' ? 'border-green-700 bg-green-50 text-green-800' : 'border-stone-200 text-stone-500'}`}>Pickup at the bakery</button>
              <button type="button" onClick={() => setOrderType('DELIVERY')} className={`flex-1 rounded-xl border px-4 py-3 text-xs font-bold transition ${orderType === 'DELIVERY' ? 'border-green-700 bg-green-50 text-green-800' : 'border-stone-200 text-stone-500'}`}>Delivery</button>
            </div>
          </div>

          {orderType === 'DELIVERY' && (
            <div className="rounded-2xl border border-green-100 bg-white p-5">
              <h2 className="text-sm font-bold text-stone-900">Delivery address</h2>
              {addresses.length === 0 && !addingAddress && (
                <div className="mt-3">
                  <p className="text-xs text-stone-500">You don't have a saved address yet.</p>
                  <button type="button" onClick={() => setAddingAddress(true)} className="mt-3 rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800">Add a delivery address</button>
                </div>
              )}
              {addingAddress && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <AddressForm onSaved={handleAddressSaved} onCancel={() => setAddingAddress(false)} />
                </div>
              )}
              {addresses.length > 0 && !addingAddress && (
                <>
                  <div className="mt-3 space-y-2">
                    {addresses.map((address) => (
                      <label key={address.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs transition ${addressId === address.id ? 'border-green-700 bg-green-50' : 'border-stone-200'}`}>
                        <input type="radio" name="addressId" checked={addressId === address.id} onChange={() => setAddressId(address.id)} className="mt-0.5" />
                        <span>
                          <span className="block font-bold text-stone-800">{address.label}{address.isDefault && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-bold text-green-800">DEFAULT</span>}</span>
                          <span className="block text-stone-600">{address.recipientName} · {address.contactNumber}</span>
                          <span className="block text-stone-500">{address.addressLine1}{address.addressLine2 && `, ${address.addressLine2}`}{address.barangay && `, ${address.barangay}`}, {address.municipality}, {address.province}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button type="button" onClick={() => setAddingAddress(true)} className="mt-3 text-[11px] font-bold text-green-700 hover:underline">+ Add another address</button>
                </>
              )}
              {errors.addressId && <p className="mt-2 text-[10px] font-medium text-red-700">{errors.addressId}</p>}
            </div>
          )}

          <div className="rounded-2xl border border-green-100 bg-white p-5">
            <label htmlFor="checkout-instructions" className="text-sm font-bold text-stone-900">Special instructions (optional)</label>
            <textarea id="checkout-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value.slice(0, instructionsMaxLength))} rows={3} placeholder="e.g. Less sugar, birthday message on the cake" className="mt-3 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
            <p className="mt-1 text-right text-[10px] text-stone-400">{instructions.length}/{instructionsMaxLength}</p>
          </div>

          <button type="button" onClick={handleSubmit} disabled={submitting} className="w-full rounded-2xl bg-green-700 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Placing your order…' : 'Place order'}</button>
        </div>

        <div className="h-fit rounded-2xl border border-green-100 bg-[#fbfbdc] p-5">
          <h2 className="text-sm font-bold text-stone-900">Order summary</h2>
          <div className="mt-3 space-y-2 divide-y divide-green-100/60">
            {validLines.map(({ line, product }) => (
              <div key={line.productId} className="flex items-center justify-between gap-2 pt-2 text-xs first:pt-0">
                <span className="text-stone-700">{product.name}{product.variant ? ` (${product.variant})` : ''} × {line.quantity}</span>
                <span className="font-bold text-stone-900">₱{(Number(product.price) * line.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-green-200 pt-3 text-sm font-extrabold text-green-800">
            <span>Provisional total</span>
            <span>₱{subtotal.toFixed(2)}</span>
          </div>
          <Link to="/cart" className="mt-3 block text-center text-[11px] font-bold text-green-700 hover:underline">Edit cart</Link>
        </div>
      </div>
    </section>
  )
}
