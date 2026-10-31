// Shared page hierarchy for staff modules. Customer pages keep their account headers.
export function ModuleHeader({ title, description, role, className = '' }) {
  return (
    <div className={`staff-module-header ${className}`}>
      <p className="staff-module-kicker">{role} PORTAL</p>
      <h1>{title}</h1>
      {description && <p className="staff-module-description">{description}</p>}
    </div>
  )
}
