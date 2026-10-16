import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../../api/client.js'
import { AddressForm } from '../../components/AddressForm.jsx'
import { useCart } from '../../cart/CartContext.jsx'
import { formatPeso } from '../../lib/format.js'
import { isDeliverable } from '../../lib/bakery.js'
import { NeededByFields } from '../../components/NeededByFields.jsx'
import { checkPicked, toRequestedTime } from '../../lib/orderHours.js'

const instructionsMaxLength = 500

export function CheckoutPage({ user }) {
  // Migration 016 — the server refuses an order from an unconfirmed email
  // (routes/orders.js). Saying so here, before the button, is the kinder
  // half: finding out only after pressing "Place order" means finding out
  // after choosing a pickup time and typing instructions.
  const needsVerification = user?.role === 'CUSTOMER' && user.emailVerified === false
  const navigate = useNavigate()
  const { lines, clear, removeItem } = useCart()

  const [products, setProducts] = useState(null)
  const [addresses, setAddresses] = useState(null)
  const [addingAddress, setAddingAddress] = useState(false)

  const [orderType, setOrderType] = useState('PICKUP')
  const [addressId, setAddressId] = useState(null)
  const [instructions, setInstructions] = useState('')
  // When it is needed: a Manila date and time, both blank for "as soon as
  // it's ready" (lib/orderHours.js).
  const [neededDate, setNeededDate] = useState('')
  const [neededTime, setNeededTime] = useState('')

  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiGet('/api/products').then((data) => setProducts(data.products)).catch(() => setProducts([]))
    apiGet('/api/addresses').then((data) => {
      setAddresses(data.addresses)
      // Only a Lucban address can be delivered to (PHASE10 B7).
      const deliverable = data.addresses.filter(isDeliverable)
      const defaultAddress = deliverable.find((address) => address.isDefault) ?? deliverable[0]
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
    const timeError = checkPicked(neededDate, neededTime)
    if (timeError) {
      setErrors({ requestedFulfillmentTime: timeError })
      return
    }

    setSubmitting(true)
    try {
      const body = { orderType, items: validLines.map(({ line }) => ({ productId: line.productId, quantity: line.quantity })) }
      if (instructions.trim()) body.instructions = instructions.trim()
      if (neededDate) body.requestedFulfillmentTime = toRequestedTime(neededDate, neededTime)
      if (orderType === 'DELIVERY') body.addressId = addressId

      // Payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md): the order is held
      // for 15 minutes, hidden from the bakery, while the customer pays with
      // GCash; PayMongo brings them back to the receipt. If GCash cannot be
      // opened, the receipt page offers to try again or cancel.
      const data = await apiPost('/api/orders', body)
      clear()
      try {
        const intent = await apiPost('/api/payments/intent', { orderId: data.order.id })
        window.location.href = intent.checkoutUrl
      } catch {
        navigate(`/receipt/${data.order.id}?cancelled=1`)
      }
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
        <div className="h-64 animate-pulse rounded-2xl bg-cream-200" />
      </section>
    )
  }

  if (validLines.length === 0) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-7">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-crust-600">CHECKOUT</p>
        <h1 className="mt-1 font-display text-4xl font-bold text-cocoa-900 sm:text-5xl">Your cart is empty</h1>
        <Link to="/menu" className="mt-6 inline-block rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Browse the menu</Link>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-7">
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-crust-600">CHECKOUT</p>
      <h1 className="mt-1 font-display text-4xl font-bold text-cocoa-900 sm:text-5xl">Place your order</h1>

      {message && <p role={messageFailed ? 'alert' : 'status'} className={`mt-6 rounded-lg px-3 py-2 text-xs font-semibold ${messageFailed ? 'bg-red-50 text-red-700' : 'bg-cream-100 text-crust-700'}`}>{message}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-cream-200 bg-white p-5">
            <h2 className="text-sm font-bold text-cocoa-900">How would you like your order?</h2>
            <div className="mt-3 flex gap-3">
              <button type="button" onClick={() => setOrderType('PICKUP')} className={`flex-1 rounded-xl border px-4 py-3 text-xs font-bold transition ${orderType === 'PICKUP' ? 'border-crust-600 bg-cream-100 text-crust-700' : 'border-cream-300 text-cocoa-500'}`}>Pickup at the bakery</button>
              <button type="button" onClick={() => setOrderType('DELIVERY')} className={`flex-1 rounded-xl border px-4 py-3 text-xs font-bold transition ${orderType === 'DELIVERY' ? 'border-crust-600 bg-cream-100 text-crust-700' : 'border-cream-300 text-cocoa-500'}`}>Delivery</button>
            </div>
          </div>

          {orderType === 'DELIVERY' && (
            <div className="rounded-2xl border border-cream-200 bg-white p-5">
              {/* NO_COD_PLAN — the bakery bakes a delivery order only once it
                  is paid; say so before the customer commits to it. */}
              <p className="mb-4 rounded-xl bg-butter-100 p-3 text-xs font-semibold text-cocoa-700">Every order is paid first with GCash — there is no cash on delivery.</p>
              <h2 className="text-sm font-bold text-cocoa-900">Delivery address</h2>
              {addresses.length === 0 && !addingAddress && (
                <div className="mt-3">
                  <p className="text-xs text-cocoa-500">You don't have a saved address yet.</p>
                  <button type="button" onClick={() => setAddingAddress(true)} className="mt-3 rounded-xl bg-crust-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-crust-700">Add a delivery address</button>
                </div>
              )}
              {addingAddress && (
                <div className="mt-4 border-t border-cream-200 pt-4">
                  <AddressForm onSaved={handleAddressSaved} onCancel={() => setAddingAddress(false)} />
                </div>
              )}
              {addresses.length > 0 && !addingAddress && (
                <>
                  <div className="mt-3 space-y-2">
                    {addresses.map((address) => {
                      // Delivery is within Lucban only (PHASE10 B7); the
                      // server refuses the rest, so they are not offered.
                      const outside = !isDeliverable(address)
                      return (
                      <label key={address.id} className={`flex items-start gap-3 rounded-xl border p-3 text-xs transition ${outside ? 'cursor-not-allowed border-cream-300 opacity-60' : 'cursor-pointer'} ${addressId === address.id ? 'border-crust-600 bg-cream-100' : 'border-cream-300'}`}>
                        <input type="radio" name="addressId" checked={addressId === address.id} disabled={outside} onChange={() => setAddressId(address.id)} className="mt-0.5 h-5 w-5 accent-crust-600" />
                        <span>
                          <span className="block font-bold text-cocoa-900">{address.label}{address.isDefault && <span className="ml-2 rounded-full bg-butter-100 px-2 py-0.5 text-[9px] font-bold text-crust-700">DEFAULT</span>}</span>
                          <span className="block text-cocoa-700">{address.recipientName} · {address.contactNumber}</span>
                          <span className="block text-cocoa-500">{address.addressLine1}{address.addressLine2 && `, ${address.addressLine2}`}{address.barangay && `, ${address.barangay}`}, {address.municipality}, {address.province}</span>
                          {outside && <span className="mt-1 block font-semibold text-amber-800">Outside Lucban — we deliver within Lucban only. Choose pickup for this one.</span>}
                        </span>
                      </label>
                      )
                    })}
                  </div>
                  <button type="button" onClick={() => setAddingAddress(true)} className="mt-3 py-2 text-xs font-bold text-crust-600 hover:underline">+ Add another address</button>
                </>
              )}
              {errors.addressId && <p className="mt-2 text-xs font-medium text-red-700">{errors.addressId}</p>}
            </div>
          )}

          <div className="rounded-2xl border border-cream-200 bg-white p-5">
            <label htmlFor="checkout-instructions" className="text-sm font-bold text-cocoa-900">Special instructions (optional)</label>
            <textarea id="checkout-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value.slice(0, instructionsMaxLength))} rows={3} placeholder="e.g. Less sugar, birthday message on the cake" className="mt-3 w-full rounded-xl border border-cream-300 px-3 py-2 text-xs outline-none focus:border-crust-500" />
            <p className="mt-1 text-right text-xs text-cocoa-500">{instructions.length}/{instructionsMaxLength}</p>
          </div>

          <div className="rounded-2xl border border-cream-200 bg-white p-5">
            <p className="text-sm font-bold text-cocoa-900">When do you need it?</p>
            <div className="mt-3">
              <NeededByFields
                idPrefix="checkout-needed"
                date={neededDate}
                time={neededTime}
                onDateChange={(value) => { setNeededDate(value); setErrors({}) }}
                onTimeChange={(value) => { setNeededTime(value); setErrors({}) }}
                inputClassName="w-full rounded-xl border border-cream-300 px-3 py-2 text-xs outline-none focus:border-crust-500"
                labelClassName="mb-1 block text-xs font-semibold text-cocoa-700"
                helpClassName="mt-2 text-xs text-cocoa-500"
              />
            </div>
            {errors.requestedFulfillmentTime && <p className="mt-2 text-xs font-medium text-red-700">{errors.requestedFulfillmentTime}</p>}
          </div>

          {needsVerification && (
            <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <span className="font-bold">Confirm your email to place this order.</span> Open the link we sent to {user.email} — your cart is kept, and this page updates when you come back.
            </p>
          )}
          <p className="text-center text-xs text-cocoa-500">You pay with GCash right away. Your order is placed once it is paid; an unpaid order is let go after 15 minutes.</p>
          <button type="button" onClick={handleSubmit} disabled={submitting || needsVerification} className="w-full rounded-2xl bg-crust-600 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-crust-700 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Opening GCash…' : needsVerification ? 'Confirm your email first' : 'Place order and pay with GCash'}</button>
        </div>

        {/* order-first below lg: on a phone the summary used to render
            AFTER the "Place order" button, so the customer committed
            before seeing the items and total. */}
        <div className="order-first h-fit rounded-2xl border border-cream-200 bg-butter-100 p-5 lg:order-none">
          <h2 className="text-sm font-bold text-cocoa-900">Order summary</h2>
          <div className="mt-3 space-y-2 divide-y divide-cream-200">
            {validLines.map(({ line, product }) => (
              <div key={line.productId} className="flex items-center justify-between gap-2 pt-2 text-xs first:pt-0">
                <span className="text-cocoa-700">{product.name}{product.variant ? ` (${product.variant})` : ''} × {line.quantity}</span>
                <span className="font-bold text-cocoa-900">{formatPeso(Number(product.price) * line.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-cream-300 pt-3 text-sm font-extrabold text-crust-700">
            <span>Estimated total</span>
            <span>{formatPeso(subtotal)}</span>
          </div>
          <Link to="/cart" className="mt-3 block py-2 text-center text-xs font-bold text-crust-600 hover:underline">Edit cart</Link>
        </div>
      </div>
    </section>
  )
}
