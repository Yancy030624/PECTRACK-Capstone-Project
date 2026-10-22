import { useState } from 'react'
import { apiPatch } from '../../api/client.js'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Textarea } from '../../components/ui/Textarea.jsx'
import { formatPeso } from '../../lib/format.js'

// Record rejects (the adviser, 2026-10-23) — the "Rejects" button beside
// "Add product". Pick the product by typing the start of its name; its
// name, category, price and size or pack are shown as they are on file,
// then how many pieces are rejects and why. A confirmation shows the
// stock before and after. Saved as a REJECT (PATCH /api/inventory with
// rejectQuantity), it comes off the shelf count and is listed under
// Inventory Management → Products → Rejects.
export function RejectForm({ products, stockById, onClose, onSaved }) {
  const [search, setSearch] = useState('')
  const [product, setProduct] = useState(null)
  const [pieces, setPieces] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const term = search.trim().toLowerCase()
  const matches = term ? products.filter((item) => item.name.toLowerCase().startsWith(term)).slice(0, 8) : []
  const onHand = product ? stockById.get(product.id) ?? 0 : 0
  const count = Number(pieces) || 0

  const review = (event) => {
    event.preventDefault()
    const found = {}
    if (!product) found.product = 'Choose the product.'
    if (!(count >= 1)) found.pieces = 'Enter how many pieces are rejects.'
    else if (count > onHand) found.pieces = `Only ${onHand} on the shelf.`
    if (!reason.trim()) found.reason = 'Say why these are rejects.'
    setErrors(found)
    if (Object.keys(found).length === 0) setConfirming(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await apiPatch(`/api/inventory/${product.id}`, { rejectQuantity: count, note: reason.trim() })
      onSaved(`${product.name}: ${count} recorded as rejects — ${onHand - count} left on the shelf.`)
    } catch (error) {
      setErrors({ pieces: error.errors?.rejectQuantity ?? error.message })
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-ink-900">Record rejects</h2>
        <button type="button" onClick={onClose} className="text-sm font-medium text-ink-500 hover:text-ink-900">Close</button>
      </div>

      {confirming ? (
        <div className="mt-3 rounded-panel bg-amber-50 p-4">
          <p className="font-semibold text-ink-900">Are you sure you want to confirm these changes?</p>
          <p className="mt-1.5 text-sm">
            {product.name}{product.variant ? ` (${product.variant})` : ''}: <span className="tabular-nums">{onHand}</span> on hand − <span className="tabular-nums">{count}</span> rejects = <strong className="tabular-nums">{onHand - count}</strong> pieces
          </p>
          <p className="mt-1 text-sm text-ink-500">Why: {reason.trim()}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>Back</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={review} noValidate className="mt-3 space-y-3">
          {product ? (
            <div className="rounded-panel bg-surface-sunk p-3">
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-ink-500">Name</dt><dd className="font-semibold text-ink-900">{product.name}</dd></div>
                <div><dt className="text-xs text-ink-500">Category</dt><dd className="text-ink-900">{product.categoryName}</dd></div>
                <div><dt className="text-xs text-ink-500">Price</dt><dd className="tabular-nums text-ink-900">{formatPeso(product.price)}</dd></div>
                <div><dt className="text-xs text-ink-500">Size or pack</dt><dd className="text-ink-900">{product.variant || '—'}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-ink-500">{onHand} on the shelf · <button type="button" onClick={() => { setProduct(null); setSearch('') }} className="font-semibold text-brand-700 hover:underline">Choose another</button></p>
            </div>
          ) : (
            <Field label="Product" error={errors.product}>
              <div>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type the start of the product name" autoComplete="off" autoFocus />
                {term && (
                  <ul className="mt-1 divide-y divide-line-100 overflow-hidden rounded-control bg-surface shadow-raised">
                    {matches.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-ink-500">No product starts with “{search.trim()}”.</li>
                    ) : matches.map((item) => (
                      <li key={item.id}>
                        <button type="button" onClick={() => setProduct(item)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-sunk">
                          <span className="text-ink-900">{item.name}{item.variant ? <span className="text-ink-500"> ({item.variant})</span> : ''}</span>
                          <span className="tabular-nums text-ink-500">{stockById.get(item.id) ?? 0} on shelf</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <Field label="Pieces rejected" error={errors.pieces}>
              <Input value={pieces} onChange={(event) => setPieces(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="e.g. 3" />
            </Field>
            <Field label="Description (why is this product a reject?)" error={errors.reason}>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder="e.g. Burnt, squashed, dropped" />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">Record rejects</Button>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  )
}
