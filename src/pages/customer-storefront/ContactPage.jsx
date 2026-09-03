const address = '93 Quezon Avenue, Lucban, Quezon'
const phoneNumbers = ['(042) 540-4366', '(042) 540-8838']

export function ContactPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-7">
      <p className="text-sm font-semibold text-green-700">GET IN TOUCH</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Visit or reach out</h1>
      <p className="mt-2 max-w-xl text-sm text-stone-500">We're easiest to reach in person, but here's how to find or call us.</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <p className="text-2xl">📍</p>
          <p className="mt-3 font-serif text-sm font-bold text-green-800">Address</p>
          <p className="mt-1 text-sm text-stone-600">{address}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Pecto's Bakery, ${address}`)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-xs font-bold text-green-700 hover:underline"
          >
            Get directions →
          </a>
        </div>
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <p className="text-2xl">🕒</p>
          <p className="mt-3 font-serif text-sm font-bold text-green-800">Hours</p>
          <p className="mt-1 text-sm text-stone-600">Monday – Saturday<br />6:00 AM – 8:00 PM</p>
        </div>
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <p className="text-2xl">📞</p>
          <p className="mt-3 font-serif text-sm font-bold text-green-800">Phone</p>
          {phoneNumbers.map((number) => (
            <p key={number} className="mt-1 text-sm text-stone-600">
              <a href={`tel:${number.replace(/[^\d+]/g, '')}`} className="hover:text-green-700 hover:underline">{number}</a>
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}
