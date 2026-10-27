import { forwardRef, useState } from 'react'
import { FIELD_SHAPE } from './Input.jsx'

// A password field with its own Show/Hide button (NOTIFICATIONS_PLAN.md,
// N1) — the same words the sign-in form uses. One component, so every
// password field in the app behaves the same way.
//
// Inside the dashboard it takes the shared field shape, plus any extra
// classes in `className`, like <Input>. The storefront and auth pages have
// their own field look; they pass it whole as `inputClassName` and their
// own link colour as `toggleClassName`.
//
// Each field keeps its own toggle: showing the new password does not show
// the confirmation, so the person still types it twice, unseen if they like.
export const PasswordInput = forwardRef(function PasswordInput(
  { className = '', inputClassName, toggleClassName = 'text-brand-700', ...props },
  ref,
) {
  const [shown, setShown] = useState(false)
  const fieldClass = inputClassName ?? `h-11 md:h-9 ${FIELD_SHAPE} ${className}`
  return (
    <div className="relative">
      {/* pr-14! keeps the typed text clear of the button, whatever
          horizontal padding the field's own classes set. */}
      <input ref={ref} {...props} type={shown ? 'text' : 'password'} className={`${fieldClass} pr-14!`} />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className={`absolute inset-y-0 right-0 px-3 text-xs font-bold ${toggleClassName}`}
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  )
})
