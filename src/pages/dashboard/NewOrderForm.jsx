import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/client.js'
import { AddressForm } from '../../components/AddressForm.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { Textarea } from '../../components/ui/Textarea.jsx'

const instructionsMaxLength = 500

// Stage 3 (RULES-PLANS/UI_AUDIT.md) — the counter screen, where speed
// matters most. This is a presentation-only pass: every input/select/
// button below is now a shared primitive (fixing H3 — this file had all
// 4 of its `rounded-xl border border-stone-200` inputs, one third of the
// count the audit measured app-wide) and the error banner is
// <Alert variant="error"> instead of the 10px role="status" text (C3).
// The walk-in/customer/DELIVERY ordering rules themselves — what fields
// are required, when DELIVERY is even selectable, how a stock conflict
// on submit is handled — are untouched; see COUNTER_ORDER_PLAN.md
// Decisions 3 and 4 for why they're shaped the way they are.
export function NewOrderForm({ onCreated }) {
  const [customers, setCustomers] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  // '' means walk-in — orders.js's own default when no customerId is sent.
  const [customerId, setCustomerId] = useState('')

  const [products, setProducts] = useState(null)
  const [orderType, setOrderType] = useState('PICKUP')

  const [addresses, setAddresses] = useState(null)
  const [addressId, setAddressId] = useState(null)
  const [addingAddress, setAddingAddress] = useState(false)

  const [lines, setLines] = useState([])
  const [instructions, setInstructions] = useState('')

  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiGet('/api/customers').then((data) => setCustomers(data.customers)).catch(() => setCustomers([]))
    apiGet('/api/products').then((data) => setProducts(data.products)).catch(() => setProducts([]))
  }, [])
  useEffect(() => {
    setAddresses(null)
    setAddressId(null)
    if (!customerId) return
    apiGet(`/api/addresses?${new URLSearchParams({ customerId })}`).then((data) => {
      setAddresses(data.addresses)
      const defaultAddress = data.addresses.find((address) => address.isDefault) ?? data.addresses[0]
      if (defaultAddress) setAddressId(defaultAddress.id)
    }).catch(() => setAddresses([]))
  }, [customerId])
  useEffect(() => {
    if (!customerId && orderType === 'DELIVERY') setOrderType('PICKUP')
  }, [customerId, orderType])

  const loading = customers === null || products === null
  const productsById = loading ? new Map() : new Map(products.map((product) => [product.id, product]))
  const availableProducts = loading ? [] : products.filter((product) => product.availabilityStatus)

  const filteredCustomers = !customers ? [] : customers.filter((customer) => {
    const query = customerSearch.trim().toLowerCase()
    if (!query) return true
    return customer.name.toLowerCase().includes(query) || customer.username.toLowerCase().includes(query)
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

  const handleAddressSaved = (address) => {
    setAddresses((current) => [...(current ?? []), address])
    setAddressId(address.id)
    setAddingAddress(false)
  }

  const resetDraft = () => {
    setLines([])
    setInstructions('')
    setCustomerId('')
    setCustomerSearch('')
    setOrderType('PICKUP')
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
    if (orderType === 'DELIVERY' && !addressId) {
      setErrors({ addressId: 'Select a delivery address.' })
      return
    }

    setSubmitting(true)
    try {
      const body = { orderType, items: lines.map(({ productId, quantity }) => ({ productId, quantity })) }
      if (customerId) body.customerId = customerId
      if (orderType === 'DELIVERY') body.addressId = addressId
      if (instructions.trim()) body.instructions = instructions.trim()

      const data = await apiPost('/api/orders', body)
      resetDraft()
      onCreated?.(data.order.id)
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

  if (loading) return <p className="mt-6 text-sm text-ink-500">Loading…</p>

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-900">Customer</h2>
          <Input
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            placeholder="Search by name or username…"
            aria-label="Search customers by name or username"
            className="mt-3"
          />
          <div className="mt-2">
            <Field error={errors.customerId}>
              <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)} aria-label="Customer">
                <option value="">Walk-in (no customer account)</option>
                {filteredCustomers.map((customer) => (
                  <option key={customer.customerId} value={customer.customerId}>
                    {customer.name} ({customer.username})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-900">How is this order fulfilled?</h2>
          <div className="mt-3 flex gap-3">
            <Button type="button" className="flex-1" variant={orderType === 'PICKUP' ? 'primary' : 'secondary'} onClick={() => setOrderType('PICKUP')}>
              Pickup
            </Button>
            <Button type="button" className="flex-1" variant={orderType === 'DELIVERY' ? 'primary' : 'secondary'} disabled={!customerId} onClick={() => setOrderType('DELIVERY')}>
              Delivery
            </Button>
          </div>
          {!customerId && <p className="mt-2 text-xs text-ink-500">Delivery needs a customer account — a walk-in order can only be picked up.</p>}

          {orderType === 'DELIVERY' && (
            <div className="mt-4 border-t border-line-100 pt-4">
              {addresses === null ? (
                <p className="text-sm text-ink-500">Loading addresses…</p>
              ) : addingAddress ? (
                <AddressForm customerId={customerId} onSaved={handleAddressSaved} onCancel={() => setAddingAddress(false)} />
              ) : addresses.length === 0 ? (
                <div>
                  <p className="text-sm text-ink-500">This customer has no saved address yet.</p>
                  <div className="mt-3">
                    <Button type="button" size="sm" onClick={() => setAddingAddress(true)}>
                      Add a delivery address
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {addresses.map((address) => (
                      <label
                        key={address.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 text-sm transition ${addressId === address.id ? 'border-brand-600 bg-brand-50' : 'border-line-200'}`}
                      >
                        <input type="radio" name="staffOrderAddressId" checked={addressId === address.id} onChange={() => setAddressId(address.id)} className="mt-0.5" />
                        <span>
                          <span className="block font-semibold text-ink-900">
                            {address.label}
                            {address.isDefault && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">DEFAULT</span>}
                          </span>
                          <span className="block text-ink-600">
                            {address.recipientName} · {address.contactNumber}
                          </span>
                          <span className="block text-ink-500">
                            {address.addressLine1}
                            {address.addressLine2 && `, ${address.addressLine2}`}
                            {address.barangay && `, ${address.barangay}`}, {address.municipality}, {address.province}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {/* A plain text link, not <Button> — none of Button's four
                      variants (primary/secondary/ghost/destructive) is a
                      bare text link, and forcing this secondary "add one
                      more" action into a filled button would outweigh the
                      primary "Add a delivery address" state above it. */}
                  <button type="button" onClick={() => setAddingAddress(true)} className="mt-3 text-xs font-semibold text-brand-700 hover:underline">
                    + Add another address
                  </button>
                </>
              )}
              {errors.addressId && <p className="mt-2 text-xs text-red-700">{errors.addressId}</p>}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-900">Items</h2>
          <div className="mt-3">
            <Field error={errors.items}>
              <Select value="" onChange={(event) => addLine(event.target.value)} aria-label="Add a product to the order">
                <option value="" disabled>
                  Add a product…
                </option>
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                    {product.variant ? ` (${product.variant})` : ''} — ₱{product.price}
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
                    <span className="w-16 shrink-0 text-right font-semibold text-brand-700 tabular-nums">₱{(Number(product.price) * line.quantity).toFixed(2)}</span>
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
          <Field label="Special instructions (optional)">
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value.slice(0, instructionsMaxLength))}
              rows={2}
              placeholder="e.g. Less sugar, birthday message on the cake"
            />
          </Field>
          <p className="mt-1 text-right text-xs text-ink-500">
            {instructions.length}/{instructionsMaxLength}
          </p>
        </Card>
      </div>

      <div className="h-fit rounded-panel border border-line-200 bg-surface-warm p-6">
        <h2 className="text-lg font-semibold text-ink-900">Order summary</h2>
        {/* C3: was the same 10px role="status" pattern as OrderManagement
            and PaymentBilling. */}
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
                    <span className="font-medium text-ink-900 tabular-nums">₱{(Number(product.price) * line.quantity).toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-brand-100 pt-3 text-sm font-semibold text-brand-700">
              <span>Provisional total</span>
              <span className="tabular-nums">₱{subtotal.toFixed(2)}</span>
            </div>
          </>
        )}
        <Button type="button" size="touch" className="mt-4 w-full" onClick={handleSubmit} disabled={submitting || lines.length === 0}>
          {submitting ? 'Placing order…' : 'Place order'}
        </Button>
      </div>
    </div>
  )
}
