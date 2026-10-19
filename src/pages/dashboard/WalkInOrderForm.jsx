import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { FIELD_SHAPE, Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatPeso } from '../../lib/format.js'
import { NeededByFields } from '../../components/NeededByFields.jsx'
import { checkPicked, toRequestedTime } from '../../lib/orderHours.js'
import { usePhoneVerification } from '../../lib/usePhoneVerification.js'

// The cashier's Walk-in page (the adviser, 2026-10-16): the customer is
// standing at the counter, so the page asks only what to sell and, if it
// is for later, when. It used to be "New order", which also picked a
// customer account, pickup or delivery, and special instructions; online
// customers order those themselves on the storefront.
//
// Every order placed here is a walk-in pickup: orderType PICKUP and no
// customerId (routes/orders.js treats a missing customerId as a walk-in),
// and no instructions. It appears in the Orders list as Walk-in / pickup.
//
// Payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md): the cashier takes the
// money here, before Place order — cash (the amount received, with the
// change shown) or GCash (the reference number). The server saves the
// order and its payment for the full total together, Ready for pickup.
//
// Walk-in or Reserve (the adviser, 2026-10-19; RULES-PLANS/RESERVE_SMS_PLAN.md):
// a switch at the top. A walk-in asks only the customer's name; the date is
// today unless a later one is picked. A reservation is for a later pickup
// and asks name, contact number (proven with a texted code when codes are
// on), email, and the pickup date and time. Both are paid now. The
// reservation's receipt is emailed and its order number texted.
const emptyCustomer = { name: '', contactNumber: '', email: '' }
export function WalkInOrderForm({ onCreated }) {
  const [products, setProducts] = useState(null)
  const [mode, setMode] = useState('WALK_IN')
  const isReserve = mode === 'RESERVE'
  const [customer, setCustomer] = useState(emptyCustomer)
  const phone = usePhoneVerification('RESERVE')
  const setCustomerField = (field, value) => {
    setCustomer((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field === 'name' ? 'customerName' : field]: undefined }))
    if (field === 'contactNumber') phone.reset()
  }

  const [lines, setLines] = useState([])
  // A Manila date and time ('YYYY-MM-DD', 'HH:mm'); both blank means "as
  // soon as it's ready", the common case, stored as NULL. Today or later,
  // 5:00 AM to 10:00 PM (lib/orderHours.js).
  const [neededDate, setNeededDate] = useState('')
  const [neededTime, setNeededTime] = useState('')

  // Payment, taken before the order is saved.
  const [method, setMethod] = useState('CASH')
  const [cashReceived, setCashReceived] = useState('')
  const [gcashReference, setGcashReference] = useState('')

  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiGet('/api/products').then((data) => setProducts(data.products)).catch(() => setProducts([]))
  }, [])

  const loading = products === null
  const productsById = loading ? new Map() : new Map(products.map((product) => [product.id, product]))
  const availableProducts = loading ? [] : products.filter((product) => product.availabilityStatus)
  // A cashier types the product name faster than they scroll a 40-entry
  // dropdown; the search narrows the <select> below it as they type.
  const [productSearch, setProductSearch] = useState('')
  const matchingProducts = availableProducts.filter((product) => {
    const term = productSearch.trim().toLowerCase()
    return !term || `${product.name} ${product.variant ?? ''}`.toLowerCase().includes(term)
  })

  const addLine = (productId) => {
    if (!productId) return
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId)
      if (existing) return current.map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line))
      return [...current, { productId, quantity: 1 }]
    })
  }
  const setLineQuantity = (productId, quantity) => {
    setLines((current) => {
      if (quantity <= 0) return current.filter((line) => line.productId !== productId)
      return current.map((line) => (line.productId === productId ? { ...line, quantity } : line))
    })
  }
  const removeLine = (productId) => setLines((current) => current.filter((line) => line.productId !== productId))

  const subtotal = lines.reduce((total, line) => {
    const product = productsById.get(line.productId)
    return total + (product ? Number(product.price) * line.quantity : 0)
  }, 0)

  const received = Number(cashReceived)
  const change = method === 'CASH' && cashReceived !== '' && Number.isFinite(received) ? received - subtotal : null

  const resetDraft = () => {
    setLines([])
    setCustomer(emptyCustomer)
    phone.reset()
    setMethod('CASH')
    setCashReceived('')
    setGcashReference('')
    setNeededDate('')
    setNeededTime('')
    setErrors({})
    setMessage('')
  }

  const handleSubmit = async () => {
    setErrors({})
    setMessage('')
    if (lines.length === 0) {
      setMessage('Add at least one item.')
      return
    }
    const customerErrors = {}
    if (!customer.name.trim()) customerErrors.customerName = 'Enter the customer\'s name.'
    if (isReserve) {
      if (!customer.contactNumber.trim()) customerErrors.contactNumber = 'Enter the customer\'s contact number.'
      else if (phone.required && !phone.verified) customerErrors.contactNumber = 'Send a code to this number and verify it first.'
      if (!customer.email.trim()) customerErrors.email = 'Enter the customer\'s email.'
      if (!neededDate || !neededTime) customerErrors.requestedFulfillmentTime = 'Choose the pickup date and time.'
    }
    if (Object.keys(customerErrors).length) {
      setErrors(customerErrors)
      setMessage('Fill in the customer details marked below.')
      return
    }
    const timeError = checkPicked(neededDate, neededTime)
    if (timeError) {
      setErrors({ requestedFulfillmentTime: timeError })
      return
    }
    if (method === 'CASH' && (!Number.isFinite(received) || received < subtotal)) {
      setErrors({ cashReceived: `Enter the cash received — at least ${formatPeso(subtotal)}.` })
      return
    }
    if (method === 'GCASH' && !gcashReference.trim()) {
      setErrors({ gatewayReference: 'Enter the GCash reference number from the receipt.' })
      return
    }

    setSubmitting(true)
    try {
      const body = {
        orderType: 'PICKUP',
        items: lines.map(({ productId, quantity }) => ({ productId, quantity })),
        payment: method === 'GCASH' ? { method, gatewayReference: gcashReference.trim() } : { method },
        customerName: customer.name.trim(),
      }
      if (neededDate) body.requestedFulfillmentTime = toRequestedTime(neededDate, neededTime)
      if (isReserve) body.reservation = { contactNumber: customer.contactNumber.trim(), email: customer.email.trim(), phoneVerificationToken: phone.token ?? undefined }

      const data = await apiPost('/api/orders', body)
      const pickupDay = neededDate
      resetDraft()
      onCreated?.(data.order.id, isReserve ? data.message : null, pickupDay)
    } catch (error) {
      if (error.status === 409 || (error.status === 422 && error.errors?.items)) {
        setMessage('One or more items no longer have enough stock, or are no longer available. Review the order below and try again.')
        apiGet('/api/products').then((data) => setProducts(data.products)).catch(() => {})
      } else {
        setErrors(error.errors ?? {})
        setMessage(error.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingRows className="mt-6" />

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">Customer</h2>
            <div role="group" aria-label="Order kind" className="inline-flex rounded-full border border-line-200 bg-surface p-0.5">
              {[['WALK_IN', 'Walk-in'], ['RESERVE', 'Reserve']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={mode === key}
                  onClick={() => { setMode(key); setErrors({}); setMessage('') }}
                  className={`min-h-8 rounded-full px-4 text-sm font-medium transition ${mode === key ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-surface-sunk'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {isReserve ? 'For a later pickup. The receipt goes to their email and the order number to their phone.' : 'The customer is here now.'}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name *" error={errors.customerName}>
              <Input value={customer.name} onChange={(event) => setCustomerField('name', event.target.value)} placeholder="Customer's name" autoComplete="off" />
            </Field>
            {isReserve && (
              <Field label="Email *" error={errors.email}>
                <Input type="email" value={customer.email} onChange={(event) => setCustomerField('email', event.target.value)} placeholder="name@gmail.com" autoComplete="off" />
              </Field>
            )}
          </div>
          {isReserve && (
            <div className="mt-3">
              <Field label="Contact number *" error={errors.contactNumber}>
                <div className="flex flex-wrap gap-2">
                  <Input value={customer.contactNumber} onChange={(event) => setCustomerField('contactNumber', event.target.value)} inputMode="tel" placeholder="0917 123 4567" autoComplete="off" className="min-w-40 flex-1" />
                  {phone.required && !phone.verified && (
                    <Button type="button" size="sm" variant="secondary" className="h-9" onClick={() => phone.send(customer.contactNumber)} disabled={phone.busy || !customer.contactNumber.trim()}>
                      {phone.token ? 'Send again' : 'Send code'}
                    </Button>
                  )}
                </div>
              </Field>
              {phone.required && phone.verified && <p className="mt-1 text-xs font-semibold text-status-done-fg">✓ Number verified</p>}
              {phone.required && !phone.verified && phone.token && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input value={phone.code} onChange={(event) => phone.setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6-digit code" aria-label="Code from the text" className="w-36" />
                  <Button type="button" size="sm" className="h-9" onClick={phone.check} disabled={phone.busy || phone.code.length !== 6}>Verify</Button>
                  <span className="text-xs text-ink-500">Ask the customer for the code we texted.</span>
                </div>
              )}
              {phone.info && <p className="mt-1 text-xs text-ink-500">{phone.info}</p>}
              {phone.error && <p className="mt-1 text-xs text-red-700">{phone.error}</p>}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-900">Items</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr]">
            <Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products…" aria-label="Search products" />
            <Field error={errors.items}>
              <Select value="" onChange={(event) => { addLine(event.target.value); setProductSearch('') }} aria-label="Add a product to the order">
                <option value="" disabled>
                  {matchingProducts.length === 0 ? 'No products match' : `Add a product… (${matchingProducts.length})`}
                </option>
                {matchingProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                    {product.variant ? ` (${product.variant})` : ''} — {formatPeso(product.price)}{product.inStock === false ? ' — sold out' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {lines.length > 0 && (
            <ul className="mt-4 divide-y divide-line-100">
              {lines.map((line) => {
                const product = productsById.get(line.productId)
                if (!product) return null
                return (
                  <li key={line.productId} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      {product.name}
                      {product.variant ? ` (${product.variant})` : ''}
                    </span>
                    {/* A quantity stepper, not a text input — no shared
                        primitive covers this shape, so it keeps its own
                        markup, just retokened onto the shared palette. */}
                    <div className="flex items-center rounded-full border border-line-200">
                      <button type="button" onClick={() => setLineQuantity(line.productId, line.quantity - 1)} aria-label="Decrease quantity" className="grid h-7 w-7 place-items-center text-sm font-semibold text-brand-700">
                        −
                      </button>
                      <span className="w-6 text-center font-semibold text-ink-900">{line.quantity}</span>
                      <button type="button" onClick={() => setLineQuantity(line.productId, line.quantity + 1)} aria-label="Increase quantity" className="grid h-7 w-7 place-items-center text-sm font-semibold text-brand-700">
                        +
                      </button>
                    </div>
                    <span className="w-16 shrink-0 text-right font-semibold text-brand-700 tabular-nums">{formatPeso(Number(product.price) * line.quantity)}</span>
                    <button type="button" onClick={() => removeLine(line.productId)} className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                      Remove
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <p className="mb-1 text-xs font-semibold text-ink-700">{isReserve ? 'Pickup date and time *' : 'Needed by'}</p>
          <NeededByFields
            idPrefix="walk-in-needed"
            date={neededDate}
            time={neededTime}
            onDateChange={(value) => { setNeededDate(value); setErrors({}) }}
            onTimeChange={(value) => { setNeededTime(value); setErrors({}) }}
            inputClassName={`h-9 ${FIELD_SHAPE}`}
            labelClassName="mb-1 block text-xs text-ink-500"
            helpClassName="mt-1 text-xs text-ink-500"
          />
          {errors.requestedFulfillmentTime && <p className="mt-1 text-xs text-red-700">{errors.requestedFulfillmentTime}</p>}
        </Card>
      </div>

      <div className="h-fit rounded-panel border border-line-200 bg-surface-warm p-6">
        <h2 className="text-lg font-semibold text-ink-900">Order summary</h2>
        {message && (
          <div className="mt-3">
            <Alert variant="error">{message}</Alert>
          </div>
        )}
        {lines.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No items added yet.</p>
        ) : (
          <>
            <div className="mt-3 space-y-1.5 text-sm">
              {lines.map((line) => {
                const product = productsById.get(line.productId)
                if (!product) return null
                return (
                  <div key={line.productId} className="flex items-center justify-between gap-2">
                    <span className="text-ink-700">
                      {product.name} × {line.quantity}
                    </span>
                    <span className="font-medium text-ink-900 tabular-nums">{formatPeso(Number(product.price) * line.quantity)}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-brand-100 pt-3 text-sm font-semibold text-brand-700">
              <span>Total</span>
              <span className="tabular-nums">{formatPeso(subtotal)}</span>
            </div>

            <div className="mt-4 border-t border-brand-100 pt-4">
              <p className="text-xs font-semibold text-ink-700">Payment</p>
              <div role="group" aria-label="Payment method" className="mt-2 grid grid-cols-2 gap-2">
                {[['CASH', 'Cash'], ['GCASH', 'GCash']].map(([key, label]) => (
                  <Button key={key} type="button" size="sm" variant={method === key ? 'primary' : 'secondary'} aria-pressed={method === key} onClick={() => { setMethod(key); setErrors({}) }}>{label}</Button>
                ))}
              </div>
              {method === 'CASH' ? (
                <div className="mt-3">
                  <Field label="Cash received" error={errors.cashReceived}>
                    <Input value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} inputMode="decimal" placeholder={subtotal.toFixed(2)} />
                  </Field>
                  {change != null && change >= 0 && <p className="mt-1 text-sm font-semibold text-ink-900">Change: <span className="tabular-nums">{formatPeso(change)}</span></p>}
                </div>
              ) : (
                <div className="mt-3">
                  <Field label="GCash reference number" error={errors.gatewayReference}>
                    <Input value={gcashReference} onChange={(event) => setGcashReference(event.target.value)} placeholder="From the customer's GCash receipt" />
                  </Field>
                </div>
              )}
            </div>
          </>
        )}
        <Button type="button" size="touch" className="mt-4 w-full" onClick={handleSubmit} disabled={submitting || lines.length === 0}>
          {submitting ? 'Placing order…' : isReserve ? 'Place paid reservation' : 'Place paid order'}
        </Button>
      </div>
    </div>
  )
}
