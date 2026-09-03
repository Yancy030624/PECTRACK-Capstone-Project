import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../../api/client.js'

const featuredCount = 4

export function HomePage() {
  const [featured, setFeatured] = useState(null)

  useEffect(() => {
    apiGet('/api/products')
      .then((data) => setFeatured(data.products.filter((product) => product.imageUrl).slice(0, featuredCount)))
      .catch(() => setFeatured([]))
  }, [])

  return (
    <>
      <section className="relative overflow-hidden bg-linear-to-br from-[#449947] via-[#17564e] to-[#112c78] px-4 py-20 text-white sm:px-7 sm:py-28">
        <div className="absolute -left-24 -top-12 h-64 w-[150%] rotate-[-42deg] bg-white/10" />
        <div className="absolute right-[6%] top-[18%] hidden h-40 w-40 rotate-12 rounded-[40px] border-2 border-white/20 lg:block" />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full bg-yellow-200 px-3 py-1 text-[10px] font-bold text-green-900">Lucban's Best Delicacies</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">Freshly baked, the Pecto's way.</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-green-50">Pandesal, ensaymada, and our own Broas — made fresh in Lucban every morning. Browse what's available today, then sign in to place your order.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/menu" className="rounded-full bg-white px-6 py-3 text-xs font-bold text-green-800 shadow-lg transition hover:bg-green-50">View the menu</Link>
            <Link to="/about" className="rounded-full border border-white/60 px-6 py-3 text-xs font-bold text-white transition hover:bg-white/10">Our story</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-green-700">TODAY'S PICKS</p>
            <h2 className="mt-1 text-2xl font-bold text-stone-900">A few favorites</h2>
          </div>
          <Link to="/menu" className="text-xs font-bold text-green-700 hover:underline">See the full menu →</Link>
        </div>
        {featured === null ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: featuredCount }).map((_, index) => <div key={index} className="h-56 animate-pulse rounded-2xl bg-white/70" />)}
          </div>
        ) : featured.length === 0 ? (
          <p className="mt-8 text-sm text-stone-500">Nothing available right now — check back soon.</p>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <Link to="/menu" key={product.id} className="group overflow-hidden rounded-2xl border border-green-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="aspect-4/3 overflow-hidden bg-linear-to-br from-green-50 to-amber-50">
                  <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-stone-900">{product.name}</h3>
                  {product.variant && <p className="text-xs font-semibold text-green-700">{product.variant}</p>}
                  <p className="mt-1 text-sm font-extrabold text-green-800">₱{product.price}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="border-t border-green-100 bg-[#fffedc] px-4 py-14 sm:px-7">
        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-2xl">📍</p>
            <p className="mt-2 font-serif text-sm font-bold text-green-800">Visit us in Lucban</p>
            <p className="mt-1 text-xs text-stone-500">93 Quezon Avenue, Lucban, Quezon</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-2xl">🕒</p>
            <p className="mt-2 font-serif text-sm font-bold text-green-800">Open daily</p>
            <p className="mt-1 text-xs text-stone-500">6:00 AM – 8:00 PM, Monday – Saturday</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-2xl">🍞</p>
            <p className="mt-2 font-serif text-sm font-bold text-green-800">Baked fresh daily</p>
            <p className="mt-1 text-xs text-stone-500">From our signature Broas to everyday Pandesal.</p>
          </div>
        </div>
      </section>
    </>
  )
}
