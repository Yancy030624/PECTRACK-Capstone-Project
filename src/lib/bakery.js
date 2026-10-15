// The bakery's own details, in one place. Every storefront page (footer,
// Visit Us, Home, Our Story) reads them from here, so a change to the
// hours or a phone number is one edit, not five.
//
// server/lib/bakery.js holds a copy of the address, hours and phone
// numbers for the emails the server sends. Change it with this file.
//
// HOURS — from the bakery's own About page ("Daily 5:00 AM – 8:00 PM,
// fresh batches at 5 AM and 3 PM"), adopted by the team on 2026-10-13.
// Change the values below and every page follows.
export const bakery = {
  name: "Pecto's Bakery",
  tagline: "Lucban's Best Delicacies",
  founded: 1947,
  street: '93 Quezon Avenue',
  town: 'Lucban, Quezon',
  hours: {
    days: 'Daily',
    time: '5:00 AM – 8:00 PM',
    opens: '5 AM',
    note: 'Fresh batches at 5 AM and 3 PM',
  },
  phones: ['(042) 540-4366', '(042) 540-8838'],
}

// Delivery covers this town only (PHASE10 B7); the server enforces it
// (routes/orders.js) and checkout uses this to grey out other addresses.
export const deliveryTown = 'Lucban'
export const isDeliverable = (address) => address?.municipality?.trim().toLowerCase() === deliveryTown.toLowerCase()

export const bakeryAddress = `${bakery.street}, ${bakery.town}`
export const bakeryMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${bakery.name}, ${bakeryAddress}`)}`
export const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`
