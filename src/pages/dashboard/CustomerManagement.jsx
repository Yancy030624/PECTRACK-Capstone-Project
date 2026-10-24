import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { digitsOnly } from '../../lib/phone.js'

// Stage 1's proof screen (RULES-PLANS/UI_AUDIT.md — "Stage 1: The
// primitive kit"). Smallest table in the dashboard, so it's the cheapest
// place to find out whether the src/components/ui/ primitives actually
// hold up in a real screen before converting anything bigger. Behaviour
// is unchanged from the pre-Stage-1 version — search, inline edit,
// activate/deactivate, and the ADMIN-vs-CASHIER read-only split all work
// the same way. What changed is every hand-rolled className being
// replaced by a shared primitive, which is why several small visual
// details (button colours, badge tokens, input height) now differ
// slightly from before — that's the point of the conversion, not a bug.
export function CustomerManagement({ user, embedded = false }) {
  const isAdmin = user.role === 'ADMIN'

  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', contactNumber: '' })
  const [editErrors, setEditErrors] = useState({})
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  const loadCustomers = async (searchTerm) => {
    setLoading(true)
    try {
      const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''
      const data = await apiGet(`/api/customers${query}`)
      setCustomers(data.customers)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers('')
  }, [])

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    loadCustomers(search)
  }

  const startEdit = (customer) => {
    setEditingId(customer.id)
    // A customer's name is edited in its two parts (migration 026).
    setEditForm({ firstName: customer.firstName ?? '', lastName: customer.lastName ?? '', email: customer.email, contactNumber: customer.contactNumber })
    setEditErrors({})
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (event, customerId) => {
    event.preventDefault()
    setEditSubmitting(true)
    setEditErrors({})
    try {
      await apiPatch(`/api/customers/${customerId}`, editForm)
      setEditingId(null)
      await loadCustomers(search)
    } catch (error) {
      setEditErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const toggleActive = async (customer) => {
    if (customer.isActive && !window.confirm(`Deactivate ${customer.name}? They will be signed out immediately and unable to log in until reactivated.`)) return
    setTogglingId(customer.id)
    try {
      await apiPatch(`/api/customers/${customer.id}`, { isActive: !customer.isActive })
      await loadCustomers(search)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    // Shown as the Customers tab of User Management (UserManagement.jsx),
    // which owns the page title; `embedded` leaves this screen's own off.
    <section className={embedded ? 'min-w-0' : 'min-w-0 flex-1 px-4 pb-10 sm:px-7'}>
      {!embedded && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">Customer Management</h1>
        </>
      )}
      <p className={`${embedded ? 'mt-4' : 'mt-2'} text-sm text-ink-500`}>{isAdmin ? 'Search and manage customer records.' : 'Search customer records.'}</p>

      {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}

      <form className="mt-6 flex flex-wrap gap-2" onSubmit={handleSearchSubmit}>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email, or contact number"
          aria-label="Search customers"
          className="flex-1"
        />
        <Button type="submit">Search</Button>
      </form>

      <Card className="mt-4 p-6">
        {loading ? (
          <LoadingRows className="mt-4" />
        ) : customers.length === 0 ? (
          <EmptyState title="No customers found" description="Try a different name, email, or contact number." />
        ) : (
          <Table caption="Customer records">
            <Thead>
              <Tr className="hover:bg-transparent">
                <Th>Name</Th>
                <Th priority="lg">Username</Th>
                <Th priority="md">Contact</Th>
                <Th priority="xl">Email</Th>
                <Th>Status</Th>
                {isAdmin && <Th>Actions</Th>}
              </Tr>
            </Thead>
            <Tbody>
              {customers.map((customer) =>
                editingId === customer.id ? (
                  // One cell spanning the row: a stacked form survives
                  // whichever columns the current width has dropped.
                  <Tr key={customer.id}>
                    <td colSpan={6} className="px-3 py-3 text-sm text-ink-700"><div className="row-form">
                      <p className="text-xs text-ink-500">Editing {customer.username}</p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="First name" error={editErrors.firstName}>
                          <Input value={editForm.firstName} onChange={(event) => setEditForm({ ...editForm, firstName: event.target.value })} />
                        </Field>
                        <Field label="Last name" error={editErrors.lastName}>
                          <Input value={editForm.lastName} onChange={(event) => setEditForm({ ...editForm, lastName: event.target.value })} />
                        </Field>
                        <Field label="Contact number" error={editErrors.contactNumber}>
                          <Input value={editForm.contactNumber} onChange={(event) => setEditForm({ ...editForm, contactNumber: digitsOnly(event.target.value) })} inputMode="numeric" maxLength={11} />
                        </Field>
                        <Field label="Email" error={editErrors.email}>
                          <Input value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} type="email" />
                        </Field>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={(event) => saveEdit(event, customer.id)} disabled={editSubmitting}>{editSubmitting ? 'Saving…' : 'Save'}</Button>
                        <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                      </div>
                    </div></td>
                  </Tr>
                ) : (
                  <Tr key={customer.id}>
                    <Td className="font-semibold text-ink-900">
                      {customer.name}
                      <span className="block text-xs font-normal text-ink-500 lg:hidden">{customer.username}</span>
                      <span className="block text-xs font-normal text-ink-500 md:hidden">{customer.contactNumber}</span>
                    </Td>
                    <Td priority="lg">{customer.username}</Td>
                    <Td priority="md">{customer.contactNumber}</Td>
                    <Td priority="xl">{customer.email}</Td>
                    <Td><StatusBadge status={customer.isActive ? 'ACTIVE' : 'INACTIVE'} label={customer.isActive ? 'Active' : 'Inactive'} /></Td>
                    {isAdmin && (
                      <Td>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(customer)}>Edit</Button>
                          <Button size="sm" variant={customer.isActive ? 'destructive' : 'secondary'} onClick={() => toggleActive(customer)} disabled={togglingId === customer.id}>
                            {togglingId === customer.id ? 'Working…' : customer.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </Td>
                    )}
                  </Tr>
                ),
              )}
            </Tbody>
          </Table>
        )}
      </Card>
    </section>
  )
}
