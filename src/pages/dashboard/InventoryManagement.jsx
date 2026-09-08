import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { InventoryRequests } from './InventoryRequests.jsx'

const emptyEditForm = { stockQuantity: '', minStockLevel: '', expirationDate: '', reason: '', note: '' }
const reasonOptions = [
  { value: 'RESTOCK', label: 'Restock (delivery received)' },
  { value: 'SPOILAGE', label: 'Spoilage / waste' },
  { value: 'CORRECTION', label: 'Correction (recount)' },
]

// Stage 4 (RULES-PLANS/UI_AUDIT.md) — converted together with
// InventoryRequests.jsx since this page renders it as its "requests" tab.
// The role="status" 10px error (C3) is <Alert variant="error">; the
// rounded-full tab pills are Button, matching OrderManagement/
// PaymentBilling's tab pattern; the five inputs are Input/Select/Field
// (H3); Stock and Min level are <Td numeric> per the audit's "numeric and
// currency columns right-aligned with tabular-nums" rule. The low-stock
// pill reuses StatusBadge's existing ACTIVE/INACTIVE tokens (the same
// trick CustomerManagement's isActive flag already uses) rather than
// inventing a seventh status — INACTIVE is already the red/"fail" token,
// ACTIVE already green/"done".
//
// saveEdit's request-body construction is untouched: it still only adds
// stockQuantity/reason/note/minStockLevel/expirationDate keys when that
// field actually changed from editOriginal, same as before. The one
// change request per product and observed-stock-quantity approval
// semantics live in InventoryRequests.jsx and are not touched by this
// pass either.
export function InventoryManagement({ user }) {
  const isAdmin = user.role === 'ADMIN'
  const [activeTab, setActiveTab] = useState('levels')

  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [editingProductId, setEditingProductId] = useState(null)
  const [editForm, setEditForm] = useState(emptyEditForm)
  const [editOriginal, setEditOriginal] = useState(null)
  const [editErrors, setEditErrors] = useState({})
  const [editSubmitting, setEditSubmitting] = useState(false)

  const loadInventory = async () => {
    setLoading(true)
    try {
      const data = await apiGet('/api/inventory')
      setInventory(data.inventory)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInventory()
  }, [])

  const startEdit = (item) => {
    setEditingProductId(item.productId)
    setEditForm({ stockQuantity: String(item.stockQuantity), minStockLevel: String(item.minStockLevel), expirationDate: item.expirationDate ?? '', reason: '', note: '' })
    setEditOriginal(item)
    setEditErrors({})
  }

  const cancelEdit = () => {
    setEditingProductId(null)
    setEditOriginal(null)
  }
  const stockQuantityChanged = editOriginal && String(editOriginal.stockQuantity) !== editForm.stockQuantity

  const saveEdit = async (event, item) => {
    event.preventDefault()
    setEditSubmitting(true)
    setEditErrors({})
    const body = {}
    if (stockQuantityChanged) {
      body.stockQuantity = Number(editForm.stockQuantity)
      body.reason = editForm.reason
      if (editForm.note.trim()) body.note = editForm.note.trim()
    }
    if (String(editOriginal.minStockLevel) !== editForm.minStockLevel) body.minStockLevel = Number(editForm.minStockLevel)
    const normalizedExpiration = editForm.expirationDate === '' ? null : editForm.expirationDate
    if ((editOriginal.expirationDate ?? null) !== normalizedExpiration) body.expirationDate = normalizedExpiration

    if (Object.keys(body).length === 0) {
      // Nothing was actually changed — close the form without a wasted request.
      setEditingProductId(null)
      setEditSubmitting(false)
      return
    }

    try {
      await apiPatch(`/api/inventory/${item.productId}`, body)
      setEditingProductId(null)
      await loadInventory()
    } catch (error) {
      setEditErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const tabs = [
    { key: 'levels', label: 'Stock levels' },
    { key: 'requests', label: isAdmin ? 'Change requests' : 'Propose a change' },
  ]

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Inventory Management</h1>
      <p className="mt-2 text-sm text-ink-500">{isAdmin ? 'View and adjust current stock levels.' : 'Current stock levels across the catalog.'}</p>

      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {tabs.map((tab) => (
          <Button type="button" key={tab.key} size="sm" variant={activeTab === tab.key ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'requests' && <InventoryRequests user={user} inventory={inventory} />}

      {activeTab === 'levels' && (
        <Card className="mt-6 p-6">
          {loading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : inventory.length === 0 ? (
            <EmptyState title="No products yet" />
          ) : (
            <div>
              <Table caption="Inventory stock levels">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Product</Th>
                    <Th>Category</Th>
                    <Th align="right">Stock</Th>
                    <Th align="right">Min level</Th>
                    <Th>Expiry</Th>
                    <Th>Status</Th>
                    {isAdmin && <Th>Actions</Th>}
                  </Tr>
                </Thead>
                <Tbody>
                  {inventory.map((item) =>
                    editingProductId === item.productId ? (
                      <Tr key={item.productId}>
                        <Td className="font-semibold text-ink-900">{item.productName}</Td>
                        <Td>{item.categoryName}</Td>
                        <Td numeric>
                          <Field error={editErrors.stockQuantity}>
                            <Input value={editForm.stockQuantity} onChange={(event) => setEditForm({ ...editForm, stockQuantity: event.target.value })} inputMode="numeric" aria-label="Stock quantity" />
                          </Field>
                        </Td>
                        <Td numeric>
                          <Field error={editErrors.minStockLevel}>
                            <Input value={editForm.minStockLevel} onChange={(event) => setEditForm({ ...editForm, minStockLevel: event.target.value })} inputMode="numeric" aria-label="Minimum stock level" />
                          </Field>
                        </Td>
                        <Td>
                          <Field error={editErrors.expirationDate}>
                            <Input type="date" value={editForm.expirationDate} onChange={(event) => setEditForm({ ...editForm, expirationDate: event.target.value })} aria-label="Expiration date" />
                          </Field>
                        </Td>
                        {/* Merged Status + Actions cell, same as before this
                            conversion — a plain <td colSpan> rather than the
                            <Td> primitive, since <Td> doesn't take colSpan
                            and this is the only place in Stage 4 that needs
                            it. Only reachable when isAdmin, so both columns
                            it spans genuinely exist on every row here. */}
                        <td colSpan={2} className="px-3 py-3 text-sm text-ink-700">
                          {stockQuantityChanged && (
                            <div className="space-y-1.5">
                              <Field error={editErrors.reason}>
                                <Select value={editForm.reason} onChange={(event) => setEditForm({ ...editForm, reason: event.target.value })} aria-label="Reason for stock change">
                                  <option value="">Why is stock changing?</option>
                                  {reasonOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                              <Input value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} placeholder="Optional note" aria-label="Note" />
                            </div>
                          )}
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" onClick={(event) => saveEdit(event, item)} disabled={editSubmitting}>
                              {editSubmitting ? 'Saving…' : 'Save'}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={cancelEdit}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </Tr>
                    ) : (
                      <Tr key={item.productId}>
                        <Td className="font-semibold text-ink-900">{item.productName}</Td>
                        <Td>{item.categoryName}</Td>
                        <Td numeric>{item.stockQuantity}</Td>
                        <Td numeric>{item.minStockLevel}</Td>
                        <Td>{item.expirationDate ?? '—'}</Td>
                        <Td>
                          <StatusBadge status={item.lowStock ? 'INACTIVE' : 'ACTIVE'} label={item.lowStock ? 'Low stock' : 'OK'} />
                        </Td>
                        {isAdmin && (
                          <Td>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                              Edit
                            </Button>
                          </Td>
                        )}
                      </Tr>
                    ),
                  )}
                </Tbody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </section>
  )
}
