import { formatDate, formatPeso } from '../../lib/format.js'

// What Print / Save as PDF puts on paper (the user, 2026-11-07): a short
// summary of the tab for the admin, with no charts. Invisible on screen, and
// the on-screen report is hidden when printing. Plain tables rather than
// <Table>, whose sideways scroller would cut off a wide table on paper.
// ForecastPanel.jsx prints its own summary from these same parts, because
// that panel holds the forecast's data.
export function PrintStats({ stats }) {
  return (
    <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3 border-b border-line-200 pb-3">
      {stats.map(({ label, value, note }) => (
        <div key={label} className="break-inside-avoid">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
          <dd className="mt-0.5 text-base font-semibold text-ink-900 tabular-nums">{value}</dd>
          {note && <dd className="text-[10px] text-ink-500">{note}</dd>}
        </div>
      ))}
    </dl>
  )
}

export function PrintHeading({ children }) {
  return <h2 className="mt-4 mb-1 break-after-avoid text-[13px] font-semibold text-ink-900">{children}</h2>
}

// columns: [{ label, right }]. rows: arrays of cells, in column order.
export function PrintTable({ columns, rows, footer }) {
  const align = (column) => (column.right ? 'text-right tabular-nums' : 'text-left')
  return (
    <table className="w-full border-collapse text-[11px] text-ink-900">
      <thead>
        <tr className="border-b border-ink-900">
          {columns.map((column) => <th key={column.label} scope="col" className={`px-1.5 py-1 text-[10px] font-semibold ${align(column)}`}>{column.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-b border-line-100">
            {row.map((cell, cellIndex) => <td key={cellIndex} className={`px-1.5 py-1 ${align(columns[cellIndex])}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
      {footer && (
        <tfoot>
          <tr className="border-t border-ink-900 font-semibold">
            {footer.map((cell, cellIndex) => <td key={cellIndex} className={`px-1.5 py-1 ${align(columns[cellIndex])}`}>{cell}</td>)}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

export function PrintNote({ children }) {
  return <p className="mt-2 text-[10px] text-ink-700">{children}</p>
}

const productName = (name, variant) => (variant ? `${name} (${variant})` : name)
const share = (part, whole) => (Number(whole) > 0 ? `${Math.round((Number(part) / Number(whole)) * 100)}%` : '—')

const methodNames = { CASH: 'Cash', GCASH: 'GCash' }
const typeNames = { WALK_IN: 'Walk-in / counter', PICKUP: 'Online pickup', DELIVERY: 'Delivery' }

export function SalesPrintSummary({ sales, peak }) {
  if (!sales) return null
  const { totals } = sales
  const breakdown = (caption, rows, names) => (
    <div className="break-inside-avoid">
      <PrintHeading>{caption}</PrintHeading>
      <PrintTable
        columns={[{ label: caption.replace('By ', '').replace(/^./, (letter) => letter.toUpperCase()) }, { label: 'Orders', right: true }, { label: 'Sales', right: true }, { label: 'Share', right: true }]}
        rows={rows.map((row) => [names[row.key] ?? row.key, row.orders, formatPeso(row.sales), share(row.sales, totals.sales)])}
      />
    </div>
  )
  return (
    <div className="hidden print:block">
      <PrintStats stats={[
        { label: 'Sales', value: formatPeso(totals.sales), note: 'Money received, delivery fees not included' },
        { label: 'Orders', value: totals.orders, note: 'Paid in this range' },
        { label: 'Average order', value: formatPeso(totals.averageOrder) },
        { label: 'Delivery fees', value: formatPeso(totals.deliveryFees), note: 'Collected, separate from sales' },
        { label: 'Unpaid cash orders', value: totals.unpaidCash.orders, note: totals.unpaidCash.orders > 0 ? `${formatPeso(totals.unpaidCash.amount)} to collect at pickup` : 'Nothing to collect' },
        { label: 'Busiest day and hour', value: peak?.orders ? peak.day : '—', note: peak?.orders ? `Busiest hour on any day: ${peak.hour}. From ${peak.orders.toLocaleString()} orders placed.` : 'No orders in this range' },
      ]} />
      <div className="grid grid-cols-2 gap-4">
        {breakdown('By payment method', sales.byMethod, methodNames)}
        {breakdown('By order type', sales.byType, typeNames)}
      </div>
      <PrintHeading>Sales by {sales.groupBy}</PrintHeading>
      {sales.buckets.length === 0 ? <PrintNote>No sales in this range.</PrintNote> : (
        <PrintTable
          columns={[{ label: 'Period' }, { label: 'Orders', right: true }, { label: 'Sales', right: true }, { label: 'Delivery fees', right: true }]}
          rows={sales.buckets.map((bucket) => [bucket.period, bucket.orders, formatPeso(bucket.sales), formatPeso(bucket.deliveryFees)])}
          footer={['Total', totals.orders, formatPeso(totals.sales), formatPeso(totals.deliveryFees)]}
        />
      )}
    </div>
  )
}

const breadNames = { SOFT: 'Soft breads', HARD: 'Hard breads' }

export function ProductsPrintSummary({ products, note }) {
  if (!products) return null
  const { totals } = products
  return (
    <div className="hidden print:block">
      <PrintStats stats={[
        { label: 'Pieces sold', value: totals.pieces.toLocaleString() },
        { label: 'Revenue', value: formatPeso(totals.revenue) },
        { label: 'Products sold', value: totals.productsSold, note: breadNames[products.type] ?? 'All breads' },
      ]} />
      <PrintHeading>Top {products.products.length} of {totals.productsSold} products sold, by {products.sort === 'revenue' ? 'revenue' : 'pieces'} · {breadNames[products.type] ?? 'All breads'}</PrintHeading>
      {products.products.length === 0 ? <PrintNote>No sales in this range.</PrintNote> : (
        <PrintTable
          columns={[{ label: '#', right: true }, { label: 'Product' }, { label: 'Type' }, { label: 'Pieces', right: true }, { label: 'Share of pieces', right: true }, { label: 'Revenue', right: true }]}
          rows={products.products.map((row, index) => [index + 1, productName(row.productName, row.variant), row.stockType === 'HARD' ? 'Hard' : 'Soft', row.quantitySold.toLocaleString(), share(row.quantitySold, totals.pieces), formatPeso(row.revenue)])}
        />
      )}
      {products.lowest.length > 0 && (
        <div className="break-inside-avoid">
          <PrintHeading>Lowest sellers</PrintHeading>
          <PrintTable
            columns={[{ label: 'Product' }, { label: 'Type' }, { label: 'Pieces', right: true }, { label: 'Revenue', right: true }]}
            rows={products.lowest.map((row) => [productName(row.productName, row.variant), row.stockType === 'HARD' ? 'Hard' : 'Soft', row.quantitySold.toLocaleString(), formatPeso(row.revenue)])}
          />
          <PrintNote>Products on sale that sold the fewest pieces in this range, not counting those ranked above. 0 means none sold.</PrintNote>
        </div>
      )}
      <PrintNote>{note}</PrintNote>
    </div>
  )
}

export function InventoryPrintSummary({ inventory, note }) {
  if (!inventory) return null
  const { totals } = inventory
  const net = totals.added - totals.sold - totals.lost
  return (
    <div className="hidden print:block">
      <PrintStats stats={[
        { label: 'Baked / added', value: totals.added.toLocaleString(), note: 'Pieces' },
        { label: 'Sold', value: totals.sold.toLocaleString(), note: 'Cancelled orders returned' },
        { label: 'Deducted', value: totals.lost.toLocaleString(), note: 'Taken off the shelf' },
        { label: 'Net change', value: `${net > 0 ? '+' : ''}${net.toLocaleString()}`, note: 'Baked / added − sold − deducted' },
      ]} />
      <PrintHeading>Low on stock when printed ({inventory.lowStockAlertsTotal})</PrintHeading>
      {inventory.lowStockAlerts.length === 0 ? <PrintNote>No product is at or under its minimum.</PrintNote> : (
        <>
          <PrintTable
            columns={[{ label: 'Product' }, { label: 'On hand', right: true }, { label: 'Minimum', right: true }]}
            rows={inventory.lowStockAlerts.map((row) => [productName(row.productName, row.variant), row.stockQuantity, row.minStockLevel])}
          />
          {inventory.lowStockAlertsTotal > inventory.lowStockAlerts.length && <PrintNote>Showing the {inventory.lowStockAlerts.length} lowest of {inventory.lowStockAlertsTotal}.</PrintNote>}
        </>
      )}
      <PrintHeading>Deductions in this range ({inventory.deductionsTotal})</PrintHeading>
      {inventory.deductions.length === 0 ? <PrintNote>None in this range.</PrintNote> : (
        <>
          <PrintTable
            columns={[{ label: 'Date' }, { label: 'Product' }, { label: 'Pieces', right: true }, { label: 'Reason' }]}
            rows={inventory.deductions.map((row) => [formatDate(row.date), productName(row.productName, row.variant), row.pieces, row.note ?? 'No note given'])}
          />
          {inventory.deductionsTotal > inventory.deductions.length && <PrintNote>Showing the latest {inventory.deductions.length} of {inventory.deductionsTotal}.</PrintNote>}
        </>
      )}
      <PrintNote>{note}</PrintNote>
    </div>
  )
}
