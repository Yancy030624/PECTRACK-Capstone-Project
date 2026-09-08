import { forwardRef } from 'react'

// The shared shape backing Input, Select, and Textarea (H3 — "three
// competing input styles"). The audit measured three different
// height/radius combinations in near-equal use across the app
// (rounded-lg px-2 py-1.5 ×28, rounded-xl px-3 py-2 ×26, rounded-2xl
// px-4 py-2.5 ×26) — meaning no single one of them was actually "the"
// input, and controls from different screens didn't line up when mixed
// in one row. This is the one shape, exported so Select and Textarea can
// share it exactly rather than each keeping a near-identical copy.
export const FIELD_SHAPE =
  'w-full rounded-control border border-line-200 bg-surface px-3 text-sm text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/25 ' +
  'aria-invalid:border-red-500 disabled:cursor-not-allowed disabled:opacity-60'

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`h-9 ${FIELD_SHAPE} ${className}`} {...props} />
})
