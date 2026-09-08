import { forwardRef } from 'react'

// One Button primitive for the whole app. UI_AUDIT.md's DESIGN SYSTEM
// section specifies four variants and a single height ramp; before this,
// every screen hand-rolled its own button classes (see the pre-Stage-1
// CustomerManagement.jsx for an example of the pattern this replaces —
// a different bg/text pair pasted at every call site).
//
// Sizes map to the audit's ramp: 36px is the default control height used
// everywhere; "sm" (32px) is for dense table-row actions (Edit/Save/
// Cancel inline in a row); "touch" (44px) is reserved for primary
// storefront CTAs and delivery-role screens where a finger, not a mouse,
// is doing the tapping — neither of those is converted in this stage, but
// the size exists now so Stage 5 doesn't need a new component for it.
const VARIANT_CLASSES = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'bg-surface border border-line-200 text-ink-700 hover:bg-surface-sunk',
  ghost: 'bg-transparent text-ink-500 hover:bg-surface-sunk',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
}

const SIZE_CLASSES = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
  touch: 'h-11 px-5 text-sm',
}

// No focus-visible classes here on purpose — the global ring from
// index.css's base layer (H5) already covers every <button>, so a
// per-component ring would just be a second copy to keep in sync.
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'default', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded-control font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  )
})
