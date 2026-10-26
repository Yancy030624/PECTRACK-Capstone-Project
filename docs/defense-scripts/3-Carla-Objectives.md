# Script 3 — Carla: Objectives

**Slides:** 12–17
**Time:** about 3 minutes (about 40 seconds per objective)
**Your job:** turn the story into promises, and prove each promise is kept. For every objective, say the promise, then show the proof. Promise, proof. Promise, proof.

**Your flow:** The general objective → four promises at a glance → objective 1: every order in one system → objective 2: the data is protected → objective 3: stock that updates itself → objective 4: knowing what sold and what will sell → hand off to Luza.

Cues: **[CLICK]** = next slide. **[PAUSE]** = stop for one breath. Words in **bold** = say them with weight.

---

### Slide 12 — Divider

**[CLICK]** straight through.

### Slide 13 — Four objectives

> Thank you, Yancy.
>
> Every system starts with a promise. Ours is this: [PAUSE] **to design, develop, and implement PECTRACK for Pecto's Bakery.**
>
> And we broke that promise into four.
>
> **One** — an order management system that handles every kind of order.
> **Two** — security that protects the bakery's and the customers' data.
> **Three** — an inventory that updates itself.
> **Four** — reports and a forecast, so the bakery knows what sold, and what will sell.
>
> Let me show you how each one is kept.

**[CLICK]**

### Slide 14 — Objective 1: Manage every order in one system

> **Our first objective: to develop a web-based order management system.**
>
> Remember the ten steps on paper? Now, **every** order lives in one place. Online orders, with a time slot. Walk-in orders at the counter. Advanced orders for a later date.
>
> Every order is **paid before it is released**: by GCash, or in cash at pickup. Then it moves from **Ready**, to **Out for delivery**, to **Completed**. And every paid order has a receipt.
>
> [PAUSE] **One list. Every order. No paper.**

**[CLICK]**

### Slide 15 — Objective 2: Keep the data private

> **Our second objective: to deliver a system with authentication features for data privacy.**
>
> A bakery that keeps customer names, numbers, and addresses must protect them. So we built the doors carefully.
>
> Customers and staff have **separate entrances.** The admin needs a password **and** a code sent by email. Customers verify their mobile number by SMS, and confirm their email before their first order. Five wrong passwords, and the account **locks for fifteen minutes.**
>
> And every role sees only what it needs. A rider cannot open the reports. A cashier cannot manage user accounts.
>
> [PAUSE] **Only the right people, through the right door.**

**[CLICK]**

### Slide 16 — Objective 3: Stock that updates itself

> **Our third objective: to automate the bakery's inventory.**
>
> This is where the system starts doing the work for the bakery.
>
> The moment an order is placed, the stock goes **down**. If an unpaid order is cancelled, the stock comes **back**.
>
> Every morning at **five o'clock**, the soft breads are topped up to the day's standard. Hard breads are produced when they reach their minimum, and stop at their target.
>
> And it knows the calendar. **Twice** the hard breads for weekends. **Four times** a week before events like Pahiyas. When a bread runs low, the admin and the cashier get a **red warning, with a sound.**
>
> [PAUSE] **Nobody counts bread by hand after every sale anymore.**

**[CLICK]**

### Slide 17 — Objective 4: Know what sold and what will sell

> **Our fourth objective: to create a reporting and predictive analytics module.**
>
> First, the bakery can finally **see** its business. Sales by day, week, or month. The best sellers. What was baked, sold, and lost. The busiest hours and days.
>
> And second — it can look **ahead**. PECTRACK forecasts the next **seven days** of sales for every product. It does not trust just one method. It **tests three**, and uses the one that predicted best for each product.
>
> Now, we will be honest with you. [PAUSE] The bakery never kept sales records. So, with our adviser's approval, the forecast learns from **assumed history** for now. Once the bakery has **fifty-six days of real sales**, the system switches to them **by itself.**
>
> [PAUSE] **From baking by memory, to baking by data.**

> [Hand-off — turn toward Luza]
>
> Those are our four promises. But every system has its edges. **Luza** will show you what PECTRACK covers, and where it stops.

---

## What to stress
- The rhythm: **promise, then proof**, every time. Read the objective in bold first.
- The one-line closer after each objective: "One list. Every order. No paper." / "Only the right people, through the right door." / "Nobody counts bread by hand…" / "From baking by memory, to baking by data."
- Say the **assumed history** part yourself. It sounds honest coming from us, but defensive if the panel has to ask.

## Questions you might get
| Question | Answer |
|---|---|
| Your forecast learns from assumed data. Why call it predictive analytics? | The method is validated on assumed history approved by our adviser. After 56 days of real sales, the system switches to them by itself, and real accuracy is measured then. |
| Is it really machine learning? | Yes. One of the three methods is a regression model trained on daily sales, including weekdays, paydays, holidays and events. It is compared with two simpler methods on a four-week test, and the most accurate is used for each product. |
| The bakery's rules decide what to bake. What does the forecast change? | It warns before a bread sells out: the Production list shows "+N more" when the forecast expects more than the plan. |
| Why did the objectives change from the proposal? | We revised them after the proposal defense and our consultations with the bakery: inventory automation was added. |
| What if the bakers baked less than the 5:00 AM standard? | The admin corrects the count, and every correction is recorded with who made it and when. |
