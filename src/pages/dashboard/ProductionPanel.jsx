import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { PrintThisButton } from '../../components/PrintReport.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { manilaDateFromToday } from '../../lib/dates.js'

// Inventory → Production (RULES-PLANS/DAILY_STOCK_PLAN.md): what to bake
// on a day, tomorrow by default, from GET /api/inventory/production.
//   Soft breads  the top-up back to the daily standard (standard − on the
//                shelf now, so it shrinks as today's sales go on) plus the
//                pieces in advanced orders picked up that day.
//   Hard breads  at or under the minimum: up to the stop level; otherwise
//                not needed.
// The forecast's figure for the day is shown beside each, for reference.
export function ProductionPanel() {
  const [day, setDay] = useState(manilaDateFromToday(1))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    apiGet(`/api/inventory/production?day=${day}`).then(setData).catch((failure) => setError(failure.message))
  }, [day])

  const soft = data?.items.filter((item) => item.stockType === 'SOFT') ?? []
  const hard = data?.items.filter((item) => item.stockType === 'HARD') ?? []
  const dayLabel = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${day}T12:00:00+08:00`))

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">What to bake, by bread type. Soft breads are topped up to their daily standard at 5:00 AM; hard breads are made at their minimum, up to their stop level.</p>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink-700">
            Day
            <input type="date" value={day} min={manilaDateFromToday(0)} onChange={(event) => setDay(event.target.value || manilaDateFromToday(1))} className="h-9 rounded-control border border-line-200 bg-surface px-2 text-sm" />
          </label>
        </div>
        <PrintThisButton label="Print production list" />
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      <Card className="print-only-target mt-4 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Production for {dayLabel}</h2>
        {!data ? (
          <LoadingRows className="mt-4" />
        ) : data.items.length === 0 ? (
          <EmptyState title="No products on sale" />
        ) : (
          <>
            <h3 className="mt-5 text-sm font-semibold text-ink-900">Soft breads</h3>
            {soft.length === 0 ? <p className="mt-1 text-sm text-ink-500">No soft breads.</p> : (
              <div className="mt-2">
                <Table caption="Soft breads to bake">
                  <Thead>
                    <Tr className="hover:bg-transparent">
                      <Th>Product</Th>
                      <Th align="right" priority="md">Standard</Th>
                      <Th align="right" priority="md">On shelf now</Th>
                      <Th align="right" priority="md">Advanced orders</Th>
                      <Th align="right">To bake</Th>
                      <Th align="right" priority="lg">Forecast</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {soft.map((item) => (
                      <Tr key={item.productId}>
                        <Td className="font-semibold text-ink-900">{item.name}{item.variant && <span className="block text-xs font-normal text-ink-500">{item.variant}</span>}</Td>
                        <Td numeric priority="md">{item.standardStock || <span className="text-ink-500">not set</span>}</Td>
                        <Td numeric priority="md">{item.onHand}</Td>
                        <Td numeric priority="md">{item.advanced || '—'}</Td>
                        <Td numeric className="font-semibold text-ink-900">{item.toBake}</Td>
                        <Td numeric priority="lg">{item.forecast ?? '—'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            )}

            <h3 className="mt-6 text-sm font-semibold text-ink-900">Hard breads</h3>
            {hard.length === 0 ? <p className="mt-1 text-sm text-ink-500">No hard breads. Set a product's bread type in Edit Products.</p> : (
              <div className="mt-2">
                <Table caption="Hard breads to bake">
                  <Thead>
                    <Tr className="hover:bg-transparent">
                      <Th>Product</Th>
                      <Th align="right">On hand</Th>
                      <Th align="right" priority="md">Produce at</Th>
                      <Th align="right" priority="md">Stop at</Th>
                      <Th align="right">To bake</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {hard.map((item) => (
                      <Tr key={item.productId}>
                        <Td className="font-semibold text-ink-900">{item.name}{item.variant && <span className="block text-xs font-normal text-ink-500">{item.variant}</span>}</Td>
                        <Td numeric>{item.onHand}</Td>
                        <Td numeric priority="md">{item.minStockLevel}</Td>
                        <Td numeric priority="md">{item.targetStock || '—'}</Td>
                        <Td numeric className={item.needed ? 'font-semibold text-ink-900' : 'text-ink-500'}>{item.needed ? item.toBake : 'Not needed'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            )}
            <p className="mt-4 text-xs text-ink-500">Soft "To bake" uses what is on the shelf now; it is smaller if more sells today. Advanced orders for soft breads are baked on their pickup day, outside the shelf stock.</p>
          </>
        )}
      </Card>
    </div>
  )
}
