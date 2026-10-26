# Script 4 — Luza: Scope and Limitations

**Slides:** 18–22, then the hand-off to the live demo
**Time:** about 2 minutes 30 seconds
**Your job:** draw the map of PECTRACK: the nine modules inside it, and the four honest boundaries around it. Then open the door to the live demo. Being clear about the limits builds the panel's trust.

**Your flow:** The system as nine rooms in one house → access and overview → orders, stock and payment → delivery, notifications and reports → the four boundaries, each with its reason → hand off to the live demo.

Cues: **[CLICK]** = next slide. **[PAUSE]** = stop for one breath. Words in **bold** = say them with weight.

---

### Slide 18 — Divider

**[CLICK]** straight through.

### Slide 19 — Access and overview

> Thank you, Carla.
>
> Think of PECTRACK as **one house with nine rooms.** Every room has a job, and they all share the same records. Let me walk you through them, three at a time.
>
> The first three are the **front door and the front desk.**
>
> **Login** checks who is coming in — with the admin code and the lockout Carla mentioned.
> The **Dashboard** shows, at a glance, what needs attention today: the day's orders, the day's sales, the breads running out.
> And **User Management**, for the admin only, keeps the accounts of customers, cashiers and riders.

**[CLICK]**

### Slide 20 — Orders, stock and payment

> The next three are the **heart of the bakery.**
>
> **Order Management** follows each order from the moment it is placed to the moment it is completed.
> **Inventory Management** keeps the stock current — soft breads topped up every morning, hard breads by their minimum and their target, and the Production list.
> And **Payment and Billing** records every peso, cash or GCash, with a payment log the bakery can export as a PDF.

**[CLICK]**

### Slide 21 — Delivery, notifications and reports

> And the last three **reach outside the bakery.**
>
> **Delivery Management** sends riders across Lucban, with a photo as proof of every delivery.
> **Notifications** keep everyone informed — a bell for the staff, emails for customers and riders, an SMS order number, and the low-stock warning.
> And **Reporting and Analytics**, for the admin, holds the reports and the seven-day forecast.
>
> [PAUSE] **Nine rooms. One house. One set of records.**

**[CLICK]**

### Slide 22 — Limitations

> But every house has walls. And we want to show you ours honestly, because each one has a **reason**.
>
> **One — delivery is within Lucban only, with no cash on delivery and no refunds.** Why? These are the bakery's own rules. Bread refused at the door cannot be sold again.
>
> **Two — the forecast starts on assumed history.** Why? The bakery never kept sales records we could import. After fifty-six days of real sales, the system switches over **by itself.**
>
> **Three — PECTRACK needs an internet connection.** Why? It is a web-based system. The counter, the customers and the riders all need to be online to use it.
>
> **Four — there is no separate record of rejected bread.** Why? The bakery does not keep one today. Losses show through the stock corrections instead.
>
> [PAUSE] These are not things we forgot. **They are lines we drew on purpose.**

### Hand-off to the live demo

> [Turn to the panel]
>
> We have told you the story. Now, let us **show** it to you.
>
> We will follow **one order** — from the customer who places it, to the bakery that bakes it, to the rider who delivers it. **Live.**

[The demo driver takes over and switches to the browser: pectrack.up.railway.app.]

---

## What to stress
- The **house** picture: "one house, nine rooms." It makes nine modules easy to follow.
- For every limitation, say **"Why?"** out loud before the reason. It shows each limit was a decision.
- "**They are lines we drew on purpose.**" Pause before it.

## Fix in the deck before the defense
- Slide 22 says **"Network indepedency"**. It should be **"Needs internet"** or **"Network dependency"**. "Independency" means the opposite.

## Questions you might get
| Question | Answer |
|---|---|
| What if the internet goes down at the counter? | There is no offline mode; it is in our limitations. The bakery takes orders on paper, as it does today, and enters them when the connection returns. Confirm this fallback with the bakery before the defense. |
| Is the SMS and GCash real? | Both run in test mode (textbee and PayMongo), as our adviser approved for the defense. Live accounts follow if the bakery adopts PECTRACK. |
| Why are ingredients not deducted automatically? | The system does not store recipes, so ingredient stock is kept current by recorded deliveries and the admin's counts. |
| Who maintains the system after you graduate? | Not settled yet. Agree on an answer with our adviser before the defense. |
