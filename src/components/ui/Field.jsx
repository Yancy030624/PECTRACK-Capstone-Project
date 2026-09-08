import { cloneElement, useId } from 'react'

// Label + help text + error, wired to the control it wraps via
// aria-describedby/aria-invalid so no caller has to remember to do that
// plumbing by hand. UI_AUDIT.md's Input styles section specifies exactly
// this: "error text ... referenced by aria-describedby".
//
// `children` must be a single form control (Input/Select/Textarea) —
// Field injects `id`, `aria-invalid`, and `aria-describedby` into it via
// cloneElement rather than asking every call site to generate and wire
// three extra props by hand.
//
// `label` is optional: a dense table-inline edit (see the converted
// CustomerManagement.jsx) often has no visible label for a cell whose
// column header already names the field, but still wants the error text
// and aria-describedby wiring below it.
export function Field({ label, help, error, children }) {
  const id = useId()
  const helpId = help ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-700">
          {label}
        </label>
      )}
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {help && !error && (
        <p id={helpId} className="mt-1 text-xs text-ink-500">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
