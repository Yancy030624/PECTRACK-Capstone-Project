import { useEffect, useRef } from 'react'

// Reloads a screen's own list when the header bell finds something new
// (NOTIFICATIONS_PLAN.md, N3). Without it, a driver looking at My
// Deliveries saw the toast for a new assignment but not the delivery
// itself until they reloaded the page.
//
// The bell sends a `pectrack:notifications` window event with the new
// items; `reload` is called with them. The latest `reload` is always the
// one called, so a screen can pass an inline function.
export function useNotificationRefresh(reload) {
  const latest = useRef(reload)
  latest.current = reload
  useEffect(() => {
    const onNotifications = (event) => latest.current(event.detail ?? [])
    window.addEventListener('pectrack:notifications', onNotifications)
    return () => window.removeEventListener('pectrack:notifications', onNotifications)
  }, [])
}
