// Replaces ~15 hand-rolled error/success `<p>` tags (UI_AUDIT.md C3).
// The bug C3 documents is two defects stacked in one line of the old
// pattern (`<p role="status" className="... text-[10px] font-semibold
// text-red-700">`): the message rendered at 10px — smaller than
// everything else on the page — right when it's the most important thing
// on screen, AND it used role="status", a *polite* live region that
// assistive tech isn't required to announce promptly. An error needs
// role="alert" (assertive, interrupts); a success/info confirmation stays
// role="status" (polite, doesn't interrupt) — that's why variant decides
// the role here rather than every call site picking one by hand.
const VARIANT_CLASSES = {
  error: 'bg-status-fail-bg text-status-fail-fg',
  success: 'bg-status-done-bg text-status-done-fg',
  info: 'bg-status-active-bg text-status-active-fg',
}

export function Alert({ variant = 'info', children }) {
  if (!children) return null
  return (
    <p role={variant === 'error' ? 'alert' : 'status'} className={`rounded-control px-3 py-2 text-sm font-medium ${VARIANT_CLASSES[variant]}`}>
      {children}
    </p>
  )
}
