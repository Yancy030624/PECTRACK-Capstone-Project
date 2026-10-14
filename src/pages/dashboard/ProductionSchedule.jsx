import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { PrintButton, PrintHeader } from '../../components/PrintReport.jsx'
import { formatDate, formatDateTime } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'
import { manilaDate } from '../../lib/dates.js'

// Production → Due today. PHASE10 B5 — the interview problem still open
// (thesis p.9): "if the order is for 6:00 but the bread is finished at
// 7:00, it causes delays." Open orders grouped by the hour they are due,
// with what is still to make in each hour, so the baker sees what has to
// be ready, by when — and which hour is already late.
//
// Today refreshes itself every minute: "due soon" and "overdue" are about
// the clock, and a screen left open at the counter should not go stale.
const hourLabel = (hour) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`
const slotTitle = (slot) => {
  if (slot.key === 'EARLIER') return 'Overdue from earlier days'
  if (slot.key === 'ASAP') return 'As soon as possible'
  return `Due ${hourLabel(slot.hour)} – ${hourLabel((slot.hour + 1) % 24)}`
}
const itemName = (item) => `${item.name}${item.variant ? ` (${item.variant})` : ''}`
const notReady = new Set(['PLACED', 'CONFIRMED', 'IN_PRODUCTION'])

function ItemList({ items }) {
  if (items.length === 0) return <p className="text-xs text-ink-500">Everything in this group is ready.</p>
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item.productId} className="rounded-control border border-line-200 bg-surface-sunk px-2.5 py-1 text-xs text-ink-700">
          <span className="font-semibold tabular-nums text-ink-900">{item.quantity}×</span> {itemName(item)}
        </li>
      ))}
    </ul>
  )
}

export function ProductionSchedule({ user }) {
  const today = manilaDate(new Date())
  const tomorrow = manilaDate(new Date(Date.now() + 86400000))
  const [date, setDate] = useState(today)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = useCallback(async ({ background = false } = {}) => {
    try {
      setData(await apiGet(`/api/production/schedule?date=${date}`, { background }))
      setMessage('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    setLoading(true)
    load()
    if (date !== today) return undefined
    const timer = setInterval(() => load({ background: true }), 60000)
    return () => clearInterval(timer)
  }, [date, today, load])

  return (
    <div>
      <PrintHeader title="Production schedule" subtitle={data ? `Orders due ${formatDate(`${data.date}T00:00:00`)}` : undefined} user={user} />

      <Card className="mt-6 p-4 sm:p-5 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={date === today ? 'primary' : 'secondary'} onClick={() => setDate(today)}>Today</Button>
          <Button type="button" size="sm" variant={date === tomorrow ? 'primary' : 'secondary'} onClick={() => setDate(tomorrow)}>Tomorrow</Button>
          <div className="w-44"><Input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label="Schedule date" /></div>
          <span className="ml-auto"><PrintButton /></span>
        </div>
      </Card>

      {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}

      {loading && !data ? (
        <LoadingRows className="mt-4" />
      ) : data && data.slots.length === 0 ? (
        <div className="mt-4"><EmptyState title={`No open orders due ${data.isToday ? 'today' : formatDate(`${data.date}T00:00:00`)}.`} description="Orders with a requested time show here, grouped by the hour they are due." /></div>
      ) : data && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Card className="p-4"><p className="text-xs font-medium text-ink-500">Open orders</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{data.counts.orders}</p></Card>
            <Card className="p-4"><p className="text-xs font-medium text-ink-500">Not ready yet</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{data.counts.notReady}</p></Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-ink-500">Overdue</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${data.counts.overdue > 0 ? 'text-status-fail-fg' : 'text-ink-900'}`}>{data.counts.overdue}</p>
            </Card>
          </div>

          <Card className="mt-4 p-5 break-inside-avoid">
            <h2 className="text-base font-semibold text-ink-900">Still to make{data.isToday ? ' today' : ''}</h2>
            <p className="mt-1 text-xs text-ink-500">Every order below that is not ready yet, added up per product.</p>
            <div className="mt-3"><ItemList items={data.items} /></div>
          </Card>

          <ol className="mt-4 space-y-4">
            {data.slots.map((slot) => (
              <li key={slot.key} className="break-inside-avoid">
                <Card className={`p-5 ${slot.overdue ? 'border-status-fail-fg' : slot.dueSoon ? 'border-status-wait-fg' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink-900">{slotTitle(slot)}</h3>
                    {slot.overdue && <span className="rounded-full bg-status-fail-bg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-fail-fg">Overdue</span>}
                    {!slot.overdue && slot.dueSoon && <span className="rounded-full bg-status-wait-bg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-wait-fg">Due within the hour</span>}
                    <span className="ml-auto text-xs text-ink-500">{slot.orders.length} order{slot.orders.length === 1 ? '' : 's'} · {slot.notReady} not ready</span>
                  </div>
                  <div className="mt-3"><ItemList items={slot.items} /></div>
                  <ul className="mt-4 divide-y divide-line-100 border-t border-line-100">
                    {slot.orders.map((order) => (
                      <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                        <span className="font-semibold text-ink-900">{orderLabel(order)}</span>
                        <span className="text-ink-700">{order.customerName}</span>
                        <span className="text-xs text-ink-500">{order.orderType === 'DELIVERY' ? 'Delivery' : 'Pickup'}{order.requestedFulfillmentTime ? ` · ${formatDateTime(order.requestedFulfillmentTime)}` : ` · placed ${formatDateTime(order.orderDate)}`}</span>
                        <span className="text-xs text-ink-500">{order.items.map((item) => `${item.quantity}× ${itemName(item)}`).join(', ')}</span>
                        <span className="ml-auto flex items-center gap-2">
                          {order.awaitingPayment && <span className="rounded-full bg-status-fail-bg px-2 py-0.5 text-[11px] font-semibold text-status-fail-fg">Not paid — don&apos;t bake yet</span>}
                          {order.overdue && <span className="text-[11px] font-semibold text-status-fail-fg">Late</span>}
                          {!order.overdue && order.dueSoon && notReady.has(order.status) && <span className="text-[11px] font-semibold text-status-wait-fg">Soon</span>}
                          <StatusBadge status={order.status} />
                        </span>
                        {order.instructions && <p className="w-full text-xs text-ink-500">“{order.instructions}”</p>}
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ol>
          {data.truncated && <p className="mt-3 text-xs text-ink-500">Showing the first 500 orders only.</p>}
        </>
      )}
    </div>
  )
}
