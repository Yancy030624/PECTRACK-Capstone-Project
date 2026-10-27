import { useEffect, useRef } from 'react'

// Live stock (RULES-PLANS/LIVE_STOCK_PLAN.md): calls `onChange` whenever the
// server announces a stock change for `table` ('inventory' or
// 'ingredients'), so a screen can re-read its list without a refresh.
//
// The browser's own EventSource does the work: it holds the stream open
// (GET /api/inventory/live, a Server-Sent Events stream) and reconnects by
// itself after a drop. Announcements that arrive close together — an order
// of five breads, the 5:00 AM top-up — are merged into one reload.
const mergeMs = 300

export function useLiveStock(table, onChange) {
  // The latest callback, so the stream is opened once rather than every
  // time the screen re-renders with a new function.
  const callback = useRef(onChange)
  useEffect(() => {
    callback.current = onChange
  })

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined
    const source = new EventSource('/api/inventory/live', { withCredentials: true })
    let timer = null
    const fire = () => {
      clearTimeout(timer)
      timer = setTimeout(() => callback.current(), mergeMs)
    }
    const onStock = (event) => {
      if (event.data === table) fire()
    }
    // After a reconnect, re-read once: a change may have been missed while
    // the stream was down. The first open needs nothing; the screen has
    // just loaded.
    let opened = false
    const onOpen = () => {
      if (opened) fire()
      opened = true
    }
    source.addEventListener('stock', onStock)
    source.addEventListener('open', onOpen)
    return () => {
      clearTimeout(timer)
      source.close()
    }
  }, [table])
}
