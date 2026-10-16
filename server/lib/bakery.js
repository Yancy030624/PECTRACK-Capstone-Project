// The bakery's own details, for the emails the server sends
// (lib/notices.js). src/lib/bakery.js is the screen copy, read by every
// storefront page. KEEP THE TWO IN STEP: a change to the address, hours or
// phone numbers there must be made here too. The server does not import
// from src/, so this is a deliberate second copy of a few lines.
export const bakery = {
  name: "Pecto's Bakery",
  street: '93 Quezon Avenue',
  town: 'Lucban, Quezon',
  hours: 'Daily 5:00 AM – 10:00 PM',
  phones: ['(042) 540-4366', '(042) 540-8838'],
}

export const bakeryAddress = `${bakery.street}, ${bakery.town}`
export const bakeryPhones = bakery.phones.join(' or ')
