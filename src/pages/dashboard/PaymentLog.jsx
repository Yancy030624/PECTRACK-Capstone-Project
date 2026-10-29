// The payment history tab of Payment & Billing. GET /api/payments already
// filters by method, status and date range and pages with limit/offset —
// the Reports screen's Transactions tab has used those since Phase 8;
// this tab ignored them and rendered every row in one unbroken table. The
// same controls now sit here, so the cashier's own money screen can answer
// "today's GCash" without going to Reports.
//
// It is now the ONE payment list (DELIVERY_FEE_PLAN.md, D2): Reports'
// Transactions tab showed the same rows and was removed. "Export PDF"
// prints every payment matching the filters, not only the page on screen,
// through the browser's Save as PDF like the other reports.
import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { PrintHeader } from '../../components/PrintReport.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDateTime, formatPeso } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'
import { logPrint } from '../../lib/exportLog.js'

const pageSize = 25
const emptyFilters = { from: '', to: '', method: '' }
// The API pages at most 200 rows at a time; the export asks page by page.
const exportPageSize = 200
const exportMaxPages = 50
const methodName = (method) => ({ CASH: 'Cash', QRPH: 'GCash', GCASH: 'GCash' })[method] ?? method

// The query for a set of filters, PAID payments only.
function paymentsQuery(filters, limit, offset) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.method) params.set('method', filters.method)
  // Payment first (the user, 2026-10-16): the log lists money received
  // — PAID payments only, never pending, failed, cancelled or refunded.
  params.set('status', 'PAID')
  return `/api/payments?${params.toString()}`
}

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
      try {
        setResult(await apiGet(paymentsQuery(applied, pageSize, offset)))
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

  // Export PDF: every matching payment, then the print dialog with only
  // the export on the page (index.css, body.printing-one).
  const [printRows, setPrintRows] = useState(null)
  const [exporting, setExporting] = useState(false)
  const exportPdf = async () => {
    setExporting(true)
    setMessage('')
    try {
      const rows = []
      for (let page = 0; page < exportMaxPages; page += 1) {
        const data = await apiGet(paymentsQuery(applied, exportPageSize, page * exportPageSize))
        rows.push(...data.payments)
        if (!data.hasMore) break
      }
      setPrintRows(rows)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setExporting(false)
    }
  }
  useEffect(() => {
    if (!printRows) return undefined
    const done = () => {
      document.body.classList.remove('printing-one')
      setPrintRows(null)
    }
    window.addEventListener('afterprint', done, { once: true })
    document.body.classList.add('printing-one')
    logPrint('PAYMENT_LOG_PDF')
    window.print()
    return () => window.removeEventListener('afterprint', done)
  }, [printRows])

  const isCustomer = user.role === 'CUSTOMER'
  const caption = isCustomer ? 'Your payments' : 'All payments'
  const payments = result?.payments ?? []
  const total = result?.total ?? 0

  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink-900">{caption}</h2>
        <Button type="button" size="sm" variant="secondary" onClick={exportPdf} disabled={exporting || loading || total === 0}>{exporting ? 'Preparing…' : 'Export PDF'}</Button>
      </div>
      {printRows && <PaymentLogPrint rows={printRows} filters={applied} user={user} title={isCustomer ? 'Your payments' : 'Payment log'} showCustomer={!isCustomer} />}

      <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end" onSubmit={applyFilters} noValidate>
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
                  <Th priority="lg">Recorded by</Th>
                  <Th priority="md">When</Th>
                </Tr>
              </Thead>
              <Tbody>
                {payments.map((payment) => (
                  <Tr key={payment.id}>
                    <Td className="font-semibold text-ink-900">{orderLabel(payment)}</Td>
                    {!isCustomer && <Td priority="md">{payment.customerName ?? 'Walk-in'}</Td>}
                    <Td>{methodName(payment.method)}</Td>
                    <Td numeric>{formatPeso(payment.amount)}</Td>
                    <Td priority="xl" className="text-ink-500">{payment.gatewayReference ?? '—'}</Td>
                    <Td priority="lg">{payment.recordedByName ?? (payment.gatewayReference ? `Online (${methodName(payment.method)})` : '—')}</Td>
                    <Td priority="md" className="whitespace-nowrap text-ink-500">{formatDateTime(payment.paymentDate ?? payment.createdAt)}</Td>
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

// What the PDF holds: a heading with the filters, every row, and the total
// received. Only on paper.
function PaymentLogPrint({ rows, filters, user, title, showCustomer }) {
  const totalCentavos = rows.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0)
  const range = filters.from || filters.to ? `${filters.from || 'the start'} to ${filters.to || 'today'}` : 'All dates'
  const subtitle = [range, filters.method ? methodName(filters.method) : 'All methods', `${rows.length} payment${rows.length === 1 ? '' : 's'}`].join(' · ')
  return (
    <div className="print-only-target hidden print:block">
      <PrintHeader title={title} subtitle={subtitle} user={user} />
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-ink-900">
            <th className="py-1">Order</th>
            {showCustomer && <th className="py-1">Customer</th>}
            <th className="py-1">Method</th>
            <th className="py-1">Reference</th>
            <th className="py-1">Recorded by</th>
            <th className="py-1">When</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((payment) => (
            <tr key={payment.id} className="border-b border-line-200">
              <td className="py-1">{orderLabel(payment)}</td>
              {showCustomer && <td className="py-1">{payment.customerName ?? 'Walk-in'}</td>}
              <td className="py-1">{methodName(payment.method)}</td>
              <td className="py-1">{payment.gatewayReference ?? '—'}</td>
              <td className="py-1">{payment.recordedByName ?? (payment.gatewayReference ? `Online (${methodName(payment.method)})` : '—')}</td>
              <td className="py-1">{formatDateTime(payment.paymentDate ?? payment.createdAt)}</td>
              <td className="py-1 text-right tabular-nums">{formatPeso(payment.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={showCustomer ? 6 : 5} className="pt-2 text-right">Total received</th>
            <td className="pt-2 text-right font-semibold tabular-nums">{formatPeso(totalCentavos / 100)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
