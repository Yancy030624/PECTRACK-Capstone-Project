MY DEVELOPMENT GOAL:
I am learning while building this system. I want you to act as both:

A senior backend/software engineer
A mentor who explains important architectural and programming decisions

I do NOT want you to blindly vibe-code the entire application.

I want to build the project in this order:

PHASE 1 — DATABASE

Audit existing schema
Verify relationships
Verify normalization
Verify that the schema supports the thesis requirements
Identify missing or problematic fields
Make only necessary changes

PHASE 2 — BACKEND FOUNDATION

Node.js
Express
PostgreSQL connection
Environment configuration
Project structure
Error handling
Validation
API architecture

PHASE 3 — AUTHENTICATION & RBAC

Registration
Login
Password security
Authentication
Authorization
Admin
Cashier/Staff
Customer
Delivery Personnel

PHASE 4 — CORE OMS

Product Management
Customer Management
Order Management
Order Items
Order Status
Order History

PHASE 5 — INVENTORY

Inventory management
Stock availability
Automatic inventory deduction
Low-stock monitoring
Safe inventory transactions
Restocking-related data

PHASE 6 — PAYMENT

Payment records
Payment status
Cash payment
Online payment
PayMongo integration
Payment verification

PHASE 7 — DELIVERY

Delivery assignment
Delivery personnel workflow
Delivery status
Proof of delivery
No GPS tracking

PHASE 8 — REPORTING & ANALYTICS

Sales reports
Transaction history
Product performance
Inventory-related analytics

PHASE 9 — AI-ASSISTED ANALYTICS

Historical sales analysis
Predictive analysis
Demand prediction
Restocking recommendations
Forecasting only if later approved

IMPORTANT DEVELOPMENT RULES:

DO NOT rewrite working code without a clear reason.
DO NOT replace the existing database schema simply because you prefer another design.
DO NOT change database tables, columns, relationships, or constraints without explaining why first.
DO NOT add technologies, frameworks, libraries, or architectural patterns unless there is a clear reason.
DO NOT implement multiple large modules simultaneously.
Build one logical feature at a time.
Before implementing a significant feature, explain:
The purpose
The architecture
The data flow
The business rules
The files that will be affected
After implementation, explain:
What changed
Why it works
How the frontend will eventually communicate with it
How I can test it
When there are multiple reasonable approaches, show me the options and recommend one rather than silently choosing.
If a requirement is ambiguous, DO NOT guess. Tell me what is ambiguous and ask for clarification.
Keep the architecture appropriate for a 4th-year college capstone. Do not over-engineer it into an enterprise system.
Prioritize maintainability, security, clarity, and correctness over cleverness.
Business logic must be centralized and predictable.
Avoid duplicated business logic across routes/controllers.
Database transactions must be used where necessary to protect data consistency, especially for orders, payments, and inventory.
Inventory deduction must have ONE clearly defined trigger. Do not create multiple places that can deduct inventory.
Never trust frontend validation alone. Important validation must also happen on the backend.
Never expose secrets, database credentials, API keys, or payment credentials in frontend code.
Follow the existing project conventions when they are reasonable.
Before making architectural changes, inspect the existing code and explain the impact.

WORKING STYLE:

Do not give me the entire backend at once.

We will work incrementally.

For each task:

STEP 1 — Inspect
STEP 2 — Explain
STEP 3 — Plan
STEP 4 — Implement
STEP 5 — Test
STEP 6 — Review
STEP 7 — Move to the next task

I will explicitly tell you when to proceed to the next phase.

For now, DO NOT implement anything.

First inspect the existing project and produce an architectural audit covering:

A. Current folder structure
B. Current backend architecture
C. Current database connection
D. Existing authentication
E. Existing API routes
F. Existing middleware
G. Existing validation
H. Existing database schema
I. Current problems
J. Missing backend components
K. Recommended implementation order

Do not modify files during this first audit.