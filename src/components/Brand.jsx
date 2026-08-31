// Render the supplied bakery logo consistently wherever the product is named.
export function Brand({ compact = false }) {
  // Return the logo image and the Pectrack wordmark.
  return (
    <div className="flex items-center gap-2.5">
      {/* Keep the original logo crisp inside a round, elevated seal. */}
      <span className={`grid overflow-hidden rounded-full bg-white shadow-md ring-1 ring-black/5 ${compact ? 'h-12 w-12' : 'h-24 w-24 sm:h-28 sm:w-28'}`}>
        <img src="/src/assets/logo-circle.png" alt="Pectos Bakery logo" className="h-full w-full rounded-full scale-125 object-cover" />
      </span>
      {/* Use the warm gold from the supplied brand mark. */}
      <span className={`${compact ? 'text-xl' : 'text-2xl'} font-serif font-black tracking-tight text-[#b97600] [text-shadow:1px_1px_0_#f6d66b]`}>PECTRACK</span>
    </div>
  )
}
