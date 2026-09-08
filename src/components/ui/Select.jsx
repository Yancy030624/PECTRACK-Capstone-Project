import { forwardRef } from 'react'
import { FIELD_SHAPE } from './Input.jsx'

// Shares Input's FIELD_SHAPE (border, radius, height, focus ring) so a
// <Select> next to an <Input> in the same row lines up exactly — see
// Input.jsx's header comment for why that shared shape exists (H3).
export const Select = forwardRef(function Select({ className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={`h-9 ${FIELD_SHAPE} ${className}`} {...props}>
      {children}
    </select>
  )
})
