import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'

const emptyForm = { role: 'CASHIER', name: '', username: '', email: '', contactNumber: '', password: '', confirmPassword: '' }
const roleLabels = { CASHIER: 'Cashier', DELIVERY_PERSONNEL: 'Delivery Personnel' }

// Stage 5.5 (RULES-PLANS/UI_AUDIT.md) — admin-only screen, converted onto
// the same primitive kit as PaymentBilling/InventoryRequests: Field/Input/
// Select replace the three hand-rolled input shapes (H3), <Alert> replaces
// the 10px role="status" paragraphs (C3), the Active/Inactive pill is
// <StatusBadge> (its ACTIVE/INACTIVE tokens already exist in the shared
// map — H7), the row actions are <Button size="sm">, and the staff table
// is <Table>/<Th>/<Td> so it gets scope="col" headers and a caption for
// free (M6). Page title drops to 24px/600 (H1/H2).
//
// Backed by GET/POST/PATCH /api/staff (requireAuth + requireRole('ADMIN')).
// None of handleSubmit's, saveEdit's, or toggleActive's request bodies
// changed — this is presentation only.
export function StaffManagement() {
  // Hold the staff list fetched from the server.
  const [staff, setStaff] = useState([])
  // Track whether the initial list is still loading.
  const [loading, setLoading] = useState(true)
  // Store the create-staff form values in one convenient object.
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Which row is currently being edited (a staff id), or null when none is.
  const [editingId, setEditingId] = useState(null)
  // The in-progress edits for that row — separate from the create form above.
  const [editForm, setEditForm] = useState({ name: '', email: '', contactNumber: '' })
  const [editErrors, setEditErrors] = useState({})
  const [editMessage, setEditMessage] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  // Tracks which row's activate/deactivate request is in flight, so only
  // that row's button shows a disabled/pending state.
  const [togglingId, setTogglingId] = useState(null)

  // Update a single form field without losing the others.
  const updateField = (field, value) => setForm({ ...form, [field]: value })
  const updateEditField = (field, value) => setEditForm({ ...editForm, [field]: value })

  // Load the current staff list — reused after a successful creation too,
  // so the list always reflects what's actually in the database.
  const loadStaff = async () => {
    try {
      const data = await apiGet('/api/staff')
      setStaff(data.staff)
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStaff()
  }, [])

  // Create the account, then refresh the list so the new row appears.
  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    setErrors({})
    try {
      await apiPost('/api/staff', form)
      setForm(emptyForm)
      setMessage('Staff account created.')
      setMessageFailed(false)
      await loadStaff()
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  // Switch a row into edit mode, seeded with its current values.
  const startEdit = (person) => {
    setEditingId(person.id)
    setEditForm({ name: person.name, email: person.email, contactNumber: person.contactNumber })
    setEditErrors({})
    setEditMessage('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditErrors({})
    setEditMessage('')
  }

  // Save the edited row, then refresh the list so it reflects the saved values.
  const saveEdit = async (event, personId) => {
    event.preventDefault()
    setEditSubmitting(true)
    setEditErrors({})
    setEditMessage('')
    try {
      await apiPatch(`/api/staff/${personId}`, editForm)
      setEditingId(null)
      await loadStaff()
    } catch (error) {
      setEditErrors(error.errors ?? {})
      setEditMessage(error.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  // Flip a staff account's active status. Deactivating cuts off access
  // immediately (requireAuth re-checks is_active on every request), so
  // confirm before doing it — reactivating is safe to do without asking.
  const toggleActive = async (person) => {
    if (person.isActive && !window.confirm(`Deactivate ${person.name}? They will be signed out immediately and unable to log in until reactivated.`)) return
    setTogglingId(person.id)
    try {
      await apiPatch(`/api/staff/${person.id}`, { isActive: !person.isActive })
      await loadStaff()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">ADMIN PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Staff Management</h1>
      <p className="mt-2 text-sm text-ink-500">Create and review cashier and delivery-personnel accounts.</p>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold text-ink-900">New staff account</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role" error={errors.role}>
              <Select value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                <option value="CASHIER">Cashier</option>
                <option value="DELIVERY_PERSONNEL">Delivery Personnel</option>
              </Select>
            </Field>
            <Field label="Full name" error={errors.name}>
              <Input value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" placeholder="Full name" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username" error={errors.username}>
              <Input value={form.username} onChange={(event) => updateField('username', event.target.value)} autoComplete="off" placeholder="e.g. juan.delacruz" />
            </Field>
            <Field label="Contact number" error={errors.contactNumber}>
              <Input value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} autoComplete="tel" inputMode="tel" placeholder="09XXXXXXXXX" />
            </Field>
          </div>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="off" placeholder="name@example.com" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Password" error={errors.password}>
              <Input type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="new-password" placeholder="Set an initial password" />
            </Field>
            <Field label="Confirm password" error={errors.confirmPassword}>
              <Input type="password" value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} autoComplete="new-password" placeholder="Repeat password" />
            </Field>
          </div>
          {message && <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>}
          <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</Button>
        </form>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Current staff</h2>
        {loading ? (
          <p className="mt-4 text-sm text-ink-500">Loading…</p>
        ) : staff.length === 0 ? (
          <EmptyState title="No staff accounts yet" />
        ) : (
          <div className="mt-4">
            {editMessage && (
              <div className="mb-3">
                <Alert variant={Object.keys(editErrors).length ? 'error' : 'success'}>{editMessage}</Alert>
              </div>
            )}
            <Table caption="Current staff">
              <Thead>
                <Tr className="hover:bg-transparent">
                  <Th>Name</Th>
                  <Th>Username</Th>
                  <Th>Role</Th>
                  <Th>Contact</Th>
                  <Th>Email</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {staff.map((person) =>
                  editingId === person.id ? (
                    <Tr key={person.id}>
                      <Td>
                        <Input value={editForm.name} onChange={(event) => updateEditField('name', event.target.value)} className="h-8 text-xs" />
                        {editErrors.name && <p className="mt-1 text-xs text-red-700">{editErrors.name}</p>}
                      </Td>
                      <Td className="text-ink-500">{person.username}</Td>
                      <Td className="text-ink-500">{roleLabels[person.role] ?? person.role}</Td>
                      <Td>
                        <Input value={editForm.contactNumber} onChange={(event) => updateEditField('contactNumber', event.target.value)} className="h-8 text-xs" />
                        {editErrors.contactNumber && <p className="mt-1 text-xs text-red-700">{editErrors.contactNumber}</p>}
                      </Td>
                      <Td>
                        <Input value={editForm.email} onChange={(event) => updateEditField('email', event.target.value)} className="h-8 text-xs" />
                        {editErrors.email && <p className="mt-1 text-xs text-red-700">{editErrors.email}</p>}
                      </Td>
                      <Td><StatusBadge status={person.isActive ? 'ACTIVE' : 'INACTIVE'} /></Td>
                      <Td>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={(event) => saveEdit(event, person.id)} disabled={editSubmitting}>{editSubmitting ? 'Saving…' : 'Save'}</Button>
                          <Button type="button" size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      </Td>
                    </Tr>
                  ) : (
                    <Tr key={person.id}>
                      <Td className="font-semibold text-ink-900">{person.name}</Td>
                      <Td>{person.username}</Td>
                      <Td>{roleLabels[person.role] ?? person.role}</Td>
                      <Td>{person.contactNumber}</Td>
                      <Td>{person.email}</Td>
                      <Td><StatusBadge status={person.isActive ? 'ACTIVE' : 'INACTIVE'} /></Td>
                      <Td>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(person)}>Edit</Button>
                          <Button type="button" size="sm" variant={person.isActive ? 'destructive' : 'primary'} onClick={() => toggleActive(person)} disabled={togglingId === person.id}>
                            {togglingId === person.id ? 'Working…' : person.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ),
                )}
              </Tbody>
            </Table>
          </div>
        )}
      </Card>
    </section>
  )
}
