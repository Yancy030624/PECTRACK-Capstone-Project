import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { FIELD_SHAPE, Input } from '../../components/ui/Input.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDateTime, formatPeso } from '../../lib/format.js'
import { bakery, bakeryAddress } from '../../lib/bakery.js'
import { NeededByFields } from '../../components/NeededByFields.jsx'
import { checkPicked, toRequestedTime } from '../../lib/orderHours.js'
import { usePhoneVerification } from '../../lib/usePhoneVerification.js'
import { digitsOnly } from '../../lib/phone.js'
import { PrintThisButton } from '../../components/PrintReport.jsx'

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
// change shown) or QR Ph (the reference number from the bakery's app,
// QRPH_PLAN.md Q6). The server saves the
// order and its payment for the full total together, Ready for pickup.
//
// Walk-in or Advanced order (the adviser, 2026-10-19 and 2026-10-23;
// RULES-PLANS/RESERVE_SMS_PLAN.md), a switch at the top. A walk-in asks
// nothing about the customer — only the products and the payment — and
// ends on a printable receipt. An advanced order (called a reservation in
// the code) is for a later pickup: name, mobile number (digits only,
// proven with a texted code when codes are on) and the pickup date and
// time; no email (the adviser, 2026-10-23). Both are paid now. The order
// number is texted.
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
  // 6:00 AM to 10:00 PM; a walk-in for now from 5:00 AM (lib/orderHours.js).
  const [neededDate, setNeededDate] = useState('')
  const [neededTime, setNeededTime] = useState('')

  // Payment, taken before the order is saved.
  const [method, setMethod] = useState('CASH')
  const [cashReceived, setCashReceived] = useState('')
  const [gcashReference, setGcashReference] = useState('')

  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // The walk-in's receipt, shown in place of the form once it is placed
  // (the adviser, 2026-10-23): printable, then "New order".
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    apiGet('/api/products').then((data) => setProducts(data.products)).catch(() => setProducts([]))
  }, [])

  const loading = products === null
  const productsById = loading ? new Map() : new Map(products.map((product) => [product.id, product]))
  const availableProducts = loading ? [] : products.filter((product) => product.availabilityStatus)
  // Search only, no drop-down (the adviser, 2026-10-23): typing "b" lists
  // only the products whose name starts with "b" — not ones with a "b"
  // further in, nor ones with a later word starting with it. Click one,
  // or press Enter for the first, to add it.
  const [productSearch, setProductSearch] = useState('')
  const term = productSearch.trim().toLowerCase()
  const startsWithTerm = (product) => product.name.toLowerCase().startsWith(term)
  const matchingProducts = term ? availableProducts.filter(startsWithTerm).slice(0, 8) : []
  const pick = (productId) => {
    addLine(productId)
    setProductSearch('')
  }

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
  // Typed quantity (the adviser, 2026-10-23): 100 pieces is typed, not 100
  // clicks. Blank while typing; a blank or 0 left behind becomes 1.
  const typeQuantity = (productId, text) => {
    const digits = text.replace(/\D/g, '').slice(0, 4)
    setLines((current) => current.map((line) => (line.productId === productId ? { ...line, quantity: digits === '' ? '' : Number(digits) } : line)))
  }
  const settleQuantity = (productId) => setLines((current) => current.map((line) => (line.productId === productId && !(line.quantity > 0) ? { ...line, quantity: 1 } : line)))
  const quantityOf = (line) => Number(line.quantity) || 0

  const subtotal = lines.reduce((total, line) => {
    const product = productsById.get(line.productId)
    return total + (product ? Number(product.price) * quantityOf(line) : 0)
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
    if (lines.some((line) => !(quantityOf(line) > 0))) {
      setMessage('Enter a quantity for every item.')
      return
    }
    const customerErrors = {}
    if (isReserve) {
      if (!customer.name.trim()) customerErrors.customerName = 'Enter the customer\'s name.'
      if (!customer.contactNumber.trim()) customerErrors.contactNumber = 'Enter the customer\'s contact number.'
      else if (phone.required && !phone.verified) customerErrors.contactNumber = 'Send a code to this number and verify it first.'
      if (customer.contactNumber && !/^09\d{9}$/.test(customer.contactNumber)) customerErrors.contactNumber = 'Enter an 11-digit mobile number starting with 09.'
      if (!neededDate || !neededTime) customerErrors.requestedFulfillmentTime = 'Choose the pickup date and time.'
    }
    if (Object.keys(customerErrors).length) {
      setErrors(customerErrors)
      setMessage('Fill in the customer details marked below.')
      return
    }
    // A walk-in is for now; only a reservation has a date and time.
    const timeError = isReserve ? checkPicked(neededDate, neededTime) : checkPicked('', '', new Date(), { walkIn: true })
    if (timeError) {
      setErrors({ requestedFulfillmentTime: timeError })
      return
    }
    if (method === 'CASH' && (!Number.isFinite(received) || received < subtotal)) {
      setErrors({ cashReceived: `Enter the cash received — at least ${formatPeso(subtotal)}.` })
      return
    }
    if (method === 'QRPH' && !gcashReference.trim()) {
      setErrors({ gatewayReference: 'Enter the reference number from the payment.' })
      return
    }

    setSubmitting(true)
    try {
      const body = {
        orderType: 'PICKUP',
        items: lines.map((line) => ({ productId: line.productId, quantity: quantityOf(line) })),
        payment: method === 'QRPH' ? { method, gatewayReference: gcashReference.trim() } : { method, cashReceived: received },
      }
      if (isReserve) {
        body.customerName = customer.name.trim()
        body.requestedFulfillmentTime = toRequestedTime(neededDate, neededTime)
        body.reservation = { contactNumber: customer.contactNumber, phoneVerificationToken: phone.token ?? undefined }
      }

      const data = await apiPost('/api/orders', body)
      const pickupDay = isReserve ? neededDate : ''
      const placed = {
        orderId: data.order.id,
        orderNumber: data.order.orderNumber,
        at: new Date(),
        items: lines.map((line) => ({ ...productsById.get(line.productId), quantity: quantityOf(line) })),
        total: subtotal,
        method,
        cashReceived: method === 'CASH' ? received : null,
        gcashReference: method === 'QRPH' ? gcashReference.trim() : null,
      }
      resetDraft()
      if (isReserve) onCreated?.(data.order.id, data.message, pickupDay)
      else setReceipt(placed)
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

  if (receipt) {
    return (
      <div className="mt-6 max-w-md">
        <article className="print-only-target rounded-panel bg-surface p-6 text-sm text-ink-700 shadow-raised">
          <header className="border-b border-line-200 pb-3 text-center">
            <p className="text-lg font-semibold text-ink-900">{bakery.name}</p>
            <p className="text-xs text-ink-500">{bakeryAddress}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Official receipt</p>
            <p className="text-base font-semibold text-ink-900">Order #{receipt.orderNumber}</p>
            <p className="text-xs text-ink-500">{formatDateTime(receipt.at)}</p>
          </header>
          <table className="mt-3 w-full text-left text-xs">
            <caption className="sr-only">Items</caption>
            <thead>
              <tr className="text-ink-500">
                <th scope="col" className="py-1 font-semibold">Item</th>
                <th scope="col" className="py-1 text-right font-semibold">Qty</th>
                <th scope="col" className="py-1 text-right font-semibold">Price</th>
                <th scope="col" className="py-1 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={item.id} className="border-t border-line-100">
                  <td className="py-1.5 text-ink-900">{item.name}{item.variant ? ` (${item.variant})` : ''}</td>
                  <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatPeso(item.price)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-ink-900">{formatPeso(Number(item.price) * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 space-y-1 border-t border-line-200 pt-3 text-sm">
            <div className="flex justify-between font-semibold text-ink-900"><dt>Total</dt><dd className="tabular-nums">{formatPeso(receipt.total)}</dd></div>
            {receipt.method === 'CASH' ? (
              <>
                <div className="flex justify-between"><dt>Cash</dt><dd className="tabular-nums">{formatPeso(receipt.cashReceived)}</dd></div>
                <div className="flex justify-between"><dt>Change</dt><dd className="tabular-nums">{formatPeso(receipt.cashReceived - receipt.total)}</dd></div>
              </>
            ) : (
              <div className="flex justify-between"><dt>GCash ref.</dt><dd>{receipt.gcashReference}</dd></div>
            )}
          </dl>
          <p className="mt-4 text-center text-xs text-ink-500">Paid in full. Thank you!</p>
        </article>
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          <PrintThisButton label="Print receipt" />
          <Button type="button" onClick={() => setReceipt(null)}>New order</Button>
          <Button type="button" variant="secondary" onClick={() => { const id = receipt.orderId; setReceipt(null); onCreated?.(id, null, '') }}>View in Orders</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">{isReserve ? 'Customer' : 'Walk-in'}</h2>
            <div role="group" aria-label="Order kind" className="inline-flex rounded-full border border-line-200 bg-surface p-0.5">
              {[['WALK_IN', 'Walk-in'], ['RESERVE', 'Advanced order']].map(([key, label]) => (
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
            {isReserve ? 'For a later pickup. The order number goes to their phone by SMS.' : 'The customer is here now: add the products and take the payment.'}
          </p>
          {isReserve && (
            <div className="mt-3">
              <Field label="Name *" error={errors.customerName}>
                <Input value={customer.name} onChange={(event) => setCustomerField('name', event.target.value)} placeholder="Customer's name" autoComplete="off" />
              </Field>
            </div>
          )}
          {isReserve && (
            <div className="mt-3">
              <Field label="Contact number *" error={errors.contactNumber}>
                <div className="flex flex-wrap gap-2">
                  <Input value={customer.contactNumber} onChange={(event) => setCustomerField('contactNumber', digitsOnly(event.target.value))} inputMode="numeric" maxLength={11} placeholder="09XXXXXXXXX" autoComplete="off" className="min-w-40 flex-1" />
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
          <div className="relative mt-3">
            <Field error={errors.items}>
              <Input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && matchingProducts[0]) { event.preventDefault(); pick(matchingProducts[0].id) } }}
                placeholder="Type a product name, e.g. m for Mamon…"
                aria-label="Search products to add"
                autoComplete="off"
              />
            </Field>
            {term && (
              <ul className="mt-1 divide-y divide-line-100 overflow-hidden rounded-control border border-line-200 bg-surface shadow-raised">
                {matchingProducts.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-ink-500">No product starts with “{productSearch.trim()}”.</li>
                ) : matchingProducts.map((product) => (
                  <li key={product.id}>
                    <button type="button" onClick={() => pick(product.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-sunk">
                      <span className="min-w-0 text-ink-900">{product.name}{product.variant ? <span className="text-ink-500"> ({product.variant})</span> : ''}{product.inStock === false && <span className="ml-1 text-xs text-red-700">sold out</span>}</span>
                      <span className="shrink-0 tabular-nums text-ink-700">{formatPeso(product.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
                    {/* The unit price stays as it is; the line total is in Order Details. */}
                    <span className="w-16 shrink-0 text-right tabular-nums text-ink-500">{formatPeso(product.price)}</span>
                    <div className="flex items-center rounded-full border border-line-200">
                      <button type="button" onClick={() => setLineQuantity(line.productId, quantityOf(line) - 1)} aria-label="Decrease quantity" className="grid h-8 w-8 place-items-center text-sm font-semibold text-brand-700">
                        −
                      </button>
                      <input
                        value={line.quantity}
                        onChange={(event) => typeQuantity(line.productId, event.target.value)}
                        onBlur={() => settleQuantity(line.productId)}
                        inputMode="numeric"
                        aria-label={`Quantity of ${product.name}`}
                        className="h-8 w-12 bg-transparent text-center font-semibold tabular-nums text-ink-900 outline-none"
                      />
                      <button type="button" onClick={() => setLineQuantity(line.productId, quantityOf(line) + 1)} aria-label="Increase quantity" className="grid h-8 w-8 place-items-center text-sm font-semibold text-brand-700">
                        +
                      </button>
                    </div>
                    <button type="button" onClick={() => removeLine(line.productId)} className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50">
                      Remove
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {isReserve && (
        <Card className="p-6">
          <p className="mb-1 text-xs font-semibold text-ink-700">Pickup date and time *</p>
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
        )}
        {!isReserve && errors.requestedFulfillmentTime && <Alert variant="error">{errors.requestedFulfillmentTime}</Alert>}
      </div>

      <div className="h-fit rounded-panel bg-surface-warm p-6 shadow-raised">
        <h2 className="text-lg font-semibold text-ink-900">Order Details</h2>
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
                      {product.name} × {quantityOf(line)}
                    </span>
                    <span className="font-medium text-ink-900 tabular-nums">{formatPeso(Number(product.price) * quantityOf(line))}</span>
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
                {[['CASH', 'Cash'], ['QRPH', 'GCash']].map(([key, label]) => (
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
                  <Field label="Reference number" error={errors.gatewayReference}>
                    <Input value={gcashReference} onChange={(event) => setGcashReference(event.target.value)} placeholder="From the customer's payment app" />
                  </Field>
                </div>
              )}
            </div>
          </>
        )}
        <Button type="button" size="touch" className="mt-4 w-full" onClick={handleSubmit} disabled={submitting || lines.length === 0}>
          {submitting ? 'Placing order…' : 'Place Order'}
        </Button>
      </div>
    </div>
  )
}
