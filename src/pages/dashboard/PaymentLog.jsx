import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'

// Stage 4 (RULES-PLANS/UI_AUDIT.md) — H7 called this file's statusStyles
// out by name: byte-identical to PaymentBilling.jsx's own copy under a
// different name. Both now read the one shared <StatusBadge> map instead.
// C3's role="status" 10px error paragraph is <Alert variant="error">.
// Amount is now <Td numeric> — right-aligned, tabular-nums — per the
// audit's specific complaint that peso columns didn't line up. Which
// payments load, for which role, is unchanged.
export function PaymentLog({ user }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadPayments = async () => {
      try {
        const data = await apiGet('/api/payments')
        setPayments(data.payments)
      } catch (error) {
        setMessage(error.message)
      } finally {
        setLoading(false)
      }
    }
    loadPayments()
  }, [])

  const isCustomer = user.role === 'CUSTOMER'
  const caption = isCustomer ? 'Your payments' : 'All payments'

  return (
    <Card className="mt-6 p-6">
      <h2 className="text-lg font-semibold text-ink-900">{caption}</h2>

      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-ink-500">Loading…</p>
      ) : payments.length === 0 ? (
        <EmptyState title="No payments recorded yet" />
      ) : (
        <div className="mt-4">
          <Table caption={caption}>
            <Thead>
              <Tr className="hover:bg-transparent">
                <Th>Order</Th>
                {!isCustomer && <Th>Customer</Th>}
                <Th>Method</Th>
                <Th align="right">Amount</Th>
                <Th>Reference</Th>
                <Th>Status</Th>
                <Th>Recorded by</Th>
                <Th>When</Th>
              </Tr>
            </Thead>
            <Tbody>
              {payments.map((payment) => (
                <Tr key={payment.id}>
                  <Td className="font-semibold text-ink-900">#{payment.orderId}</Td>
                  {!isCustomer && <Td>{payment.customerName ?? 'Walk-in'}</Td>}
                  <Td>{payment.method}</Td>
                  <Td numeric>₱{payment.amount}</Td>
                  <Td className="text-ink-500">{payment.gatewayReference ?? '—'}</Td>
                  <Td>
                    <StatusBadge status={payment.status} />
                    {payment.status === 'REFUNDED' && payment.refundReason && <p className="mt-1 text-xs text-ink-500">"{payment.refundReason}"</p>}
                  </Td>
                  <Td>{payment.status === 'REFUNDED' ? payment.refundedByName : payment.recordedByName}</Td>
                  <Td className="text-ink-500">{new Date(payment.status === 'REFUNDED' ? payment.refundedAt : (payment.paymentDate ?? payment.createdAt)).toLocaleString()}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </Card>
  )
}
