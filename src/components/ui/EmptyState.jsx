// A shared "nothing here" block. Loading/empty/error states already exist
// on essentially every screen (UI_AUDIT.md notes this as one of the
// things already good about the app) — they're just inconsistent in
// form. This is the empty-state half of that normalisation.
export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center">
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {description && <p className="text-xs text-ink-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
