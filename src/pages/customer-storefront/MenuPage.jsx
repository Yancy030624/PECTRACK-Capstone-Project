import { useOutletContext } from 'react-router-dom'
import { CustomerMenu } from './CustomerMenu.jsx'
import { PublicMenu } from './PublicMenu.jsx'

// One /menu route, two screens — the panel asked for a Menu that looks
// different once a customer signs in, not a separate URL. Follows the
// same dispatch-on-role shape OrderManagement and DeliveryManagement
// already use (modules.js). See UI_REVISIONS_PLAN.md Decision 11.
export function MenuPage({ user }) {
  const { openLogin } = useOutletContext()

  if (user?.role === 'CUSTOMER') return <CustomerMenu />
  return <PublicMenu openLogin={openLogin} />
}
