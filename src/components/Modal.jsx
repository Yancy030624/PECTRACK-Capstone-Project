import { useEffect, useRef } from 'react'

// A small generic dialog shell — no portal, no animation, no focus-trap
// library. Renders nothing while closed, so any state inside `children`
// resets the next time it opens rather than lingering stale.
// `closeOnBackdrop={false}` keeps a click beside the panel from closing it
// — for a long form, where a stray click would throw away what was typed
// (the Create account dialog, the user 2026-10-24). The panel's own close
// button still closes it.
export function Modal({ open, onClose, children, labelledBy, closeOnBackdrop = true }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return

    panelRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      // Tab stays inside the dialog: without this, focus walked out into
      // the page underneath while the overlay still covered it.
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
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
      onClick={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose() }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className="max-h-full overflow-y-auto outline-none">
        {children}
      </div>
    </div>
  )
}
