import { Link, useLocation } from 'react-router-dom'
import { useCart } from '../cart/CartContext.jsx'

// The cart that follows you down the page.
//
// A checkout shortcut while browsing, shown only for a non-empty customer
// cart. Account forms use the sticky header's cart instead, keeping their
// Save and address actions clear of floating controls.
const hiddenOn = new Set(['/cart', '/checkout', '/account'])

export function CartFab({ user }) {
  const { itemCount } = useCart()
  const location = useLocation()

  if (user?.role !== 'CUSTOMER') return null
  if (itemCount === 0) return null
  if (hiddenOn.has(location.pathname) || location.pathname.startsWith('/order-placed')) return null

  return (
    <Link
      to="/cart"
      // `fixed` and bottom-right, clear of the iOS home indicator via
      // env(safe-area-inset-bottom). z-40 keeps it under the auth dialog's
      // z-50 overlay rather than floating on top of it.
      className="group fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-0 rounded-full bg-crust-600 p-3.5 text-white shadow-xl shadow-cocoa-900/25 transition hover:bg-crust-700 hover:shadow-2xl focus-visible:ring-4 focus-visible:ring-butter-300 sm:right-7 sm:gap-3 sm:py-3 sm:pr-5 sm:pl-4"
      aria-label={`View cart, ${itemCount} product${itemCount === 1 ? '' : 's'}`}
    >
      <span className="relative grid h-7 w-7 place-items-center">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
          <circle cx="10" cy="20" r="1.4" />
          <circle cx="17" cy="20" r="1.4" />
        </svg>
        {/* The count rides the icon, the way it does in the header, so the
            two read as the same object in two places. */}
        <span className="absolute -top-1.5 -right-2 grid h-5 min-w-5 place-items-center rounded-full bg-butter-400 px-1 text-[11px] font-extrabold text-cocoa-900 tabular-nums">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      </span>
      <span className="hidden text-sm font-bold whitespace-nowrap sm:inline">View cart</span>
    </Link>
  )
}
