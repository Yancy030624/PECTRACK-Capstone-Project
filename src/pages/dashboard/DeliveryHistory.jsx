import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { PrintButton, PrintHeader } from '../../components/PrintReport.jsx'
import { formatDate, formatDateTime, formatPeso } from '../../lib/format.js'

// My Deliveries → History. PHASE10 B4, the paper's "review their delivery
// history and completed transactions" (p.15) and its Delivery Reports
// screen (p.43). Once a delivery is delivered or failed it leaves the
// Assigned list; this is where the driver finds it again — with the
// counts a delivery report needs, and Save as PDF.
//
// Dates are the bakery's calendar (Asia/Manila), the same as every report.
const manilaDate = (instant) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(instant)

export function DeliveryHistory({ user }) {
  const [fromInput, setFromInput] = useState(() => manilaDate(new Date(Date.now() - 29 * 86400000)))
  const [toInput, setToInput] = useState(() => manilaDate(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  const load = async (event) => {
    event?.preventDefault()
    setLoading(true)
    setErrors({})
    setMessage('')
    try {
      setData(await apiGet(`/api/deliveries/mine/history?${new URLSearchParams({ from: fromInput, to: toInput })}`))
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  // First load only; after that the driver picks a range and presses Show.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const counts = data?.counts
  const finished = counts ? counts.delivered + counts.failed : 0

  return (
    <div>
      <PrintHeader
        title="Delivery report"
        subtitle={data ? `${formatDate(`${data.from}T00:00:00`)} – ${formatDate(`${data.to}T00:00:00`)}` : undefined}
        user={user}
      />

      <Card className="mt-4 p-4 sm:p-5 print:hidden">
        <form onSubmit={load} className="flex flex-wrap items-end gap-3">
          <Field label="From" error={errors.from}>
            <Input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} className="w-auto" />
          </Field>
          <Field label="To" error={errors.to}>
            <Input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} className="w-auto" />
          </Field>
          <Button type="submit" size="sm" disabled={loading}>{loading ? 'Loading…' : 'Show'}</Button>
          <span className="ml-auto"><PrintButton /></span>
        </form>
      </Card>

      {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}

      {counts && (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-medium text-ink-500">Delivered</p>
            <p className="mt-1 text-2xl font-semibold text-ink-900 tabular-nums">{counts.delivered}</p>
            {finished > 0 && <p className="mt-0.5 text-[11px] text-ink-500">{Math.round((counts.delivered / finished) * 100)}% of finished</p>}
          </Card>
          <Card className="p-4"><p className="text-xs font-medium text-ink-500">Failed</p><p className="mt-1 text-2xl font-semibold text-ink-900 tabular-nums">{counts.failed}</p></Card>
          <Card className="p-4"><p className="text-xs font-medium text-ink-500">Assigned now</p><p className="mt-1 text-2xl font-semibold text-ink-900 tabular-nums">{counts.assignedNow}</p><p className="mt-0.5 text-[11px] text-ink-500">Not yet finished</p></Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-ink-500">Cash collected</p>
            <p className="mt-1 text-2xl font-semibold text-ink-900 tabular-nums">{formatPeso(counts.cashCollected)}</p>
            <p className="mt-0.5 text-[11px] text-ink-500">{counts.cashPayments} payment{counts.cashPayments === 1 ? '' : 's'} at the door</p>
          </Card>
        </div>
      )}

      {loading && !data ? (
        <LoadingRows className="mt-4" />
      ) : data && data.deliveries.length === 0 ? (
        <div className="mt-4"><EmptyState title="No finished deliveries in this range." /></div>
      ) : data && (
        <>
          <ul className="mt-4 space-y-3">
            {data.deliveries.map((delivery) => (
              <li key={delivery.id} className="break-inside-avoid">
                <Card className="p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">Order #{delivery.orderId} · {delivery.customerName ?? 'Customer'}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {delivery.address.addressLine1}{delivery.address.barangay && `, ${delivery.address.barangay}`}, {delivery.address.municipality}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {delivery.status === 'DELIVERED' ? `Delivered ${formatDateTime(delivery.deliveredAt)}` : `Failed ${formatDateTime(delivery.failedAt)}`}
                        {' · '}<span className="tabular-nums">{formatPeso(delivery.totalAmount)}</span>
                        {delivery.proofCount > 0 && ` · ${delivery.proofCount} proof photo${delivery.proofCount === 1 ? '' : 's'}`}
                      </p>
                      {delivery.status === 'FAILED' && delivery.note && <p className="mt-0.5 whitespace-pre-line text-xs text-status-fail-fg">{delivery.note}</p>}
                    </div>
                    <StatusBadge status={delivery.status} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          {data.truncated && <p className="mt-3 text-xs text-ink-500">Showing the latest {data.deliveries.length} — narrow the range to see older ones. The counts above cover the whole range.</p>}
        </>
      )}
    </div>
  )
}
