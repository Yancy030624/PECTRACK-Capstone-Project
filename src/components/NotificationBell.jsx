// New-order notifications for the staff header (CLIENT_REVISIONS_PLAN.md,
// R4). The admin and cashier hear about every new order; a driver hears
// about every delivery newly assigned to them.
//
// No server push: the screen asks every 20 seconds. "New" means placed (or
// assigned) after the last time this person opened the bell ON THIS DEVICE,
// kept in localStorage — nothing is stored in the database for it.
//
// For each new item: a toast, an optional soft sound (muted per device),
// and a browser notification when the tab is in the background and the
// person allowed them once.
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '../api/client.js'
import { formatDateTime, formatPeso } from '../lib/format.js'
import { orderLabel } from '../lib/orderNumber.js'

const pollMs = 20_000
const toastMs = 8_000
// The poll asks from a little before the newest item it already has. An
// order's time is when its transaction began, so one that took longer can
// commit after a newer one was already seen; the overlap catches it, and
// the ids already known are dropped.
const overlapMs = 2 * 60_000
const keepItems = 20

const storage = {
  get: (key) => { try { return window.localStorage.getItem(key) } catch { return null } },
  set: (key, value) => { try { window.localStorage.setItem(key, value) } catch { /* private mode: in memory only */ } },
}

// What each role is told about. `time` is what "new" is measured by.
function sourceFor(user) {
  if (user.role === 'DELIVERY PERSONNEL') {
    return {
      kind: 'delivery',
      fetch: async () => (await apiGet('/api/deliveries/mine')).deliveries,
      time: (delivery) => delivery.assignedAt,
      title: (delivery) => `New delivery ${orderLabel(delivery)}`,
      text: (delivery) => [delivery.customerName ?? 'Customer', delivery.address?.barangay].filter(Boolean).join(', '),
    }
  }
  return {
    kind: 'order',
    fetch: async (since) => (await apiGet(`/api/orders/recent${since ? `?${new URLSearchParams({ since })}` : ''}`)).orders,
    time: (order) => order.orderDate,
    title: (order) => `New order ${orderLabel(order)}`,
    text: (order) => `${order.customerName ?? 'Walk-in'}, ${order.orderType === 'DELIVERY' ? 'delivery' : 'pickup'}, ${formatPeso(order.totalAmount)}`,
  }
}

// A short two-note chime, made on the spot — no sound file to ship.
function chime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const context = new AudioContext()
    ;[[880, 0], [1320, 0.16]].forEach(([frequency, start]) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, context.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + 0.35)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(context.currentTime + start)
      oscillator.stop(context.currentTime + start + 0.4)
    })
    window.setTimeout(() => context.close(), 1000)
  } catch {
    // Sound is a nicety; a browser that refuses it changes nothing else.
  }
}

const isNewer = (time, than) => than == null || new Date(time) > new Date(than)

export function NotificationBell({ user, onOpen }) {
  const source = useRef(sourceFor(user)).current
  const seenKey = `pectrack.notifications.seen.${user.id}`
  const mutedKey = 'pectrack.notifications.muted'

  const [items, setItems] = useState([])
  const [lastSeen, setLastSeen] = useState(() => storage.get(seenKey))
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [muted, setMuted] = useState(() => storage.get(mutedKey) === '1')
  const [permission, setPermission] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  const known = useRef(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const panelRef = useRef(null)

  const announce = useCallback((fresh) => {
    setToasts((current) => [...fresh.map((item) => ({ key: `${item.id}-${Date.now()}`, item })), ...current].slice(0, 4))
    for (const item of fresh) {
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.item.id !== item.id)), toastMs)
    }
    if (!mutedRef.current) chime()
    if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const item of fresh) {
        try {
          const notice = new Notification(source.title(item), { body: source.text(item), tag: `${source.kind}-${item.id}` })
          notice.onclick = () => { window.focus(); onOpen(source.kind, item) }
        } catch {
          // Some mobile browsers only notify through a service worker.
        }
      }
    }
  }, [source, onOpen])

  useEffect(() => {
    let stopped = false
    const poll = async () => {
      try {
        const since = known.current
          ? (() => {
              const times = [...known.current.values()].map((item) => new Date(source.time(item)).getTime()).filter(Number.isFinite)
              return times.length ? new Date(Math.max(...times) - overlapMs).toISOString() : null
            })()
          : storage.get(seenKey)
        const fetched = (await source.fetch(since)) ?? []
        if (stopped) return
        if (!known.current) {
          known.current = new Map(fetched.map((item) => [item.id, item]))
          // First visit on this device: nothing counts as new yet.
          if (storage.get(seenKey) == null) {
            const newestTime = fetched.map(source.time).filter(Boolean).sort().at(-1) ?? new Date().toISOString()
            storage.set(seenKey, newestTime)
            setLastSeen(newestTime)
          }
        } else {
          const fresh = fetched.filter((item) => !known.current.has(item.id))
          for (const item of fetched) known.current.set(item.id, item)
          if (fresh.length) announce(fresh)
        }
        // Drivers: a delivery that left the list (delivered, recalled) is
        // no longer news.
        if (source.kind === 'delivery') {
          const current = new Set(fetched.map((item) => item.id))
          for (const id of known.current.keys()) if (!current.has(id)) known.current.delete(id)
        }
        setItems([...known.current.values()]
          .sort((a, b) => new Date(source.time(b)) - new Date(source.time(a)))
          .slice(0, keepItems))
      } catch {
        // A missed poll is retried on the next one; nothing to show.
      }
    }
    poll()
    const timer = window.setInterval(poll, pollMs)
    return () => { stopped = true; window.clearInterval(timer) }
    // The poll reads the latest state through refs; it is set up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close the panel on a click outside it or on Escape.
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])

  const unseen = items.filter((item) => source.time(item) && isNewer(source.time(item), lastSeen))
  // What was new as the panel opened, kept highlighted while it is open.
  const [openedUnseen, setOpenedUnseen] = useState(new Set())
  const toggle = () => {
    if (!open) setOpenedUnseen(new Set(unseen.map((item) => item.id)))
    if (!open && items.length) {
      // Opening the bell is "seeing" what is in it.
      const newestTime = items.map(source.time).filter(Boolean).sort().at(-1)
      if (newestTime && isNewer(newestTime, lastSeen)) {
        storage.set(seenKey, newestTime)
        setLastSeen(newestTime)
      }
    }
    setOpen(!open)
  }
  const choose = (item) => {
    setOpen(false)
    setToasts((current) => current.filter((toast) => toast.item.id !== item.id))
    onOpen(source.kind, item)
  }
  const toggleMuted = () => {
    storage.set(mutedKey, muted ? '0' : '1')
    setMuted(!muted)
    if (muted) chime()
  }
  const askPermission = async () => {
    try { setPermission(await Notification.requestPermission()) } catch { /* unsupported */ }
  }
  const noun = (count) => (source.kind === 'delivery' ? (count === 1 ? 'delivery' : 'deliveries') : (count === 1 ? 'order' : 'orders'))

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unseen.length ? `${unseen.length} new ${noun(unseen.length)}` : `No new ${noun(0)}`}
        className="relative grid h-9 w-9 place-items-center rounded-full text-ink-700 transition hover:bg-surface-sunk"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unseen.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-5 text-white tabular-nums">
            {unseen.length >= keepItems ? `${keepItems}+` : unseen.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-line-200 bg-surface shadow-raised">
          <div className="flex items-center justify-between gap-2 border-b border-line-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">{source.kind === 'delivery' ? 'Your deliveries' : 'Latest orders'}</p>
            <button type="button" onClick={toggleMuted} className="text-xs font-semibold text-brand-700 hover:underline">
              {muted ? 'Sound off' : 'Sound on'}
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-500">Nothing yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line-100 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => choose(item)} className={`w-full px-4 py-2.5 text-left transition hover:bg-surface-sunk ${openedUnseen.has(item.id) ? 'bg-brand-50' : ''}`}>
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-900">
                      {source.title(item).replace(/^New (order|delivery) /, '')}
                      {openedUnseen.has(item.id) && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold uppercase text-white">New</span>}
                    </span>
                    <span className="block text-xs text-ink-500">{source.text(item)} · {formatDateTime(source.time(item))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {permission === 'default' && (
            <div className="border-t border-line-100 px-4 py-3">
              <button type="button" onClick={askPermission} className="text-xs font-semibold text-brand-700 hover:underline">
                Also notify me when this tab is in the background
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toasts: newest on top, each opens its order. */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 print:hidden">
        {toasts.map(({ key, item }) => (
          <button
            type="button"
            key={key}
            onClick={() => choose(item)}
            className="pointer-events-auto rounded-panel border border-line-200 border-l-4 border-l-brand-600 bg-surface px-4 py-3 text-left shadow-raised transition hover:bg-surface-sunk"
          >
            <span className="block text-sm font-semibold text-ink-900">{source.title(item)}</span>
            <span className="block text-xs text-ink-500">{source.text(item)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
