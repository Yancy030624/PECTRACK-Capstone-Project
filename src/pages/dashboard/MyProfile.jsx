import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { AddressForm } from '../../components/AddressForm.jsx'

const emptyPasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

export function MyProfile({ user, onUserUpdated }) {
  const isCustomer = user.role === 'CUSTOMER'
  const tabs = isCustomer ? ['Profile', 'Addresses', 'Password'] : ['Profile', 'Password']
  const [activeTab, setActiveTab] = useState('Profile')

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">My Profile</h1>
      <p className="mt-2 text-sm text-slate-500">{isCustomer ? 'Your details, saved addresses, and password — all in one place.' : 'Update your own name, email, and contact number.'}</p>

      <div className="mt-6 flex gap-2">
        {tabs.map((tab) => (
          <button type="button" key={tab} onClick={() => setActiveTab(tab)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === tab ? 'bg-green-700 text-white' : 'bg-green-50 text-green-800 hover:bg-green-100'}`}>{tab}</button>
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
      onUserUpdated?.(data.user)
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-6 max-w-lg rounded-2xl border border-green-100 bg-white p-6">
      <form className="space-y-3" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="profile-username" className="mb-1.5 block text-[11px] font-extrabold">Username</label>
          <input id="profile-username" value={user.username} disabled className="w-full cursor-not-allowed rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-500 shadow-sm outline-none" />
        </div>
        <div>
          <label htmlFor="profile-name" className="mb-1.5 block text-[11px] font-extrabold">Full name</label>
          <input id="profile-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
          {errors.name && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="profile-email" className="mb-1.5 block text-[11px] font-extrabold">Email</label>
          <input id="profile-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
          {errors.email && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="profile-contact" className="mb-1.5 block text-[11px] font-extrabold">Contact number</label>
          <input id="profile-contact" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} autoComplete="tel" inputMode="tel" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
          {errors.contactNumber && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.contactNumber}</p>}
        </div>
        {message && <p role="status" className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${Object.keys(errors).length ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}
        <button type="submit" disabled={submitting} className="rounded-2xl bg-green-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Saving…' : 'Save changes'}</button>
      </form>
    </div>
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
      <p className="mt-6 max-w-lg text-xs text-slate-500">You'll stay signed in here, but any other device using your account will be signed out.</p>
      <div className="mt-4 max-w-lg rounded-2xl border border-green-100 bg-white p-6">
        <form className="space-y-3" onSubmit={handlePasswordSubmit} noValidate>
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-[11px] font-extrabold">Current password</label>
            <input id="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => updatePasswordField('currentPassword', event.target.value)} autoComplete="current-password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            {passwordErrors.currentPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{passwordErrors.currentPassword}</p>}
          </div>
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-[11px] font-extrabold">New password</label>
            <input id="new-password" type="password" value={passwordForm.newPassword} onChange={(event) => updatePasswordField('newPassword', event.target.value)} autoComplete="new-password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            {passwordErrors.newPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{passwordErrors.newPassword}</p>}
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-[11px] font-extrabold">Confirm new password</label>
            <input id="confirm-password" type="password" value={passwordForm.confirmPassword} onChange={(event) => updatePasswordField('confirmPassword', event.target.value)} autoComplete="new-password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            {passwordErrors.confirmPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{passwordErrors.confirmPassword}</p>}
          </div>
          <p className="text-[10px] text-slate-500">At least 12 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.</p>
          {passwordMessage && <p role="status" className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${passwordFailed ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{passwordMessage}</p>}
          <button type="submit" disabled={passwordSubmitting} className="rounded-2xl bg-green-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{passwordSubmitting ? 'Updating…' : 'Update password'}</button>
        </form>
      </div>
    </>
  )
}
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
    <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
      <p className="text-sm text-slate-500">Saved delivery addresses for your account. Your first address becomes the default automatically.</p>
      {message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[10px] font-semibold ${messageFailed ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <h2 className="text-lg font-bold">Your addresses</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Show deactivated
          </label>
          <button type="button" onClick={() => setShowForm(!showForm)} className="rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800">{showForm ? 'Cancel' : 'Add address'}</button>
        </div>
      </div>

      {showForm && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <AddressForm onSaved={handleAddressSaved} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : addresses.length === 0 ? (
          <p className="text-sm text-slate-500">No addresses saved yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {addresses.map((address) => (
              <li key={address.id} className="py-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">
                      {address.label}
                      {address.isDefault && <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-800">DEFAULT</span>}
                      {!address.isActive && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">DEACTIVATED</span>}
                    </p>
                    <p className="mt-1 text-slate-600">{address.recipientName} · {address.contactNumber}</p>
                    <p className="mt-0.5 text-slate-500">
                      {address.addressLine1}{address.addressLine2 && `, ${address.addressLine2}`}
                      {address.barangay && `, ${address.barangay}`}, {address.municipality}, {address.province}
                      {address.postalCode && ` ${address.postalCode}`}
                    </p>
                    {address.deliveryNotes && <p className="mt-0.5 text-slate-500">"{address.deliveryNotes}"</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {address.isActive && !address.isDefault && (
                      <button type="button" onClick={() => handleSetDefault(address.id)} disabled={actingOnId === address.id} className="rounded-lg border border-green-700 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60">Set as default</button>
                    )}
                    {address.isActive ? (
                      <button type="button" onClick={() => handleToggleActive(address.id, false)} disabled={actingOnId === address.id} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60">Deactivate</button>
                    ) : (
                      <button type="button" onClick={() => handleToggleActive(address.id, true)} disabled={actingOnId === address.id} className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60">Reactivate</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
