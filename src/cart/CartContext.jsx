import { createContext, useContext, useEffect, useRef, useState } from 'react'

const CartContext = createContext(null)

const storageKeyFor = (userId) => `pectrack.cart.${userId ?? 'guest'}`

function readCart(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((line) => line && typeof line.productId === 'string' && Number.isInteger(line.quantity) && line.quantity > 0)
  } catch {
    return []
  }
}

function writeCart(key, lines) {
  try {
    localStorage.setItem(key, JSON.stringify(lines))
  } catch {
  }
}

function removeCart(key) {
  try {
    localStorage.removeItem(key)
  } catch {
  }
}
const canHaveCart = (user) => !user || user.role === 'CUSTOMER'

export function CartProvider({ user, children }) {
  const [lines, setLines] = useState(() => (canHaveCart(user) ? readCart(storageKeyFor(user?.id)) : []))
  const previousUserId = useRef(user?.id ?? null)

  useEffect(() => {
    const wasSignedOut = previousUserId.current == null
    const isNowSignedIn = user?.id != null

    if (!canHaveCart(user)) {
      setLines([])
    } else if (wasSignedOut && isNowSignedIn) {
      const guestKey = storageKeyFor(null)
      const guestLines = readCart(guestKey)
      const ownKey = storageKeyFor(user.id)
      const ownLines = readCart(ownKey)
      setLines(ownLines.length === 0 && guestLines.length > 0 ? guestLines : ownLines)
      removeCart(guestKey)
    } else {
      setLines(readCart(storageKeyFor(user?.id)))
    }
    previousUserId.current = user?.id ?? null
  }, [user?.id, user?.role])
  useEffect(() => {
    if (!canHaveCart(user)) return
    writeCart(storageKeyFor(user?.id), lines)
  }, [lines, user?.id, user?.role])

  const addItem = (productId, quantity = 1) => {
    if (!canHaveCart(user) || !productId || quantity <= 0) return
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId)
      if (existing) return current.map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + quantity } : line))
      return [...current, { productId, quantity }]
    })
  }

  const setQuantity = (productId, quantity) => {
    if (!canHaveCart(user)) return
    setLines((current) => {
      if (quantity <= 0) return current.filter((line) => line.productId !== productId)
      return current.map((line) => (line.productId === productId ? { ...line, quantity } : line))
    })
  }

  const removeItem = (productId) => setLines((current) => current.filter((line) => line.productId !== productId))

  const clear = () => setLines([])

  const itemCount = lines.reduce((total, line) => total + line.quantity, 0)

  return <CartContext.Provider value={{ lines, addItem, setQuantity, removeItem, clear, itemCount }}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart() must be called inside a CartProvider.')
  return context
}
