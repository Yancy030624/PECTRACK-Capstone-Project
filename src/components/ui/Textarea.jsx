import { forwardRef } from 'react'
import { FIELD_SHAPE } from './Input.jsx'

// Shares Input's FIELD_SHAPE — see Input.jsx's header comment (H3). Only
// the height rule differs: a textarea grows with content instead of
// pinning to the 36px control height, so it gets a min-height and its own
// vertical padding instead of Input's fixed h-9.
export const Textarea = forwardRef(function Textarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={`min-h-20 py-2 ${FIELD_SHAPE} ${className}`} {...props} />
})
