import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Eyebrow, ScallopEdge } from '../../components/storefront/Decor.jsx'
import { sectionAnchor } from './useMenuData.js'

// The frame both menus share — a cream banner, the sticky category chips,
// and one section per category. PublicMenu and CustomerMenu differ only
// in the toolbar (search) and in what each card lets a visitor do, which
// they pass in as `toolbar` and `renderCard`.
export function MenuLayout({ loading, sections, message, emptyText, toolbar, showChips = true, renderCard }) {
  // Home's category tiles link to /menu#menu-category-N. The section does
  // not exist until the menu loads, so the browser's own jump misses it;
  // scroll once it is there.
  const { hash } = useLocation()
  useEffect(() => {
    if (loading || !hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, hash])

  return (
    <>
      <section className="relative overflow-hidden bg-cream-50">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-butter-100" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-7 sm:pt-16">
          <Eyebrow>Our menu</Eyebrow>
          <h1 className="mt-4 font-display text-5xl font-bold text-cocoa-900 sm:text-6xl">Fresh from Pecto&apos;s oven</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-cocoa-700">Everything on the counter today, grouped the way our bakery shelves are. Prices are per piece or per pack, as marked.</p>
          {toolbar}
        </div>
        <ScallopEdge className="text-cream-100" />
      </section>

      {showChips && !loading && sections.length > 1 && (
        <nav aria-label="Jump to category" className="sticky top-0 z-20 border-b border-cream-200 bg-cream-100/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-7">
            {sections.map(({ category, items }) => (
              <a key={category.id} href={`#${sectionAnchor(category.id)}`} className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-bold text-cocoa-700 ring-1 ring-cream-300 transition hover:bg-crust-600 hover:text-white hover:ring-crust-600">
                {category.name} <span className="ml-1 text-xs font-semibold opacity-70">{items.length}</span>
              </a>
            ))}
          </div>
        </nav>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-7">
        {message && <p role="alert" className="mt-8 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{message}</p>}
        {loading ? (
          <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-3/4 animate-pulse rounded-[1.75rem] bg-cream-200" />)}
          </div>
        ) : sections.length === 0 ? (
          <p className="mt-12 text-center text-base text-cocoa-500">{emptyText}</p>
        ) : (
          sections.map(({ category, items }) => (
            <div key={category.id} id={sectionAnchor(category.id)} className="scroll-mt-24 pt-12">
              <div className="flex items-baseline gap-3 border-b border-dashed border-cream-300 pb-3">
                <h2 className="font-display text-3xl font-bold text-cocoa-900">{category.name}</h2>
                <span className="text-sm font-bold text-cocoa-500">{items.length} item{items.length === 1 ? '' : 's'}</span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((product) => <div key={product.id}>{renderCard(product)}</div>)}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
