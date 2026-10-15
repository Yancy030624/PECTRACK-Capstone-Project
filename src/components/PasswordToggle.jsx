// The eye button inside a password field: shows what was typed, or hides
// it again. It sits absolutely at the field's right edge, so the input
// needs a `relative` wrapper and right padding (pr-11) to keep text from
// running under it. The label names the action for screen readers, since
// the icon alone says nothing to them.
export function PasswordToggle({ shown, onToggle }) {
  const label = shown ? 'Hide password' : 'Show password'
  return (
    <button type="button" onClick={onToggle} aria-label={label} title={label} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-2xl text-stone-500 transition hover:text-stone-800">
      {shown ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6" /><path d="M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m2 2 20 20" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
    </button>
  )
}
