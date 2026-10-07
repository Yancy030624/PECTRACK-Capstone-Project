import { MenuLayout } from './MenuLayout.jsx'
import { ProductCard } from './ProductCard.jsx'
import { useMenuData } from './useMenuData.js'

// What an anonymous visitor sees: browse everything, no quantity stepper,
// no cart — "Sign in to order" is the only thing a card lets them do
// (STOREFRONT_PLAN.md Decision 3). CustomerMenu.jsx is the signed-in
// counterpart with search and real ordering.
export function PublicMenu({ openLogin }) {
  const { loading, sections, message } = useMenuData()

  return (
    <MenuLayout
      loading={loading}
      sections={sections}
      message={message}
      emptyText="Nothing is available right now — please check back soon."
      toolbar={
        <p className="mt-6 inline-flex flex-wrap items-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-semibold text-cocoa-700 ring-1 ring-cream-300">
          Sign in to order for pickup or delivery.
          <button type="button" onClick={openLogin} className="font-bold text-crust-600 hover:underline">Sign in →</button>
        </p>
      }
      renderCard={(product) => <ProductCard product={product} mode="guest" onSignIn={openLogin} />}
    />
  )
}
