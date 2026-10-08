import { Eyebrow, ScallopEdge } from './Decor.jsx'

// The cream banner the Menu and Visit Us pages open with: eyebrow, title,
// a lead line, anything extra (the Menu's search box), and the scalloped
// edge into the page below.
export function PageBanner({ eyebrow, title, lead, children }) {
  return (
    <section className="relative overflow-hidden bg-cream-50">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-butter-100" />
      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-7 sm:pt-16">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 max-w-4xl font-display text-5xl font-bold leading-tight text-cocoa-900 sm:text-6xl">{title}</h1>
        {lead && <p className="mt-4 max-w-2xl text-lg leading-8 text-cocoa-700">{lead}</p>}
        {children}
      </div>
      <ScallopEdge className="text-cream-100" />
    </section>
  )
}
