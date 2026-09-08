import { createContext, useContext, useEffect, useState } from 'react'

const CartContext = createContext(null)

const storageKeyFor = (userId) => `pectrack.cart.${userId}`

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

// Signing in no longer costs a visitor their page (the login pop-up keeps
// them where they were), so the sign-in wall moved back to the product
// card and only a CUSTOMER ever has a cart to fill. See
// UI_REVISIONS_PLAN.md Decision 6 for why this reverses CHECKOUT_PLAN.md's
// original guest-cart decision.
const canHaveCart = (user) => user?.role === 'CUSTOMER'

export function CartProvider({ user, children }) {
  const [lines, setLines] = useState(() => (canHaveCart(user) ? readCart(storageKeyFor(user.id)) : []))

  useEffect(() => {
    setLines(canHaveCart(user) ? readCart(storageKeyFor(user.id)) : [])
  }, [user?.id, user?.role])
  useEffect(() => {
    if (!canHaveCart(user)) return
    writeCart(storageKeyFor(user.id), lines)
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
