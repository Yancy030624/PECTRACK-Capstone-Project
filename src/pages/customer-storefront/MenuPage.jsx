import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { useCart } from '../../cart/CartContext.jsx'

export function MenuPage({ user }) {
  const [products, setProducts] = useState(null)
  const [categories, setCategories] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    Promise.all([apiGet('/api/products'), apiGet('/api/categories')])
      .then(([productsData, categoriesData]) => {
        setProducts(productsData.products)
        setCategories(categoriesData.categories)
      })
      .catch((error) => setMessage(error.message))
  }, [])

  const loading = products === null || categories === null

  const sections = loading ? [] : categories
    .map((category) => ({ category, items: products.filter((product) => product.categoryId === category.id) }))
    .filter((section) => section.items.length > 0)

  const sectionAnchor = (categoryId) => `menu-category-${categoryId}`

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-7">
      <p className="text-sm font-semibold text-green-700">OUR MENU</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Fresh from Pecto's oven</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-500">Everything currently available at the bakery, grouped the same way our counter is.</p>

      {message && <p role="status" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}

      {!loading && sections.length > 1 && (
        <nav aria-label="Jump to category" className="sticky top-0 z-10 -mx-4 mt-6 flex gap-2 overflow-x-auto border-y border-green-100 bg-[#f5f7f2]/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7">
          {sections.map(({ category }) => (
            <a key={category.id} href={`#${sectionAnchor(category.id)}`} className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-xs font-bold text-green-800 shadow-sm ring-1 ring-green-100 transition hover:bg-green-50">{category.name}</a>
          ))}
        </nav>
      )}

      {loading ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl bg-white/70" />)}
        </div>
      ) : sections.length === 0 ? (
        <p className="mt-10 text-sm text-stone-500">Nothing is available right now — please check back soon.</p>
      ) : (
        sections.map(({ category, items }) => (
          <div key={category.id} id={sectionAnchor(category.id)} className="scroll-mt-20 pt-10">
            <h2 className="text-xl font-bold text-stone-900">{category.name}</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((product) => <MenuProductCard key={product.id} product={product} user={user} />)}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
function MenuProductCard({ product, user }) {
  const { addItem } = useCart()
  const canOrder = !user || user.role === 'CUSTOMER'
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const handleAdd = () => {
    addItem(product.id, quantity)
    setQuantity(1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-green-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="aspect-4/3 overflow-hidden bg-linear-to-br from-green-50 to-amber-50">
        {product.imageUrl
          ? <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
          : <div className="grid h-full w-full place-items-center text-5xl">🥐</div>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-bold text-stone-900">{product.name}</h3>
        {product.variant && <p className="text-xs font-semibold text-green-700">{product.variant}</p>}
        {product.description && <p className="mt-1 flex-1 text-xs text-stone-500">{product.description}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-lg font-extrabold text-green-800">₱{product.price}</span>
          {canOrder && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center rounded-full border border-green-100">
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="grid h-6 w-6 place-items-center text-xs font-bold text-green-800">−</button>
                <span className="w-4 text-center text-[11px] font-bold">{quantity}</span>
                <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="Increase quantity" className="grid h-6 w-6 place-items-center text-xs font-bold text-green-800">+</button>
              </div>
              <button type="button" onClick={handleAdd} className="whitespace-nowrap rounded-full bg-green-700 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800">{added ? 'Added ✓' : 'Add to cart'}</button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
