// The bakery's own details, in one place. Every storefront page (footer,
// Visit Us, Home, Our Story) reads them from here, so a change to the
// hours or a phone number is one edit, not five.
//
// server/lib/bakery.js holds a copy of the address, hours and phone
// numbers for the emails the server sends. Change it with this file.
//
// HOURS — 5:00 AM to 10:00 PM, the same as the ordering hours
// (lib/orderHours.js); the user confirmed them on 2026-10-16. Pickup and
// delivery start at 6:00 AM, once the 5:00 AM batch has cooled (the user,
// 2026-10-29). Change the values below and every page follows.
export const bakery = {
  name: "Pecto's Bakery",
  tagline: "Lucban's Best Delicacies",
  founded: 1947,
  street: '93 Quezon Avenue',
  town: 'Lucban, Quezon',
  hours: {
    days: 'Daily',
    time: '5:00 AM – 10:00 PM',
    opens: '5 AM',
    note: 'Fresh batches at 5 AM and 3 PM · pickup and delivery from 6 AM',
  },
  phones: ['(042) 540-4366', '(042) 540-8838'],
}

// Delivery covers this town only (PHASE10 B7); the server enforces it
// (routes/orders.js) and checkout uses this to grey out other addresses.
export const deliveryTown = 'Lucban'
// The flat fee on a delivery order, in pesos (RULES-PLANS/DELIVERY_FEE_PLAN.md).
// Shown at checkout; the server's config.orders.deliveryFee is what is charged.
export const deliveryFee = 50
export const isDeliverable = (address) => address?.municipality?.trim().toLowerCase() === deliveryTown.toLowerCase()

export const bakeryAddress = `${bakery.street}, ${bakery.town}`
export const bakeryMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${bakery.name}, ${bakeryAddress}`)}`
export const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`
// A text message with its first words already typed (NOTIFICATIONS_PLAN.md,
// N6). `?body=` is understood by Android and by current iPhones.
export const smsHref = (phone, body = '') => `sms:${phone.replace(/[^\d+]/g, '')}${body ? `?body=${encodeURIComponent(body)}` : ''}`
// Two numbers written differently ("0917 123 4567", "09171234567") are the
// same number when their digits match.
export const samePhone = (first, second) => Boolean(first && second) && first.replace(/\D/g, '') === second.replace(/\D/g, '')
