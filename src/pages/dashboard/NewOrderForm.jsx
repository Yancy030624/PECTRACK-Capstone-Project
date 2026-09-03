import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/client.js'
import { AddressForm } from '../../components/AddressForm.jsx'

const instructionsMaxLength = 500

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

  if (loading) return <p className="mt-6 text-sm text-slate-500">Loading…</p>

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">Customer</h2>
          <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search by name or username…" className="mt-3 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700">
            <option value="">Walk-in (no customer account)</option>
            {filteredCustomers.map((customer) => <option key={customer.customerId} value={customer.customerId}>{customer.name} ({customer.username})</option>)}
          </select>
          {errors.customerId && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.customerId}</p>}
        </div>

        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">How is this order fulfilled?</h2>
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => setOrderType('PICKUP')} className={`flex-1 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${orderType === 'PICKUP' ? 'border-green-700 bg-green-50 text-green-800' : 'border-stone-200 text-stone-500'}`}>Pickup</button>
            <button type="button" disabled={!customerId} onClick={() => setOrderType('DELIVERY')} className={`flex-1 rounded-xl border px-4 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${orderType === 'DELIVERY' ? 'border-green-700 bg-green-50 text-green-800' : 'border-stone-200 text-stone-500'}`}>Delivery</button>
          </div>
          {!customerId && <p className="mt-2 text-[10px] text-slate-400">Delivery needs a customer account — a walk-in order can only be picked up.</p>}

          {orderType === 'DELIVERY' && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              {addresses === null ? (
                <p className="text-xs text-slate-500">Loading addresses…</p>
              ) : addingAddress ? (
                <AddressForm customerId={customerId} onSaved={handleAddressSaved} onCancel={() => setAddingAddress(false)} />
              ) : addresses.length === 0 ? (
                <div>
                  <p className="text-xs text-slate-500">This customer has no saved address yet.</p>
                  <button type="button" onClick={() => setAddingAddress(true)} className="mt-3 rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800">Add a delivery address</button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {addresses.map((address) => (
                      <label key={address.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs transition ${addressId === address.id ? 'border-green-700 bg-green-50' : 'border-stone-200'}`}>
                        <input type="radio" name="staffOrderAddressId" checked={addressId === address.id} onChange={() => setAddressId(address.id)} className="mt-0.5" />
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
        </div>

        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">Items</h2>
          <select value="" onChange={(event) => addLine(event.target.value)} className="mt-3 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700">
            <option value="" disabled>Add a product…</option>
            {availableProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.variant ? ` (${product.variant})` : ''} — ₱{product.price}</option>)}
          </select>
          {errors.items && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.items}</p>}

          {lines.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100">
              {lines.map((line) => {
                const product = productsById.get(line.productId)
                if (!product) return null
                return (
                  <li key={line.productId} className="flex flex-wrap items-center gap-3 py-2.5 text-xs">
                    <span className="min-w-0 flex-1">{product.name}{product.variant ? ` (${product.variant})` : ''}</span>
                    <div className="flex items-center rounded-full border border-green-100">
                      <button type="button" onClick={() => setLineQuantity(line.productId, line.quantity - 1)} aria-label="Decrease quantity" className="grid h-7 w-7 place-items-center text-sm font-bold text-green-800">−</button>
                      <span className="w-6 text-center font-bold">{line.quantity}</span>
                      <button type="button" onClick={() => setLineQuantity(line.productId, line.quantity + 1)} aria-label="Increase quantity" className="grid h-7 w-7 place-items-center text-sm font-bold text-green-800">+</button>
                    </div>
                    <span className="w-16 shrink-0 text-right font-extrabold text-green-800">₱{(Number(product.price) * line.quantity).toFixed(2)}</span>
                    <button type="button" onClick={() => removeLine(line.productId)} className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold text-red-700 transition hover:bg-red-50">Remove</button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <label htmlFor="new-order-instructions" className="text-sm font-bold text-slate-900">Special instructions (optional)</label>
          <textarea id="new-order-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value.slice(0, instructionsMaxLength))} rows={2} placeholder="e.g. Less sugar, birthday message on the cake" className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
          <p className="mt-1 text-right text-[10px] text-stone-400">{instructions.length}/{instructionsMaxLength}</p>
        </div>
      </div>

      <div className="h-fit rounded-2xl border border-green-100 bg-[#fbfbdc] p-6">
        <h2 className="text-lg font-bold">Order summary</h2>
        {message && <p role="status" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}
        {lines.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No items added yet.</p>
        ) : (
          <>
            <div className="mt-3 space-y-1.5 text-xs">
              {lines.map((line) => {
                const product = productsById.get(line.productId)
                if (!product) return null
                return <div key={line.productId} className="flex items-center justify-between gap-2"><span className="text-stone-700">{product.name} × {line.quantity}</span><span className="font-semibold text-stone-900">₱{(Number(product.price) * line.quantity).toFixed(2)}</span></div>
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-green-200 pt-3 text-sm font-extrabold text-green-800">
              <span>Provisional total</span>
              <span>₱{subtotal.toFixed(2)}</span>
            </div>
          </>
        )}
        <button type="button" onClick={handleSubmit} disabled={submitting || lines.length === 0} className="mt-4 w-full rounded-2xl bg-green-700 py-3 text-sm font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Placing order…' : 'Place order'}</button>
      </div>
    </div>
  )
}
