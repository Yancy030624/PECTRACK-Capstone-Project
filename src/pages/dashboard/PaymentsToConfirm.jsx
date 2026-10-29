// Payment & Billing → To confirm (RULES-PLANS/QRPH_PLAN.md). A customer who
// paid by scanning the bakery's QR Ph code sends the reference number; a
// plain QR code tells the system nothing, so a person checks the bakery's
// own bank or e-wallet app for that reference and amount, then confirms or
// rejects it here (Q4). Confirm makes the order Ready for pickup or for
// delivery; Reject cancels it, returns its stock, and tells the customer
// why (Q9). Both are logged with who and when.
//
// The admin also sets the bakery's QR Ph code and account name here (Q2).
import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost, apiUpload } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDateTime, formatPeso } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'

const refreshEveryMs = 15000

const waitedFor = (sentAt) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min ago`
}

export function PaymentsToConfirm({ user, onChanged }) {
  const [payments, setPayments] = useState(null)
  const [overdueMinutes, setOverdueMinutes] = useState(30)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    try {
      const data = await apiGet('/api/qrph/to-confirm', { background: true })
      setPayments(data.payments)
      setOverdueMinutes(data.overdueMinutes)
    } catch (error) {
      setMessage(error.message)
      setPayments((current) => current ?? [])
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, refreshEveryMs)
    return () => window.clearInterval(timer)
  }, [])

  const decided = async (text) => {
    setNotice(text)
    setMessage('')
    await load()
    onChanged?.()
  }

  return (
    <div className="mt-6 grid gap-4 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card className="min-w-0 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Payments to confirm</h2>
        <p className="mt-1 text-sm text-ink-500">Open the bakery's GCash or bank app, find each reference number and amount, then confirm or reject it. Oldest first.</p>
        {notice && <div className="mt-4"><Alert variant="success">{notice}</Alert></div>}
        {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}
        {payments === null ? (
          <LoadingRows className="mt-4" />
        ) : payments.length === 0 ? (
          <EmptyState title="No payments waiting" />
        ) : (
          <ul className="mt-4 space-y-3">
            {payments.map((payment) => (
              <PaymentToConfirm key={payment.id} payment={payment} overdueMinutes={overdueMinutes} onDecided={decided} onError={setMessage} />
            ))}
          </ul>
        )}
      </Card>
      {user.role === 'ADMIN' && <QrPhSettings />}
    </div>
  )
}

function PaymentToConfirm({ payment, overdueMinutes, onDecided, onError }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [busy, setBusy] = useState(false)

  const decide = async (decision) => {
    if (decision === 'REJECT' && reason.trim().length < 3) {
      setReasonError('Say why, for example "No payment with this reference number".')
      return
    }
    if (decision === 'CONFIRM' && !window.confirm(`Confirm ${formatPeso(payment.amount)} with reference ${payment.reference}? Only confirm once you have found it in the bakery's app.`)) return
    setBusy(true)
    setReasonError('')
    try {
      await apiPost(`/api/qrph/payments/${payment.id}/verify`, decision === 'CONFIRM' ? { decision } : { decision, reason })
      await onDecided(decision === 'CONFIRM'
        ? `Payment confirmed — order ${orderLabel(payment)} is ${payment.orderType === 'DELIVERY' ? 'ready for delivery' : 'ready for pickup'}.`
        : `Payment rejected — order ${orderLabel(payment)} was cancelled and the customer told why.`)
    } catch (error) {
      if (error.errors?.reason) setReasonError(error.errors.reason)
      else onError(error.message)
      setBusy(false)
      if (error.status === 409) await onDecided('')
    }
  }

  return (
    <li className={`rounded-panel border p-4 ${payment.overdue ? 'border-red-300 bg-red-50/40' : 'border-line-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">
            Order {orderLabel(payment)} · {payment.customerName ?? 'Customer'}
            {payment.overdue && <span className="ml-2 inline-flex rounded-full bg-status-fail-bg px-2 py-0.5 text-[11px] font-semibold text-status-fail-fg">Waiting over {overdueMinutes} min</span>}
          </p>
          <p className="mt-1 text-xs text-ink-500">{payment.orderType === 'DELIVERY' ? 'Delivery' : 'Pickup'}{payment.contactNumber ? ` · ${payment.contactNumber}` : ''} · sent {waitedFor(payment.sentAt)} ({formatDateTime(payment.sentAt)})</p>
        </div>
        <p className="text-lg font-semibold tabular-nums text-ink-900">{formatPeso(payment.amount)}</p>
      </div>
      <p className="mt-3 text-sm text-ink-700">
        Reference number: <span className="font-mono font-semibold tracking-wide break-all text-ink-900">{payment.reference}</span>
      </p>
      {payment.hasProof && (
        <a href={`/api/qrph/payments/${payment.id}/proof`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-brand-700 hover:underline">View the customer's screenshot</a>
      )}

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <Field label="Why is it not accepted?" error={reasonError}>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="No payment with this reference number" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => decide('REJECT')}>{busy ? 'Please wait…' : 'Reject and cancel order'}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setRejecting(false); setReasonError('') }}>Back</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => decide('CONFIRM')}>{busy ? 'Please wait…' : 'Confirm payment'}</Button>
          <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
        </div>
      )}
    </li>
  )
}

// The bakery's QR Ph code as customers see it at checkout (admin only).
function QrPhSettings() {
  const [settings, setSettings] = useState(null)
  const [accountName, setAccountName] = useState('')
  const [nameError, setNameError] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const data = await apiGet('/api/qrph')
    setSettings(data)
    setAccountName(data.accountName ?? '')
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message))
  }, [])

  const uploadImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      await apiUpload('/api/qrph/image', file, 'PUT')
      await load()
      setNotice('QR code saved. Customers see it at checkout now.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const saveName = async (event) => {
    event.preventDefault()
    setBusy(true)
    setNameError('')
    setMessage('')
    setNotice('')
    try {
      await apiPatch('/api/qrph', { accountName })
      await load()
      setNotice('Account name saved.')
    } catch (error) {
      setNameError(error.errors?.accountName ?? '')
      if (!error.errors?.accountName) setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="min-w-0 p-6">
      <h2 className="text-lg font-semibold text-ink-900">Bakery GCash QR code</h2>
      <p className="mt-1 text-sm text-ink-500">The code customers scan to pay. Download it from the bakery's GCash, Maya or bank app ("Receive money" → QR code) and upload it here.</p>
      {notice && <div className="mt-4"><Alert variant="success">{notice}</Alert></div>}
      {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}
      {settings === null ? (
        <LoadingRows className="mt-4" />
      ) : (
        <div className="mt-4 space-y-4">
          {settings.configured
            ? <img src={settings.imageUrl} alt="The bakery's GCash QR code" className="mx-auto w-48 max-w-full rounded-panel border border-line-200 bg-white p-2" />
            : <p className="rounded-panel bg-status-fail-bg p-3 text-sm font-semibold text-status-fail-fg">No QR code yet — customers cannot pay online until one is uploaded.</p>}
          <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-control border border-line-200 bg-surface px-4 text-sm font-medium text-ink-700 hover:bg-surface-sunk md:min-h-9 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {settings.configured ? 'Replace QR code' : 'Upload QR code'}
            <input type="file" accept="image/jpeg,image/png" onChange={uploadImage} className="sr-only" />
          </label>
          <form onSubmit={saveName} className="space-y-2">
            <Field label="Account name" error={nameError} help="Shown under the code, so customers know they are paying the bakery.">
              <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={100} placeholder="Pecto's Bakery" />
            </Field>
            <Button type="submit" size="sm" variant="secondary" disabled={busy}>Save name</Button>
          </form>
        </div>
      )}
    </Card>
  )
}
