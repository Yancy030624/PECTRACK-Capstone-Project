For now, our team's Figma design is not finalized yet.

I want you to continue building the frontend using your own clean and practical UI design decisions for the current development stage.

IMPORTANT:

* Treat this as a temporary development UI.
* Do not spend excessive time on visual polish or animations.
* Prioritize usability, responsiveness, component reusability, and correct integration with the existing backend.
* Keep the UI structure clean enough that we can later adapt it to our finalized Figma design.
* Do not make the current visual design tightly coupled to business logic.
* Separate reusable components from page-specific components.
* Keep colors, spacing, typography, and layout easy to modify later.
* Do not change the backend or database to accommodate the UI.

Focus on:

1. Correct frontend architecture
2. API integration
3. Authentication and role-based access
4. Forms and validation
5. Loading states
6. Error handling
7. Empty states
8. Responsive layout
9. Reusable components

Use reasonable modern dashboard/e-commerce design patterns, but keep the implementation appropriate for a 4th-year IT capstone.

When our Figma is finalized later, we will use it as the visual reference and adjust the frontend without changing the underlying business logic or API contracts unless necessary.


Now that the frontend audit is complete, design the frontend architecture for PECTRACK. 

Do NOT implement it yet.

The architecture must support four roles:

* Admin
* Cashier
* Customer
* Delivery Personnel

The frontend must communicate with our existing Node.js/Express API.

I want a practical architecture appropriate for a 4th-year capstone, not an enterprise-scale application.

Please propose:

1. Folder structure
2. Routing structure
3. Protected routes
4. Role-based route/access handling
5. API/service layer
6. Authentication state management
7. Shared layout components
8. Reusable UI components
9. Form handling and validation
10. Loading states
11. Error handling
12. Notification/toast handling
13. Modal/dialog handling
14. State management strategy

For each decision, explain why it is appropriate.

Avoid adding libraries unless there is a clear reason.

Do not use a global state-management library if React's built-in state/context is sufficient.

Keep business logic out of UI components where practical.

Most importantly:

The frontend must NOT duplicate backend business logic.

The backend remains the source of truth for:

* permissions
* order rules
* inventory rules
* payment rules
* validation
* calculations

The frontend should primarily handle:

* presentation
* user interaction
* local UI state
* API communication
* displaying backend results

After proposing the architecture, wait for approval before making major structural changes.

Before coding, follow this process:

1. INSPECT
   Read the relevant existing files and API contracts.

2. EXPLAIN
   Tell me what the current implementation does.

3. IDENTIFY
   Tell me exactly which files need to change.

4. PLAN
   Give me a small implementation plan.

5. IMPLEMENT
   Make only the changes required for the current task.

6. TEST
   Give me specific test cases.

7. REVIEW
   Check whether the implementation follows the existing architecture and does not break other modules.

Do not skip the inspection step.
Do not make unrelated refactors.
Do not modify working code without a demonstrated reason.
