// The payment history tab of Payment & Billing. GET /api/payments already
// filters by method, status and date range and pages with limit/offset —
// the Reports screen's Transactions tab has used those since Phase 8;
// this tab ignored them and rendered every row in one unbroken table. The
// same controls now sit here, so the cashier's own money screen can answer
// "today's GCash" without going to Reports.
import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDateTime, formatPeso } from '../../lib/format.js'

const pageSize = 25
const emptyFilters = { from: '', to: '', method: '', status: '' }

export function PaymentLog({ user }) {
  const [filters, setFilters] = useState(emptyFilters)
  const [applied, setApplied] = useState(emptyFilters)
  const [offset, setOffset] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    const loadPayments = async () => {
      setLoading(true)
      setMessage('')
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) })
      if (applied.from) params.set('from', applied.from)
      if (applied.to) params.set('to', applied.to)
      if (applied.method) params.set('method', applied.method)
      if (applied.status) params.set('status', applied.status)
      try {
        setResult(await apiGet(`/api/payments?${params.toString()}`))
        setErrors({})
      } catch (error) {
        setErrors(error.errors ?? {})
        setMessage(error.message)
      } finally {
        setLoading(false)
      }
    }
    loadPayments()
  }, [applied, offset])

  const applyFilters = (event) => {
    event.preventDefault()
    setOffset(0)
    setApplied(filters)
  }
  const clearFilters = () => {
    setFilters(emptyFilters)
    setOffset(0)
    setApplied(emptyFilters)
  }

  const isCustomer = user.role === 'CUSTOMER'
  const caption = isCustomer ? 'Your payments' : 'All payments'
  const payments = result?.payments ?? []
  const total = result?.total ?? 0

  return (
    <Card className="mt-6 p-6">
      <h2 className="text-lg font-semibold text-ink-900">{caption}</h2>

      <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end" onSubmit={applyFilters} noValidate>
        <Field label="From" error={errors.from}>
          <Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
        </Field>
        <Field label="To" error={errors.to}>
          <Input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
        </Field>
        <Field label="Method" error={errors.method}>
          <Select value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value })}>
            <option value="">Any</option>
            <option value="CASH">Cash</option>
            <option value="GCASH">GCash</option>
          </Select>
        </Field>
        <Field label="Status" error={errors.status}>
          <Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">Any</option>
            {['PAID', 'PENDING', 'FAILED', 'CANCELLED', 'REFUNDED'].map((status) => <option key={status} value={status}>{status}</option>)}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          <Button type="button" size="sm" variant="secondary" onClick={clearFilters}>Clear</Button>
        </div>
      </form>

      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}
      {loading ? (
        <LoadingRows className="mt-4" />
      ) : payments.length === 0 ? (
        <EmptyState title={total === 0 && applied === emptyFilters ? 'No payments recorded yet' : 'No payments match'} description={applied === emptyFilters ? undefined : 'Try a wider date range or clear the filters.'} />
      ) : (
        <>
          <div className="mt-4">
            <Table caption={caption}>
              <Thead>
                <Tr className="hover:bg-transparent">
                  <Th>Order</Th>
                  {!isCustomer && <Th priority="md">Customer</Th>}
                  <Th>Method</Th>
                  <Th align="right">Amount</Th>
                  <Th priority="xl">Reference</Th>
                  <Th>Status</Th>
                  <Th priority="lg">Recorded by</Th>
                  <Th priority="md">When</Th>
                </Tr>
              </Thead>
              <Tbody>
                {payments.map((payment) => (
                  <Tr key={payment.id}>
                    <Td className="font-semibold text-ink-900">#{payment.orderId}</Td>
                    {!isCustomer && <Td priority="md">{payment.customerName ?? 'Walk-in'}</Td>}
                    <Td>{payment.method}</Td>
                    <Td numeric>{formatPeso(payment.amount)}</Td>
                    <Td priority="xl" className="text-ink-500">{payment.gatewayReference ?? '—'}</Td>
                    <Td>
                      <StatusBadge status={payment.status} />
                      {payment.status === 'REFUNDED' && payment.refundReason && <p className="mt-1 text-xs text-ink-500">"{payment.refundReason}"</p>}
                    </Td>
                    <Td priority="lg">{payment.status === 'REFUNDED' ? payment.refundedByName : payment.recordedByName}</Td>
                    <Td priority="md" className="whitespace-nowrap text-ink-500">{formatDateTime(payment.status === 'REFUNDED' ? payment.refundedAt : (payment.paymentDate ?? payment.createdAt))}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
            <span>Showing {offset + 1}–{offset + payments.length} of {total}</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</Button>
              <Button type="button" size="sm" variant="secondary" disabled={!result?.hasMore} onClick={() => setOffset(offset + pageSize)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
