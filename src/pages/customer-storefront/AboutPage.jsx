export function AboutPage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-7">
      <p className="text-sm font-semibold text-green-700">OUR STORY</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">About Pecto's Bakery</h1>

      <div className="mt-8 grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-start">
        <div className="space-y-4 text-sm leading-6 text-stone-600">
          <p>Pecto's Bakery has been part of Lucban, Quezon's daily routine — fresh bread every morning, and the kind of pastries people plan their day around. Known locally simply as <span className="font-semibold text-green-800">"Lucban's Best Delicacies,"</span> it's the name on the wrapper of everything we bake.</p>
          <p>Our Broas — Lucban's own ladyfinger biscuit — is what we're best known for, sold by the pack all the way up to the gallon tin for fiestas and pasalubong. Alongside it: ensaymada, pandesal, and a full counter of everyday pastries, baked fresh every morning.</p>
          <p>PECTRACK is how we keep that running behind the scenes: tracking orders, stock, and deliveries so what you see on the counter — and now here on the menu — is always accurate.</p>
          <p>We're still a small, family-run bakery at heart. Every batch is baked in-house, and every order is prepared to be picked up or delivered fresh.</p>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl bg-linear-to-br from-green-700 to-blue-900 p-6 text-white shadow-lg">
            <p className="text-sm text-green-100">Signature item</p>
            <p className="mt-2 text-2xl font-extrabold">Broas</p>
            <p className="mt-2 text-xs leading-5 text-green-50">Lucban's own ladyfinger biscuit — from a single pack to the gallon tin, baked the same way it always has been.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-green-100 bg-white p-5 text-center">
              <p className="text-2xl font-extrabold text-green-800">6</p>
              <p className="mt-1 text-[11px] font-semibold text-stone-500">days a week, baking fresh</p>
            </div>
            <div className="rounded-2xl border border-green-100 bg-white p-5 text-center">
              <p className="text-2xl font-extrabold text-green-800">40+</p>
              <p className="mt-1 text-[11px] font-semibold text-stone-500">items on the counter</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
