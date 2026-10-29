# PECTRACK evaluation questionnaire (ISO/IEC 25010)

**For:** the group, to run before the final defense. The results go in Chapter 4.
**Draft of:** 2026-10-30. Adjust the wording to your school's template if it has one.

## How to run it

| Respondents | Who | How many | Form |
|---|---|---|---|
| End users | The General Manager (admin) and the cashiers of Pecto's Bakery | All (about 3, per the interview) | Part A + Part B |
| End users | Customers who place a real or test order on the live site | 10–20 | Part A + Part B (customer items only) |
| IT experts | IT faculty or IT professionals who test every module | 3–5 | Part A + Part C |

- Each respondent first uses the system on the live site: a staff member processes walk-in, advanced, and online orders, confirms a GCash payment, adjusts stock, and opens the reports; a customer registers, orders, and pays.
- Responses use a 5-point Likert scale. Compute the **weighted mean** of each item, each characteristic, and the whole survey: weighted mean = Σ(f × w) ÷ N, where f is the number of respondents who chose a rating, w is the rating, and N is the number of respondents.
- Interpret each mean with this scale:

| Rating | Range | Interpretation |
|---|---|---|
| 5 | 4.21–5.00 | Strongly Agree |
| 4 | 3.41–4.20 | Agree |
| 3 | 2.61–3.40 | Neutral |
| 2 | 1.81–2.60 | Disagree |
| 1 | 1.00–1.80 | Strongly Disagree |

- Keep the signed forms; put a blank copy in the Appendices.

---

## Part A. Respondent profile

Name (optional): ____________  Role: ☐ Admin ☐ Cashier ☐ Customer ☐ IT expert
Device used: ☐ Computer ☐ Mobile phone  Date: ____________

---

## Part B. End users (staff and customers)

Rate each statement: 5 Strongly Agree, 4 Agree, 3 Neutral, 2 Disagree, 1 Strongly Disagree. Customers skip the items marked (staff).

### Functional suitability
1. The system records orders completely and correctly, with their items, quantities, prices, and requested time.
2. The stock is updated correctly when an order is placed or cancelled. (staff)
3. The payment status of each order is shown correctly.
4. The order status (Ready for Pickup, Out for Delivery, Completed) is accurate and up to date.
5. The Production list shows the right quantities to bake for the day. (staff)
6. The reports show the bakery's sales and best-selling products correctly. (staff)

### Performance efficiency
7. Pages and screens load quickly.
8. Placing an order and recording a payment take little time.
9. Stock counts update right away after a change.

### Usability (interaction capability)
10. The system is easy to learn without training.
11. The menus, buttons, and labels are clear.
12. The system works well on a mobile phone.
13. Error messages clearly say what to correct.
14. The system is pleasant to use.

### Reliability
15. The system works without errors or crashes.
16. Orders and payments are not lost when the page is reloaded or the connection drops briefly.
17. The system is available whenever I need it.

### Security
18. Only authorized users can open the staff modules. (staff)
19. I feel that my personal information and account are protected.
20. The verification codes (SMS, email) make the system feel secure.

---

## Part C. IT experts

Rate each statement on the same scale.

### Functional suitability
1. The system's functions cover every objective stated in the study.
2. The functions produce correct results (totals, change, stock, reports).
3. The functions make the bakery's tasks easier to complete.

### Performance efficiency
4. Response times are acceptable under normal use.
5. The system uses server and database resources efficiently.

### Compatibility
6. The system works on different browsers (Chrome, Edge, Firefox, Safari).
7. The system works correctly alongside the services it uses (SMS, email, hosting).

### Usability (interaction capability)
8. The interface is consistent across modules.
9. The system protects users from errors (validation, confirmations).
10. The interface is accessible on small screens.

### Reliability
11. The system handles invalid input and failed requests without crashing.
12. The data stays consistent when two users work at the same time.

### Security
13. Passwords are stored securely and sign-in is protected against repeated guessing.
14. Users can only open the data and functions of their own role.
15. The system protects against common attacks such as SQL injection.

### Maintainability
16. The code is organized into clear modules.
17. The system can be changed or extended without breaking other parts.
18. The system has automated tests for its main functions.

### Portability
19. The system can be deployed to another hosting provider without major changes.
20. The system can be installed and set up by following its documentation.

---

## Part D. Comments and suggestions (all respondents)

What did you like most? ____________________________________________

What should be improved? ____________________________________________

---

## For Chapter 4

Present one table per respondent group: each characteristic with its weighted mean and interpretation, then the overall mean. Follow each table with a short paragraph that names the highest- and lowest-rated characteristics and the respondents' comments. ISO/IEC 25010:2023 renamed "usability" to "interaction capability"; use whichever name your school's template uses, consistently.
