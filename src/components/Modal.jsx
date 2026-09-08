import { useEffect, useRef } from 'react'

// A small generic dialog shell — no portal, no animation, no focus-trap
// library. Renders nothing while closed, so any state inside `children`
// resets the next time it opens rather than lingering stale.
export function Modal({ open, onClose, children, labelledBy }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return

    panelRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className="max-h-full overflow-y-auto outline-none">
        {children}
      </div>
    </div>
  )
}
