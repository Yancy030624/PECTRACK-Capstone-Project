# Script 2 — Yancy: Purpose and Description (the proposed solution)

**Slides:** 8–11
**Time:** about 2 minutes 30 seconds
**Your job:** Valencia showed the pain. You show the cure. Walk the panel through PECTRACK as if they were the customer and then the bakery, so they can picture it before the demo.

**Your flow:** What PECTRACK is in one sentence → one order in four steps → what happens behind the scenes → who benefits → four users, one system → hand off to Carla.

Cues: **[CLICK]** = next slide. **[PAUSE]** = stop for one breath. Words in **bold** = say them with weight.

---

### Slide 8 — Divider

**[CLICK]** straight through.

### Slide 9 — Ordering in 4 steps

> Thank you, Valencia.
>
> So what is PECTRACK? In one sentence: [PAUSE] **PECTRACK lets customers order and pay online, keeps the bakery's stock up to date by itself, and tells the bakery how much to bake.**
>
> Let me walk you through it as a customer.
>
> **One** — you open the menu and choose your breads.
> **Two** — you choose pickup or delivery, and a time. Every thirty minutes, from five in the morning to ten at night.
> **Three** — you pay. GCash, or cash when you pick it up.
> **Four** — you get your order number, and an email every time your order moves.
>
> No more "Where is my order?" messages. **The order tells you.**
>
> Now, delivery is within Lucban, with a flat **fifty-peso** fee, and it is **paid with GCash before it leaves the bakery.** Why no cash on delivery? Because bread refused at the door **cannot be sold again.** That is the bakery's rule, and the system follows it.
>
> [Point at the four cards below.]
>
> And while the customer does those four steps, look at what happens **behind the scenes**.
>
> The stock goes down **the moment the order is placed.** Every morning at **five o'clock**, the soft breads are topped up to the day's standard. The **Production list** tells the bakers what to bake — and it rises on its own for weekends and events. Riders deliver with a **photo as proof.** And the reports show what sold, and what will sell in the next seven days.

**[CLICK]**

### Slide 10 — Who benefits

> So who wins?
>
> **The bakery.** One order list instead of a pile of paper. Stock that updates itself, with a red warning before a bread runs out. A bake list that already knows it is Pahiyas week. And riders who see their deliveries right on their phones.
>
> **The customer.** Order any time, from a phone or a computer. Choose your time. Know exactly where your order is. And see every receipt and past order in one place.

**[CLICK]**

### Slide 11 — Four users, one system

> Four people use PECTRACK, each with their own door.
>
> The **customer** orders and pays online.
> The **cashier** takes walk-in and advanced orders, records payments, and keeps the stock moving.
> The **rider** delivers, straight from the phone.
> And the **admin** sees everything — products, stock, production, users, and reports.
>
> [PAUSE] Four users. **One system.** No more paper passed from hand to hand.

> [Hand-off — turn toward Carla]
>
> But a system is only as good as what it was built to achieve. **Carla** will now take you through our objectives.

---

## What to stress
- The **one-sentence definition**. Say it slowly; the panel will remember it.
- **"The order tells you."** It answers Valencia's "Where is my order?" story directly.
- **Behind the scenes**: stock goes down on its own, the 5:00 AM top-up, the bake list.

## If you are short on time
Skip slide 11. It is marked optional in the deck. Say the last two lines ("Four users. One system.") at the end of slide 10 instead.

## Questions you might get
| Question | Answer |
|---|---|
| Is the GCash payment real? | It runs in PayMongo test mode, as our adviser approved for the defense. Live accounts follow if the bakery adopts PECTRACK. |
| Why a flat ₱50 for all of Lucban? | The bakery set it. Delivery is within Lucban only. |
| What happens to an unpaid cash pickup? | It is cancelled automatically at the end of its day, and a customer can have only one unpaid cash order at a time. |
| What did you build it with? | React with Vite for the web app, Node.js with Express for the server, PostgreSQL for the database, hosted on Railway. |

---

# Reporting and predictive analytics: your explainer

Use this when the panel asks about reports or the forecast, or when you show them in the live demo. The Forecast screen no longer has an explanation paragraph, so **you** say it.

## Reporting and Analytics, tab by tab

| Tab | What it does | How it works | Problem it solves |
|---|---|---|---|
| **Sales** | Money received, number of orders and delivery fees, by day, week or month, plus peak hours and days | Totals the **paid** payments in the date range; unpaid orders do not count | The bakery had no record of what it earned |
| **Products** | Best sellers by **pieces sold** | Counts the pieces in the orders placed in the range; cancelled orders and unpaid GCash checkouts are left out | Nobody knew which breads actually sell |
| **Inventory** | Baked or added, sold, and corrected count for each product | Reads the stock record, where every change is logged with who made it and when. Added − sold − corrected equals the real change in stock | Stock was counted by hand, so nobody could see where bread went |
| **Forecast** | Expected sales of each product for the next 7 days | See below | Production was planned from memory |
| **Export history** | Every report downloaded or printed, with who and when | Logged each time someone exports | Accountability for the bakery's data |

## Predictive analytics (the Forecast tab)

**What it does:** it predicts how many pieces of each product will sell on each of the next 7 days.

**How it works**, in four steps:
1. **It learns from daily sales history.** It looks at what sold on each day, and on what kind of day: the weekday, payday (the 15th and the last day of the month), holidays, and the bakery's events such as Pahiyas.
2. **It tries three methods:**
   - **Seasonal-naïve:** "next Tuesday is the average of the last four Tuesdays." The simplest one, and the baseline.
   - **Holt-Winters:** follows the trend and the weekly pattern as new days come in.
   - **Regression** (the machine-learning one): learns how much each factor (a Saturday, a payday, an event) raises or lowers sales.
3. **It tests them.** It pretends it is four weeks ago, predicts each following week, and compares the predictions with what actually sold, four times over. The most accurate method **for each product** is used. If two tie, the simpler one wins.
4. **It runs every night by itself.** It learns from assumed history until the bakery has **56 days of real sales**, then switches to real sales automatically.

**The problem it solves:** the bakery planned production from memory. The forecast gives it a number. On the Production list, it warns with **"+N more"** when it expects more sales than the plan.

**What to say on the Forecast screen** (about 20 seconds):

> PECTRACK studies past daily sales — weekdays, paydays, holidays and events like Pahiyas — and predicts how many of each product will sell in the next seven days. Right now it is in **practice mode**: the bakery kept no sales records, so it learns from a year of assumed sales built from the bakery's patterns, as our adviser approved. After **56 days of real sales**, it switches over by itself.

Point at the **"PRACTICE DATA (ASSUMED)"** badge while you say "practice mode".

## Likely panel questions on reports and the forecast

| # | Question | Answer |
|---|---|---|
| 1 | What is the difference between reporting and predictive analytics? | Reporting looks **back**: what sold and what was earned. Predictive analytics looks **ahead**: what will sell in the next 7 days. |
| 2 | Your forecast learns from fake data. Isn't that useless? | It is assumed data, approved by our adviser, because the bakery kept no records. It proves the **method** works. Real accuracy is measured after 56 days of real sales, when the system switches over by itself. |
| 3 | How accurate is it? | The figure on screen is a test on practice data, not the bakery's real accuracy. We will only know the real accuracy after 56 days of real sales. **Never quote the practice number as the bakery's accuracy.** |
| 4 | Why three methods and not just one? | No single method is best for every product. We test all three on the last four weeks for each product and use the most accurate, as forecasting studies also compare methods (Huber and Stuckenschmidt, 2020). |
| 5 | Where is the machine learning? | The regression is a supervised model. It is trained on past daily sales to learn a weight for each factor: each weekday, payday, holidays, events, and the trend. |
| 6 | How do you measure accuracy? | By the average number of pieces it was off per day, and by the total error compared with total sales. For example: "off by about 3 pandesal a day." |
| 7 | What happens on a day a bread sold out? | That day is **left out** of learning. Sales stopped because the shelf was empty, not because demand stopped, so counting it would teach the system that demand was low. |
| 8 | Does the forecast decide what to bake? | No. The bakery's rules decide: the daily standard, the minimum and stop level, ×2 for weekends and ×4 for events. The forecast **warns** with "+N more" when demand may beat the plan, and the admin uses it to adjust the standards. |
| 9 | Why 56 days? | It is eight weeks: the shortest history that still covers the four weeks of testing plus enough weeks to learn from. |
| 10 | Why 7 days, not a month? | Bread is baked daily and planned by the week, and events are prepared a week ahead. |
| 11 | Do assumed sales appear in the Sales report? | No. Assumed data never goes into money figures. The reports show only real transactions, unless the Demo data switch is on, and then a yellow banner says so. |
| 12 | What is "Corrected count"? | Bread removed from the count after a physical stock check, for example burned or thrown-away bread. The bakery does not record rejects separately. |
| 13 | Who can see the reports? | The admin only. The cashier sees the Dashboard's Today row and the Payment log. |
| 14 | What if the forecast is wrong on an event day? | Events are a factor the regression learns, and the Production list still raises hard breads ×4 a week before an event by rule. The forecast adds a warning; it does not replace the rule. |
