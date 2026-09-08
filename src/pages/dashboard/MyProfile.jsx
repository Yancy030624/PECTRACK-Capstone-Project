import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { AddressForm } from '../../components/AddressForm.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'

const emptyPasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

// Stage 5.5 (RULES-PLANS/UI_AUDIT.md) — MyProfile is granted to every role
// (modules.js), so it was the one screen every user landed on still in the
// pre-token style even after Stages 3-5. Converted onto the same primitive
// kit PaymentBilling/InventoryRequests/MyDeliveries already established:
// Field/Input replace the three hand-rolled input shapes (H3), <Alert>
// replaces the 10px role="status" paragraphs (C3), <Button> replaces the
// hand-rolled tab pills and submit buttons, the page title drops from
// text-3xl font-extrabold to 24px/600 (H1/H2).
//
// AddressForm.jsx (src/components/AddressForm.jsx) is a separate component
// and out of this stage's scope — it is untouched here, imported exactly as
// before. It already builds its POST /api/addresses body correctly for the
// DB-default-field bug this stage's brief calls out: municipality,
// province, postalCode, deliveryNotes, and addressLine2 are only added when
// non-blank, never spread unconditionally. handleSetDefault and
// handleToggleActive below each send exactly one boolean field
// (isDefault: true / isActive: bool) and are unchanged from before this
// pass.
export function MyProfile({ user, onUserUpdated }) {
  const isCustomer = user.role === 'CUSTOMER'
  const tabs = isCustomer ? ['Profile', 'Addresses', 'Password'] : ['Profile', 'Password']
  const [activeTab, setActiveTab] = useState('Profile')

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">My Profile</h1>
      <p className="mt-2 text-sm text-ink-500">{isCustomer ? 'Your details, saved addresses, and password — all in one place.' : 'Update your own name, email, and contact number.'}</p>

      <div className="mt-6 flex gap-2">
        {tabs.map((tab) => (
          <Button type="button" key={tab} size="sm" variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === 'Profile' && <ProfileTab user={user} onUserUpdated={onUserUpdated} />}
      {activeTab === 'Addresses' && isCustomer && <AddressesTab />}
      {activeTab === 'Password' && <PasswordTab />}
    </section>
  )
}

function ProfileTab({ user, onUserUpdated }) {
  const [form, setForm] = useState({ name: user.name, email: user.email ?? '', contactNumber: user.contactNumber ?? '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const updateField = (field, value) => setForm({ ...form, [field]: value })

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setMessage('')
    try {
      const data = await apiPatch('/api/auth/me', form)
      setMessage('Profile updated.')
      setMessageFailed(false)
      onUserUpdated?.(data.user)
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="mt-6 max-w-lg p-6">
      <form className="space-y-3" onSubmit={handleSubmit} noValidate>
        <Field label="Username">
          <Input value={user.username} disabled />
        </Field>
        <Field label="Full name" error={errors.name}>
          <Input value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" />
        </Field>
        <Field label="Contact number" error={errors.contactNumber}>
          <Input value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} autoComplete="tel" inputMode="tel" />
        </Field>
        {message && <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>}
        <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving…' : 'Save changes'}</Button>
      </form>
    </Card>
  )
}

// --- Password tab -----------------------------------------------------------
function PasswordTab() {
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm)
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordFailed, setPasswordFailed] = useState(false)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  const updatePasswordField = (field, value) => setPasswordForm({ ...passwordForm, [field]: value })

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    setPasswordSubmitting(true)
    setPasswordErrors({})
    setPasswordMessage('')
    setPasswordFailed(false)
    try {
      const data = await apiPatch('/api/auth/password', passwordForm)
      setPasswordForm(emptyPasswordForm)
      setPasswordMessage(data.otherSessionsEnded > 0
        ? `Password updated. You were signed out on ${data.otherSessionsEnded} other device${data.otherSessionsEnded === 1 ? '' : 's'}.`
        : 'Password updated.')
    } catch (error) {
      setPasswordErrors(error.errors ?? {})
      setPasswordMessage(error.message)
      setPasswordFailed(true)
    } finally {
      setPasswordSubmitting(false)
    }
  }

  return (
    <>
      <p className="mt-6 max-w-lg text-sm text-ink-500">You'll stay signed in here, but any other device using your account will be signed out.</p>
      <Card className="mt-4 max-w-lg p-6">
        <form className="space-y-3" onSubmit={handlePasswordSubmit} noValidate>
          <Field label="Current password" error={passwordErrors.currentPassword}>
            <Input type="password" value={passwordForm.currentPassword} onChange={(event) => updatePasswordField('currentPassword', event.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" error={passwordErrors.newPassword}>
            <Input type="password" value={passwordForm.newPassword} onChange={(event) => updatePasswordField('newPassword', event.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" error={passwordErrors.confirmPassword}>
            <Input type="password" value={passwordForm.confirmPassword} onChange={(event) => updatePasswordField('confirmPassword', event.target.value)} autoComplete="new-password" />
          </Field>
          <p className="text-xs text-ink-500">At least 12 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.</p>
          {passwordMessage && <Alert variant={passwordFailed ? 'error' : 'success'}>{passwordMessage}</Alert>}
          <Button type="submit" size="sm" disabled={passwordSubmitting}>{passwordSubmitting ? 'Updating…' : 'Update password'}</Button>
        </form>
      </Card>
    </>
  )
}

// --- Addresses tab -----------------------------------------------------------
function AddressesTab() {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [actingOnId, setActingOnId] = useState(null)

  const loadAddresses = async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/addresses${includeInactive ? '?includeInactive=true' : ''}`)
      setAddresses(data.addresses)
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAddresses()
  }, [includeInactive])

  const handleAddressSaved = async () => {
    setShowForm(false)
    setMessage('Address saved.')
    setMessageFailed(false)
    await loadAddresses()
  }

  const handleSetDefault = async (addressId) => {
    setActingOnId(addressId)
    setMessage('')
    try {
      await apiPatch(`/api/addresses/${addressId}`, { isDefault: true })
      await loadAddresses()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setActingOnId(null)
    }
  }

  const handleToggleActive = async (addressId, nextActive) => {
    setActingOnId(addressId)
    setMessage('')
    try {
      await apiPatch(`/api/addresses/${addressId}`, { isActive: nextActive })
      await loadAddresses()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setActingOnId(null)
    }
  }

  return (
    <Card className="mt-6 p-6">
      <p className="text-sm text-ink-500">Saved delivery addresses for your account. Your first address becomes the default automatically.</p>
      {message && (
        <div className="mt-3">
          <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-100 pt-4">
        <h2 className="text-lg font-semibold text-ink-900">Your addresses</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Show deactivated
          </label>
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'Add address'}</Button>
        </div>
      </div>

      {showForm && (
        <div className="mt-4 border-t border-line-100 pt-4">
          <AddressForm onSaved={handleAddressSaved} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <div className="mt-4 border-t border-line-100 pt-4">
        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : addresses.length === 0 ? (
          <EmptyState title="No addresses saved yet" />
        ) : (
          <ul className="divide-y divide-line-100">
            {addresses.map((address) => (
              <li key={address.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">
                      {address.label}
                      {address.isDefault && <span className="ml-2 rounded-full bg-status-done-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-done-fg">Default</span>}
                      {!address.isActive && <span className="ml-2 rounded-full bg-status-idle-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-idle-fg">Deactivated</span>}
                    </p>
                    <p className="mt-1 text-ink-600">{address.recipientName} · {address.contactNumber}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {address.addressLine1}{address.addressLine2 && `, ${address.addressLine2}`}
                      {address.barangay && `, ${address.barangay}`}, {address.municipality}, {address.province}
                      {address.postalCode && ` ${address.postalCode}`}
                    </p>
                    {address.deliveryNotes && <p className="mt-0.5 text-xs text-ink-500">"{address.deliveryNotes}"</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {address.isActive && !address.isDefault && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => handleSetDefault(address.id)} disabled={actingOnId === address.id}>Set as default</Button>
                    )}
                    {address.isActive ? (
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleToggleActive(address.id, false)} disabled={actingOnId === address.id}>Deactivate</Button>
                    ) : (
                      <Button type="button" size="sm" onClick={() => handleToggleActive(address.id, true)} disabled={actingOnId === address.id}>Reactivate</Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
