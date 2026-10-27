// Notifications for the staff header (CLIENT_REVISIONS_PLAN.md R4, widened
// by NOTIFICATIONS_PLAN.md N3). The admin and cashier hear about new
// orders, online payments, cancellations, and deliveries leaving, arriving
// or failing; a driver hears about every delivery assigned to them. The
// events come from GET /api/notifications, one feed for every role.
//
// No server push: the screen asks every 20 seconds.
//
// Read and unread (the panel, 2026-10-26; MINOR_REVISIONS_PLAN.md M14):
// each item is Unread until this person opens it, or presses "Mark all as
// read". Only a new UNREAD item toasts and sounds, once; a read one never
// does again, and stays in the list marked Read. Kept per person ON THIS
// DEVICE in localStorage — nothing is stored in the database for it.
//
// A product falling to its minimum (`low_stock`, the seniors 2026-10-24)
// is a warning, not news: its toast is red, stays longer, has its own
// lower tone, and can be closed.
//
// For each new item: a toast, an optional soft sound (muted per device),
// a browser notification when the tab is in the background and the person
// allowed them once, and a `pectrack:notifications` window event so the
// open screen reloads its own list.
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '../api/client.js'
import { formatDateTime, formatPeso } from '../lib/format.js'
import { orderLabel } from '../lib/orderNumber.js'

const pollMs = 20_000
const toastMs = 8_000
const warningToastMs = 15_000
const isWarning = (item) => item.type === 'low_stock'
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

const fetchFeed = async (since) => (await apiGet(`/api/notifications${since ? `?${new URLSearchParams({ since })}` : ''}`)).notifications
const itemTime = (item) => item.at

// How each kind of event reads, in the bell, the toast, and the browser
// notification alike.
const wording = {
  order_placed: (item) => [`New order ${orderLabel(item)}`, `${item.customerName ?? 'Walk-in'}, ${item.orderType === 'DELIVERY' ? 'delivery' : 'pickup'}, ${formatPeso(item.totalAmount)}${item.unpaid && item.paymentMode === 'CASH' ? ' · cash, not paid' : ''}`],
  payment_received: (item) => [
    `Payment received for ${orderLabel(item)}`,
    `GCash ${formatPeso(item.amount)}${item.orderStatus === 'CANCELLED' ? ' — the order was cancelled; settle it with the customer' : ''}`,
  ],
  order_cancelled: (item) => [`Order ${orderLabel(item)} cancelled`, item.actorIsCustomer ? 'By the customer' : `By ${item.actorName ?? 'staff'}`],
  out_for_delivery: (item) => [`Order ${orderLabel(item)} is on the way`, `With ${item.actorName ?? 'the driver'}`],
  delivered: (item) => [`Order ${orderLabel(item)} delivered`, [`By ${item.actorName ?? 'the driver'}`, [item.recipientName, item.barangay].filter(Boolean).join(', ')].filter(Boolean).join(' · ')],
  delivery_failed: (item) => [`Delivery failed for ${orderLabel(item)}`, item.note || `By ${item.actorName ?? 'the driver'}`],
  assigned: (item) => [`New delivery ${orderLabel(item)}`, [item.customerName ?? 'Customer', item.barangay].filter(Boolean).join(', ')],
  low_stock: (item) => [`Low stock: ${item.productName}`, `${item.stockQuantity} left (minimum ${item.minStockLevel}) — restock soon`],
  due_soon: (item) => [
    `Order ${orderLabel(item)} is due within the hour`,
    `${item.orderType === 'DELIVERY' ? 'Delivery' : 'Pickup'} · needed by ${new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(item.neededAt))} · ${item.customerName ?? 'Walk-in'}`,
  ],
}
const describe = (item) => (wording[item.type] ?? ((other) => [`Order ${orderLabel(other)} updated`, '']))(item)
const titleOf = (item) => describe(item)[0]
const textOf = (item) => describe(item)[1]

// A short two-note chime, made on the spot — no sound file to ship. The
// warning tone falls instead of rising, so a low-stock alert is told
// apart from a new order without looking.
const chimeNotes = [[880, 0], [1320, 0.16]]
const warningNotes = [[660, 0], [440, 0.2]]
function chime(notes = chimeNotes) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const context = new AudioContext()
    notes.forEach(([frequency, start]) => {
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
// The keys of the items opened, newest last; capped so it cannot grow
// without end (the bell only ever holds the latest few).
const maxReadKeys = 300
const loadReadKeys = (key) => {
  try { return new Set(JSON.parse(storage.get(key) ?? '[]')) } catch { return new Set() }
}

export function NotificationBell({ user, onOpen }) {
  // `seen` is the first visit's starting point: everything before it counts
  // as read. `read` is each item opened since.
  const seenKey = `pectrack.notifications.seen.${user.id}`
  const readKey = `pectrack.notifications.read.${user.id}`
  const mutedKey = 'pectrack.notifications.muted'

  const [items, setItems] = useState([])
  const [lastSeen, setLastSeen] = useState(() => storage.get(seenKey))
  const [readKeys, setReadKeys] = useState(() => loadReadKeys(readKey))
  const readRef = useRef(readKeys)
  readRef.current = readKeys
  const lastSeenRef = useRef(lastSeen)
  lastSeenRef.current = lastSeen
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [muted, setMuted] = useState(() => storage.get(mutedKey) === '1')
  const [permission, setPermission] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  const known = useRef(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const panelRef = useRef(null)

  const announce = useCallback((fresh) => {
    setToasts((current) => [...fresh.map((item) => ({ key: `${item.key}-${Date.now()}`, item })), ...current].slice(0, 4))
    for (const item of fresh) {
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.item.key !== item.key)), isWarning(item) ? warningToastMs : toastMs)
    }
    if (!mutedRef.current) chime(fresh.some(isWarning) ? warningNotes : chimeNotes)
    if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const item of fresh) {
        try {
          const notice = new Notification(titleOf(item), { body: textOf(item), tag: item.key })
          notice.onclick = () => { window.focus(); onOpen(item) }
        } catch {
          // Some mobile browsers only notify through a service worker.
        }
      }
    }
    window.dispatchEvent(new CustomEvent('pectrack:notifications', { detail: fresh }))
  }, [onOpen])

  useEffect(() => {
    let stopped = false
    const poll = async () => {
      try {
        const since = known.current
          ? (() => {
              const times = [...known.current.values()].map((item) => new Date(itemTime(item)).getTime()).filter(Number.isFinite)
              return times.length ? new Date(Math.max(...times) - overlapMs).toISOString() : null
            })()
          : storage.get(seenKey)
        const fetched = (await fetchFeed(since)) ?? []
        if (stopped) return
        if (!known.current) {
          known.current = new Map(fetched.map((item) => [item.key, item]))
          // First visit on this device: nothing counts as new yet.
          if (storage.get(seenKey) == null) {
            const newestTime = fetched.map(itemTime).filter(Boolean).sort().at(-1) ?? new Date().toISOString()
            storage.set(seenKey, newestTime)
            setLastSeen(newestTime)
          }
        } else {
          // Only what is new to this screen AND still unread is announced.
          const fresh = fetched.filter((item) => !known.current.has(item.key) && !readRef.current.has(item.key) && isNewer(itemTime(item), lastSeenRef.current))
          for (const item of fetched) known.current.set(item.key, item)
          if (fresh.length) announce(fresh)
        }
        setItems([...known.current.values()]
          .sort((a, b) => new Date(itemTime(b)) - new Date(itemTime(a)))
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

  const isUnread = (item) => Boolean(itemTime(item)) && isNewer(itemTime(item), lastSeen) && !readKeys.has(item.key)
  const unread = items.filter(isUnread)
  const saveRead = (next) => {
    storage.set(readKey, JSON.stringify([...next].slice(-maxReadKeys)))
    setReadKeys(next)
  }
  const markRead = (item) => {
    if (readKeys.has(item.key)) return
    saveRead(new Set([...readKeys, item.key]))
  }
  const markAllRead = () => {
    saveRead(new Set([...readKeys, ...unread.map((item) => item.key)]))
    setToasts([])
  }
  const toggle = () => setOpen(!open)
  const dismiss = (item) => setToasts((current) => current.filter((toast) => toast.item.key !== item.key))
  // Opening an item reads it: its toast goes, and it is never announced again.
  const choose = (item) => {
    setOpen(false)
    dismiss(item)
    markRead(item)
    onOpen(item)
  }
  const toggleMuted = () => {
    storage.set(mutedKey, muted ? '0' : '1')
    setMuted(!muted)
    if (muted) chime()
  }
  const askPermission = async () => {
    try { setPermission(await Notification.requestPermission()) } catch { /* unsupported */ }
  }
  const noun = (count) => (count === 1 ? 'notification' : 'notifications')

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread.length ? `${unread.length} unread ${noun(unread.length)}` : `No unread ${noun(0)}`}
        className="relative grid h-9 w-9 place-items-center rounded-full text-ink-700 transition hover:bg-surface-sunk"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-5 text-white tabular-nums">
            {unread.length >= keepItems ? `${keepItems}+` : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-line-200 bg-surface shadow-raised">
          <div className="flex items-center justify-between gap-2 border-b border-line-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notifications{unread.length > 0 && <span className="ml-1.5 text-xs font-normal text-ink-500">{unread.length} unread</span>}</p>
            <span className="flex items-center gap-3">
              {unread.length > 0 && <button type="button" onClick={markAllRead} className="text-xs font-semibold text-brand-700 hover:underline">Mark all as read</button>}
              <button type="button" onClick={toggleMuted} className="text-xs font-semibold text-brand-700 hover:underline">
                {muted ? 'Sound off' : 'Sound on'}
              </button>
            </span>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-500">Nothing yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line-100 overflow-y-auto">
              {items.map((item) => (
                <li key={item.key}>
                  <button type="button" onClick={() => choose(item)} className={`w-full px-4 py-2.5 text-left transition hover:bg-surface-sunk ${isUnread(item) ? 'bg-brand-50' : ''}`}>
                    <span className="flex items-center justify-between gap-2 text-sm text-ink-900">
                      <span className={`${isUnread(item) ? 'font-semibold' : 'font-normal'} ${isWarning(item) ? 'text-red-700' : ''}`}>{titleOf(item)}</span>
                      {isUnread(item)
                        ? <span className="shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold uppercase text-white">Unread</span>
                        : <span className="shrink-0 rounded-full bg-surface-sunk px-1.5 text-[10px] font-semibold uppercase text-ink-500">Read</span>}
                    </span>
                    <span className="block text-xs text-ink-500">{[textOf(item), formatDateTime(itemTime(item))].filter(Boolean).join(' · ')}</span>
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

      {/* Toasts: newest on top, each opens its order (a low-stock one
          opens Inventory). Warnings are red and can be closed. */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 print:hidden">
        {toasts.map(({ key, item }) => (isWarning(item) ? (
          <div key={key} role="alert" className="pointer-events-auto flex items-start gap-3 rounded-panel border border-red-300 border-l-4 border-l-red-600 bg-red-50 px-4 py-3 shadow-raised">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            <button type="button" onClick={() => choose(item)} className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-bold text-red-800">{titleOf(item)}</span>
              <span className="block text-xs text-red-700">{textOf(item)}</span>
            </button>
            <button type="button" onClick={() => dismiss(item)} aria-label="Close warning" className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-red-700 transition hover:bg-red-100">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        ) : (
          <button
            type="button"
            key={key}
            onClick={() => choose(item)}
            className="pointer-events-auto rounded-panel border border-line-200 border-l-4 border-l-brand-600 bg-surface px-4 py-3 text-left shadow-raised transition hover:bg-surface-sunk"
          >
            <span className="block text-sm font-semibold text-ink-900">{titleOf(item)}</span>
            <span className="block text-xs text-ink-500">{textOf(item)}</span>
          </button>
        )))}
      </div>
    </div>
  )
}
