# Chapter 3: Methodology

Source: docs/PECTRACK_REVISED.pdf, PDF pages 71–114.

<!-- PDF page 71 -->

for every small business. PECTRACK is therefore intended to provide features that are relevant to Pecto’s Bakery and its existing operations, instead of simply copying the functions of larger commercial platforms. Overall, the reviewed literature, studies, and existing systems highlight the importance of digital order management, inventory monitoring, and data-based decision-making in business operations. However, Pecto’s Bakery needs a system that combines these functions based on its specific needs. PECTRACK addresses this need by providing a web-based Order Management System with inventory management and predictive analytics. It aims to organize customer orders, provide clearer order status information, monitor product availability, and demonstrate how predictive analytics can be used to estimate future product demand. The reviewed sources also provide a foundation for the Purpose and Description and Scope and Limitations of the study. PECTRACK will focus on order management, inventory management, and reporting and analysis, including predictive analytics using assumed or simulated historical sales and order data. Since the actual historical data of Pecto’s Bakery is not available for the study, the assumed data will be used to demonstrate the system’s predictive analytics functionality. Therefore, the generated estimates will not represent the bakery’s actual sales patterns or guarantee future demand. Despite this limitation, the system aims to demonstrate how order management, inventory monitoring, and predictive analytics can be integrated into one platform to support more organized operations and informed decision-making.

<!-- PDF page 72 -->

## METHODOLOGY

Technical Background - Methodology The study will use the Agile Methodology, a software development approach that emphasizes iterative development, flexibility, and continuous collaboration with the client. Agile allows the proponents to develop the system in small and manageable increments to ensure that each feature is continuously evaluated and improved based on feedback.

<!-- PDF page 73 -->

Figure 19: Scrum Methodology

Among the commonly used Agile frameworks, the proponents selected the Scrum Framework because it provides a structured process through Product Backlog, Sprint Planning, Sprint Design, Sprint Development, Sprint Testing, Sprint Review, and Sprint Retrospective. This framework is applied in the study since it can be used to facilitate the development in modules, specific sprint objectives, and frequent consultation with clients.

The development of the proposed system was categorized into three major parts which are the foundational modules, core operational modules, and decision support modules with deployment. This ensures the development process and each important feature of the system was implemented systematically and efficiently.

The foundational modules focused on establishing the core structure and security of the system, including user authentication, dashboard, and product management. These modules served as the foundation of the entire system since they manage user access, navigation, and product information. The core operational modules focused on the daily operational processes of the bakery such as order processing, inventory monitoring, and payment recording. These modules were developed to improve transaction handling, automate inventory updates, and support the

<!-- PDF page 74 -->

day-to-day activities of the bakery. Lastly, the decision support modules and deployment focused on sales reporting, customer order history, final testing, and system deployment. These modules were intended to support business monitoring and decision-making while also ensuring that the system was fully tested. After gathering feedback from the client and confirming that the system was already functional and met the operational requirements of the bakery, the system will prepare for actual deployment.

The circular flow of the Scrum Framework is the iterative aspect of Agile development where the cycle repeats over and over again with a series of sprints until all the requirements of the proposed system are fulfilled. After completing one sprint cycle, the proponents proceed to the next sprint by reviewing the completed tasks, gathering client feedback, identifying areas for improvement, and prioritizing the remaining system requirements. This continuous cycle allows the system to be gradually improved throughout the development process. It also ensures that errors, missing features, and client suggestions are addressed immediately before moving to the next phase of development. This looping process ensures that all modules of PECTRACK: A Web-Based Order Management System with Predictive Analytics and Inventory System for Pecto’s Bakery at Lucban Quezon are continuously developed, tested, evaluated, and improved until all system objectives and project scope have been met.

Phase of Scrum Model

- Phase1: Product Backlog - The Scrum process was adopted when the proponents identified a potential client whose business operations could benefit from a computing solution. After selecting PECTO's Bakery as the client, the proponents conducted interviews and consultations with the owner to understand the current workflow, existing issues, and desired improvements in their order processing operations. The information gathered was adapted into system requirements such as order processing, inventory monitoring, payment recording,

<!-- PDF page 75 -->

and sales reporting, which were then documented in the Product Backlog. These requirements were then organized into three major parts which are foundational modules, core operational modules, and decision support modules with deployment, which will serve as the basis for the succeeding sprint phases.

- Phase2: Sprint Planning - The Sprint Planning phase will be adopted to organize and prioritize the items in the Product Backlog based on their importance to the bakery's operations. The proponents will adapt the gathered requirements into structured sprint goals by organizing them into three major parts, foundational modules, core operational modules, and decision support modules with deployment.

- Phase3: Sprint Design - The Sprint Design phase will be adopted to establish the system architecture and overall design of the proposed system. The proponents will adapt the client's requirements into system designs, including user interface layouts, database structure, and system flow diagrams. Wireframes will be created to visualize the system's functionality before the development of each sprint cycle begins.

- Phase4: Sprint Development- The Sprint Development phase will be adopted to implement the actual coding of the system. The proponents will adapt the approved design specifications into functional modules across three sprint cycles, foundational modules, core operational modules, and decision support modules with deployment. Within each sprint cycle, the proponents will conduct a Daily Scrum to monitor the day-to-day progress of each module being developed, ensuring that any issues will be immediately addressed and resolved. Each module will be developed iteratively, meaning that if a module does not meet the required functionality, the development cycle will repeat and go back through coding and adjustments, until the module is fully functional. The proponents will only proceed to the Sprint Testing phase once all modules within the current sprint cycle have been completed and are functioning as intended.

<!-- PDF page 76 -->

- Phase5: Sprint Testing- The Sprint Testing phase will be adopted to evaluate the functionality and performance of the developed modules. After completing all modules within a sprint cycle, the proponents will adapt testing procedures such as functional testing and usability testing to ensure that each module will perform according to the system requirements. Any errors and bugs identified during this phase will be fixed before proceeding to the next sprint cycle. - Phase6: Sprint Review - The Sprint Review phase will be adopted to present the developed features to the client for evaluation. The proponents will adapt the feedback gathered from the bakery owner and staff regarding usability, functionality, and suggested improvements to ensure that the system will align with the actual operational needs of the bakery.

- Phase7: Sprint Retrospective - The Sprint Retrospective phase will be adopted to evaluate the overall sprint process and identify areas for improvement. The proponents will adapt the insights gathered from the client's feedback, testing results, and development challenges to improve the approach of the next sprint cycle. This continuous evaluation will ensure that each sprint cycle becomes more efficient and aligned with the project goals until all system requirements are fully met and the system is ready for deployment.

- Technologies to be Used

This section presents the technologies and development tools that will be used for developing PECTRACK: A Web-Based Order Management System with Predictive Analytics and Inventory System for Pecto’s Bakery at Lucban Quezon. These technologies will be the tech stack for the proposed system, which refers to the set of programming languages, design tools, and database management solutions used to build the web application.

REACT (Version 19.2)

<!-- PDF page 77 -->

Figure 20. Logo React React is a JavaScript library used for building dynamic and interactive user interfaces. This allows faster response time and smoother user experience for the bakery owner and staff while managing orders, inventory, and sales records. React enables the proponents to create reusable components such as forms, dashboards, navigation menus, and inventory tables, making the development process more organized and efficient. It also improves system performance by updating only the necessary parts of the user interface instead of reloading the entire webpage. Tailwind CSS (Version 4.3)

Figure 21. Logo Tailwind CSS Tailwind CSS provides utility-based classes that allow the researchers to create a modern, clean, and responsive layout that can adapt to different screen sizes, including desktop and mobile devices. This technology enhances the visual appearance and usability of the system by making it easier for the bakery owner

<!-- PDF page 78 -->

and cashier to navigate the different modules. Node.js (Version 22)

Figure 22. Logo Node.js Node.js is a JavaScript runtime environment used for developing the back-end functionalities of web applications. In the proposed system, Node.js will be used to handle server-side operations such as processing requests, managing system logic, and communicating with the database. This enables the system to process multiple requests efficiently through its event-driven and non-blocking architecture, making it suitable for real-time web applications. It will support the core functionalities of PECTRACK, including order processing, inventory monitoring, user authentication, and alert notifications. Chart.js(Version 4.5 )

<!-- PDF page 79 -->

Figure 23. Logo Chart.js Chart.js is a JavaScript charting library used to display graphical representations of system data. In the proposed system, Chart.js will be used to generate visual reports such as daily sales, revenue summaries, inventory statistics, and product performance charts. This allows the bakery owner to easily monitor business performance and analyze operational data through interactive and understandable visualizations.

PostgreSQL (Version 18)

Figure 24. Logo PostgreSQL

<!-- PDF page 80 -->

PostgreSQL will serve as the Relational Database Management System (RDBMS) of the proposed system. It will manage and store essential data such as customer orders, product details, inventory records, payment transactions, user accounts, and sales reports. The use of an RDBMS enables the system to organize and maintain data efficiently through the establishment of relationships between database tables. This also ensures data integrity, consistency, reliability, and security, which are essential for supporting the daily operations and transaction processing of Pecto’s Bakery.

<!-- PDF page 81 -->

LOGIN MODULE FLOW CHART

The Login Module ensures secure access to the system by verifying user identity and assigning role-based access permissions.

The process begins when the user enters their username and password. The system first validates the credentials against the database. If the credentials are invalid, access is immediately denied to prevent unauthorized entry. If the credentials are valid, the system proceeds to identify the user’s assigned role, which determines the appropriate access level and dashboard.

For the Administrator, after successful credential validation, the system triggers a One-Time Password (OTP) verification as an additional security layer. The OTP is sent to the administrator’s email. If the OTP is incorrect, access is denied. Only after successful OTP verification is the Administrator granted access to the Admin Dashboard, which provides full control over system modules including user management, orders, inventory, delivery assignment, and reports.

For the Cashier, once the credentials are validated, the system checks whether the account role is assigned as cashier. If the role does not match, access is denied even if the credentials are correct. If the role is valid, the cashier is redirected to the cashier dashboard, where they can manage orders, update order status, process payments, and handle customer-related transactions.

For the Customer, after successful credential validation, the system checks whether the account is active. If the account is inactive or suspended, access is blocked. Only active customers are granted access; they are taken to the Menu, where they can browse products, place orders, and track order status.

This module ensures secure authentication and proper role-based access control across all user types within the system.

<!-- PDF page 82 -->

USER MANAGEMENT MODULE FLOW CHART

The Administrator accesses the User Management Module through the Admin Dashboard. The system displays the complete list of registered customers stored in the database. The Administrator can view customer details, update existing customer information, or deactivate customer accounts. Customers create their own accounts through registration. When modifications are made, the system validates the entered data. If the information is invalid, an error message is displayed and the changes are not saved. If the data is valid, the system saves the updated information successfully.

The Cashier uses this module primarily for order processing. The Cashier begins by searching for an existing customer using identifiers such as name or contact number. The system checks whether the customer exists in the database. If no customer is found, the system notifies the Cashier that no record exists. If a customer is found, the Cashier can view the customer's details and attach the customer to the order. Corrections to a customer's record are made by the Administrator.

The Customer has limited access within this module. The process begins when the Customer opens their profile page. The system displays their personal information stored in the database. If the customer chooses to edit their profile, they may update fields such as their name and contact number, add or edit delivery addresses, or change their email address, which requires their current password.The system validates the updated information before saving it. If the data is valid, the system updates the profile successfully.

<!-- PDF page 83 -->

INVENTORY MANAGEMENT MODULE FLOW CHART

The Administrator oversees the inventory system through the Inventory Management Module. The process begins when the Administrator accesses the inventory dashboard. The system displays all products along with their current stock levels. The Administrator can add new products, update product details, and monitor inventory availability. If stock levels fall below the minimum threshold, the system can generate stock alerts to notify the Administrator.

The Cashier may view inventory information when processing orders. Before confirming an order, the system checks whether sufficient stock is available for the selected products. If stock is insufficient, the system notifies the Cashier and prevents the order from proceeding until inventory is updated.

Customers do not have direct access to the inventory system. However, the system automatically reflects product availability in the product listing page. If a product is out of stock, it will either be hidden or marked as unavailable.

ORDER MANAGEMENT MODULE FLOW CHART

The Administrator monitors all orders within the system through the Order Management Module. The process begins when the Administrator opens the order management interface from the dashboard. The system displays the complete list of orders including order details, customer information, order status, and assigned staff . The Administrator can review orders, update order status, or resolve order issues when necessary.

<!-- PDF page 84 -->

The Cashier manages most of the operational tasks in the Order Management Module. The process begins when the Cashier creates a new order for a customer. The Cashier selects the customer record and adds products to the order. The system calculates the total amount based on the selected products and quantities. Once the order is confirmed, the system records the order and assigns an initial order status. The Cashier can update the order status during preparation or processing stages. The Customer creates orders through the website interface. The process begins when the customer browses available bakery products and adds selected items to the cart. After reviewing the cart, the customer confirms the order by selecting the preferred delivery option and payment method. The system records the order and displays the order status, allowing the customer to track the progress of their purchase.

PAYMENT AND BILLING MODULE FLOW CHART The Admin does not really manage the order process. It can only view payment transactions and generate financial reports to pdf. The Cashier primarily manages the Payment and Billing Module. The process begins after an order is created and ready for payment. The Cashier selects the order and records the payment method chosen by the customer. The system calculates the final amount and records the payment details in the database. If the customer selects an online payment method, the system processes the transaction through the integrated payment gateway. If the payment is successful,

<!-- PDF page 85 -->

the system updates the payment status and confirms the order. If the payment fails or is cancelled, the system notifies the user and allows another payment attempt. Customers can also select their preferred payment method when placing an order. After completing the payment process, the system records the transaction and updates the order status accordingly.

REPORTING AND ANALYTICS MODULE FLOW CHART The Administrator uses the Reporting and Analytics Module to monitor system performance and business activities. The process begins when the Administrator selects a report type from the reporting dashboard. The system retrieves relevant data from the database, including order transactions, sales records, inventory levels, and customer activity. Once the data is collected, the system generates a report that can be viewed on the dashboard or exported for documentation purposes. The generated reports help the Administrator analyze sales performance, monitor inventory usage, and make informed business decisions.

<!-- PDF page 86 -->

The Administrator has full access to this module. Cashiers see the same reports except Export History, and reports are view-only for everyone, to ensure the integrity of business data. The Cashier uses the Reporting and Analytics Module to review transaction records and daily sales performance. The process begins when the Cashier opens the reports section of the system and selects the type of report to view, such as the transaction log or the daily sales summary. Once the report type is selected, the system retrieves the relevant transaction data from the database and generates a report displaying completed sales and recorded transactions. The Cashier can review the generated report directly within the system interface. If the Cashier needs a copy of the report, the system allows the report to be exported as a PDF file for documentation and record-keeping purposes. This functionality helps the Cashier monitor completed transactions and maintain accurate sales records for daily operations. The Customer uses the Reporting and Analytics Module to review their personal transaction history and order records. The process begins when the Customer opens the order history section of their account within the system. My Orders lists the customer's orders, newest first, with their status. My Payments lists the customer's payments and can be filtered by date, payment method, and status. The Customer can open the receipt of any order and print it or save it as PDF for personal documentation. This feature allows Customers to keep track of their previous purchases and verify their completed orders within the system.

<!-- PDF page 87 -->

- Calendar of Activities

Product Backlog - Course Orientation and Discussion- The developers were informed about the requirements needed on the development of the projects. - Group Formation - In this activity, a group had to go through a series of stages to innovate projects.

Sprint Planning - Brainstorming. The developers were able to share ideas and information to create innovative topics. - Title proposal and consultation. The researcher presented three (3) thesis titles until the last title was approved through consultation.

Sprint Design - Introduction - The researchers developed the introduction of the study to provide an overview of the project and explain its significance. - Background of the Problem - The group identified and discussed the existing problems encountered in the current process or system. This section justified the need for the proposed solution.  - Purpose and Description - The developers described the purpose of the system and explained how the proposed project would function and benefit the users. Objectives of the Study The researchers formulated the general and specific objectives that the project aimed to achieve.  - Scope and Limitation - The boundaries, coverage, and limitations of the system were identified to clearly define the extent of the study.  - Review of Related Literature - The group gathered related studies, articles, and references to support the proposed project and strengthen its credibility.

## Synthesis

The researchers summarized and analyzed the

<!-- PDF page 88 -->

gathered related literature to identify connections and gaps relevant to the study. Sprint Development - Methodology - The developers selected and explained the methodology used in developing the system, including the processes and procedures followed during the project. - Hardware and Software - The researchers identified the hardware and software tools required for the development and implementation of the system. Sprint Resting - Appendices - The developers compiled supporting documents such as questionnaires, interview forms, letters, screenshots, and other necessary materials for validation and documentation purposes. - Gantt Chart - The researchers prepared the Gantt chart to monitor and track the schedule, progress, and completion of each project activity. Sprint Review - During this phase, the researchers reviewed the completed tasks, documents, and outputs to ensure that the project requirements and objectives were properly achieved. Feedback and suggestions from the adviser were considered for further improvements. Sprint Retrospective - The researchers evaluated the overall workflow, collaboration, and development process of the project. The team identified strengths, challenges encountered, and possible improvements that could help enhance future project activities and teamwork.

<!-- PDF page 89 -->

● Resources  Hardware ● Computer

Figure 25. Computer The main hardware resource in the study will be the computer as the main development tool will be used to code, design interfaces, create databases, test and document. The minimum specifications suggested are an Intel Core i3 or Ryzen 3 processor, 8GB RAM, 256GB SSD drive, and Windows 10 or higher OS. The device is utilized to execute the development environment, Web-based system, PostgreSQL database, and prepare project documentation including the manuscript, diagrams, and Gantt chart. Specification: RAM - 16GB CPU - Ryzen 5 5600g GPU - RTX 5060 SATA- 256GB

<!-- PDF page 90 -->

● Mobile Phone

Figure 26. Mobile Phone The device was used to record the interview sessions with the client so that all the requirements, features that were requested and operational issues of PECTO Bakery were properly recorded to be analyzed. Specification: Chipset -Mediatek Helio G100 Ultimate (6 nm) CPU - Octa-core (2x2.2 GHz Cortex-A76 & 6x2.0 GHz Cortex-A55) Internal Memory - 8GB RAM + 256 ROM

<!-- PDF page 91 -->

Software ● Figma(Version 125)

Figure 27. Figma It will be used in drawing the wireframes, storyboard, user interface layouts and interactive prototypes of the system before the real coding process. Using Figma, the proponents will be able to visually show the proposed design to the client to approve it and receive their initial feedback on the layout, navigation, and usability of the system modules. ● Visual Studio Code

Figure 28. Visual Studio Code Visual Studio Code will be the main code editor used by the proponents

<!-- PDF page 92 -->

for writing, editing, and organizing the React (JavaScript) front end, the Node.js and Express back end, and the Tailwind CSS styles during development. Its syntax highlighting, extension support, debugging options and project file management features make it more efficient and organized in the development process. ● MS Word

Figure 29. Microsoft Word The documentation and word-processing software that will be used in the study is Microsoft Word. It will be applied in the writing and formatting of the research manuscript, development of the progress report, development of interview questionnaire, documentation of sprint output, and completion of the capstone paper to submit.

## Requirements Analysis

This section presents the analysis of the client’s existing business operations and the computing solutions that the proponents can offer to improve the current workflow of PECTO’S Bakery in Lucban, Quezon. The proponents first identified potential local businesses that could benefit from a computing solution and selected PECTO’S Bakery as the client due to its existing manual order processing, inventory monitoring, and sales recording procedures. The proponents became aware of the bakery’s operational challenges through Cristirene,

<!-- PDF page 93 -->

the sister of one of the proponents who worked part-time at PECTO’S Bakery. Through consultation and observation, the proponents identified issues related to manual transaction recording, stock monitoring, and report management. These findings led the proponents to propose a web-based order management system aimed at improving transaction efficiency, record accuracy, inventory monitoring, and sales reporting within the bakery’s operations.

Product Backlog

This contains the complete list of the proposed system modules and features that directly respond to the bakery’s identified operational needs. These include user authentication, dashboard, product management, order processing, inventory monitoring, payment recording, sales reporting and proof-of-delivery image capturing.

These modules were selected based on the identified challenges experienced by the bakery in handling transactions, monitoring stock levels, and organizing sales records manually. The user authentication module was included to ensure that only authorized users can access the system and manage bakery operations securely. The dashboard module provides an overview of daily transactions, inventory status, low-stock notifications, and quick access to important system functions. Product management allows the administrator to manage product information, prices, and stock quantities efficiently. The order management module was identified as one of the core features of the system since it directly supports the bakery’s daily transactions. This module enables the recording and processing of customer orders while automatically updating inventory records through REST API integration. The inventory monitoring module helps track stock availability and provides alert notifications whenever products reach the minimum stock limit. The payment recording module was included to ensure that all customer payments are properly documented and reflected in the bakery’s sales records. The proponents also included QR Ph integration to support digital

<!-- PDF page 94 -->

payment processing methods such as GCash. Additionally, the proof-of-delivery image capturing feature was included to allow delivery personnel to upload delivery confirmation photos taken with the phone's camera or chosen from its gallery. Lastly, the sales reporting module was added to generate organized reports and visual summaries of transactions, payments, and inventory movement. This feature will assist the bakery owner in monitoring daily operations and making informed business decisions.

Sprint Planning

In the Sprint Planning process, the backlog items identified were prioritized and grouped into sprints according to project scope. This enables the proponents to decide on the modules to be developed initially, and define the anticipated deliverables of every sprint. The first sprint will be the user authentication module because it is a core feature to ensure secure access and role-based usage for authorized bakery personnel. The dashboard module was added to give an overview of the daily transaction, inventory status and easy access to the important system functions. Lastly, the product management serves as the main data source for products, prices, and stock information.

The inventory monitoring will be included for the second sprint because stock deduction and product availability are directly dependent on processed orders. In addition, the payment recording module was included to ensure that all completed transactions are properly documented and reflected in the daily sales records.

The final sprint will be given to the sales reporting module including the deployment preparation The sales reporting module consolidates data from orders, payments, and inventory movement to generate accurate reports that can assist the bakery owner in monitoring performance and making business decisions

<!-- PDF page 95 -->

The requirements analysis process helped the proponents to discover and justify the operational issues of the client. This will serve as the final basis before proceeding to system documentation and development.

## Requirements Documentation

This section presents the formal documentation of the agreed system requirements between the proponents and the owner of PECTO’S Bakery regarding the development of PECTRACK: A Web-Based Order Management System with Predictive Analytics and Inventory System for Pecto’s Bakery at Lucban Quezon. The requirements documentation serves as the official reference for the design, development, testing, and implementation of the proposed system. It enumerates all software features in detail by providing a storyboard showing how the system would look once it has been fully designed and coded. This shows a complete and prioritized list of all system features and functionalities agreed upon by the client and the developers, and the Sprint Planning, which breaks down these agreed features into structured and time-bound development cycles.

Product Backlog

The Product Backlog contains the complete and prioritized list of all modules, system features, and functionalities agreed upon by the client and the proponents. It serves as the primary reference for all system requirements that will be developed throughout the project. The modules included in the Product Backlog are based on the operational needs identified during the requirements analysis phase. These modules include user authentication, dashboard, product management, order processing, inventory monitoring, payment recording, sales reporting.

Each module is documented according to its purpose, functionality, user accessibility, and expected system output. The user authentication module ensures that only authorized personnel can access the system. The dashboard module

<!-- PDF page 96 -->

provides an overview of daily transactions, inventory status, and system notifications. Product management allows the administrator to manage product information, pricing, and stock quantity.

The order management module enables the recording and management of customer orders, while the inventory monitoring module automatically updates stock levels based on completed transactions. The payment recording module documents payment details and transaction status, including digital payments processed through QR Ph.

The sales reporting module generates organized sales summaries and transaction reports that assist the bakery owner in monitoring business performance. Sprint Planning

The Sprint Planning phase records the way the approved modules and features are to be allocated into sprint cycles to be actually designed and developed. This will make sure that the agreed system requirements are systematically put into place as per the project timeline. According to the requirements approved by the client, the basic modules like user authentication, dashboard, and product management were attributed to the first sprint since they provide a basic framework and data foundation of the system.

According to the requirements approved by the client, the basic modules like user authentication, dashboard, and product management were attributed to the first sprint since they provide a basic framework and data foundation of the system.

The second sprint was assigned to the order management module, inventory control, and recording of the payment as these modules are the direct representatives of the daily operational activities of the bakery in the client interview. They were given priority following the foundational modules since they require the initial product and user data.

<!-- PDF page 97 -->

The last sprint would be sales reporting module, client revisions, and deployment preparation. This will help to make sure that the reports are prepared based on the validated transaction data and that all client requested improvements are implemented before implementation. The requirements documentation formalized the agreed appearance of the system, functions, user roles and module features of the proposed study. Upon agreement with the client, the proponents used the Product Backlog and Sprint Planning phases to make sure that all the requirements approved were well documented and ready to be used in the next design and development phases. According to the requirements approved by the client, the basic modules like user authentication, dashboard, and product management were attributed to the first sprint since they provide a basic framework and data foundation of the system.

## Design of Software, System, Product and /or Processes

<!-- PDF page 98 -->

Figure 30. Use Case Diagram of the Bakery Order Management System

The Use Case Diagram illustrates the interactions between the users and the PECTRACK System. It is classified as a UML Behavioral Diagram specifically under the Use Case Diagram category because it represents the behaviors, functions, and interactions of the users within the system. The diagram identifies the four main roles namely the Admin, Cashier, and Customer, together with their corresponding tasks and system functionalities.

The Customer can register an account, log in, browse products, place orders, track orders, and make payments. The Cashier is responsible for processing customer orders, recording payments, updating order status, and managing customer information. Meanwhile, the Admin manages users, products, inventory, orders, reports, and overall system transactions.

The diagram provides a visual representation of how each role interacts with the PECTRACK System and helps explain the major processes and functionalities of the proposed system.

The system involves three main Roles: Admin, Cashier, and Customer. Each of the four roles has different responsibilities and levels of access within the system.

The Admin can log in to the system and perform administrative tasks such as managing products, approving stock changes and bulk orders, generating reports, assigning deliveries, and managing user accounts, including cashier accounts. Through these functions, the admin ensures that the system operates efficiently and that all necessary information is properly maintained.

The Cashier plays an operational role in handling daily transactions within the bakery. Cashiers can create orders for walk-in customers, update order status,

<!-- PDF page 99 -->

record cash and GCash payments. These actions help ensure that orders are processed accurately and that product availability is properly monitored. The Customer interacts with the system primarily for purchasing bakery products. Customers will register an account first, can browse available products, place orders, track the status of their orders, and view their receipts after completing transactions. They can also cancel orders. These features allow customers to conveniently monitor and manage their purchases through the system. The Use Case Diagram provides a high-level overview of the system's functionality and clearly defines how each user interacts with the Bakery Order Management System. It helps in understanding the scope of the system and the roles and responsibilities of each actor involved in the ordering and management process.

<!-- PDF page 100 -->

Figure 31. Pectrack Logo.

Logo

The Pectrack logo was designed to visually connect with the identity of our client, Pecto’s Bakery in Lucban, Quezon. Since the system is specifically developed for their bakery, we made sure that our logo reflects their brand to maintain consistency and recognition.Pectrack highlights the purpose of the system. The word “TRACK” emphasizes order tracking and management, which is the main function of the web-based order management system. The clean and organized layout of the logo also symbolizes efficiency, accuracy, and digital service. The logo was created to show that Pectrack is not just a separate system, but a digital extension of Pecto’s Bakery. It combines the bakery’s traditional identity with digital technology to represent the goal of improving their operations through a web-based order management system.

<!-- PDF page 101 -->

System Security

Security is a fundamental aspect of PECTRACK to ensure that all data handled within the system, including customer information, order records, payment transactions, and inventory data remains protected from unauthorized access, data breaches, and malicious attacks. The following security measures are implemented across the system:

Authentication and Access Control: PECTRACK implements a role-based access control (RBAC) mechanism that restricts system features based on the user's assigned role: Admin, Cashier, or Customer. Each role is granted access only to the modules and functions relevant to their responsibilities, preventing unauthorized users from accessing sensitive areas of the system.

For the Administrator account, an additional layer of protection is provided through Two-Factor Authentication (2FA). After entering valid credentials, the administrator must confirm a one-time passcode (OTP) sent to their email before gaining access to the admin dashboard. This ensures that even if login credentials are compromised, unauthorized access to administrative functions is prevented.

Session management is also enforced throughout the system. User sessions are assigned a unique session token upon login, which expires after a defined period of inactivity. This prevents unauthorized users from hijacking active sessions and ensures that idle accounts are automatically logged out.

Password Security: All user passwords stored in the PECTRACK database are hashed using the bcrypt algorithm before storage. Bcrypt is a one-way hashing function: it turns each password into a hash that cannot be reversed, so even if the database is compromised, the actual passwords cannot be retrieved. Bcrypt also adds a random salt to every password, so two users with the same password are stored with different hashes. Plain-text passwords are never stored in the system at any point.

<!-- PDF page 102 -->

Additionally, the system enforces password complexity requirements during account registration and password changes. Users are required to create passwords that meet a minimum length and include a combination of uppercase and lowercase letters, numbers, and special characters to reduce the risk of brute-force attacks.

Input Validation and SQL Injection Prevention: PECTRACK uses server-side input validation on all form fields to ensure that data submitted by users conforms to expected formats before being processed or stored. This prevents malformed or malicious data from entering the system.

To protect the database from SQL injection attacks, a common method used by attackers to manipulate database queries through user input, the system uses prepared statements and parameterized queries in all database interactions. This approach separates SQL code from user-supplied data, making it impossible for injected code to alter the intended database query.

HTTPS and Data Encryption in Transit: All data transmitted between the user's browser and the PECTRACK server is encrypted using HTTPS (HyperText Transfer Protocol Secure) with a TLS (Transport Layer Security) certificate. This ensures that sensitive information such as login credentials, payment details, and personal customer data cannot be intercepted or read by third parties during transmission. Any attempt to access the system over an unencrypted HTTP connection is automatically redirected to the secure HTTPS version.

Payment Security: For online payment transactions, PECTRACK integrates with QR Ph, a Payment Card Industry Data Security Standard (PCI-DSS) compliant payment gateway. All payment processing — including GCash transactions — is handled directly by QR Ph secure infrastructure. PECTRACK does not store any raw payment credentials, card numbers, or sensitive financial data on its own servers. Upon transaction completion, QR Ph returns a payment confirmation

<!-- PDF page 103 -->

token that the system uses to verify and record the transaction status.

Data Privacy and Confidentiality: PECTRACK handles personal customer data, including names, contact numbers, addresses, and order histories, in accordance with the principles of the Republic Act 10173, also known as the Data Privacy Act of 2012. Access to customer records is restricted to authorized personnel only. Customers may only view and modify their own profile information and have no access to other users' data. The system does not share customer data with any third-party service beyond what is necessary for payment processing through QR Ph.

Error Handling and Logging: PECTRACK implements controlled error handling to prevent the system from displaying raw error messages, stack traces, or database query details to end users. Exposing such information could provide attackers with insights into the system's internal structure. Instead, user-friendly error messages are displayed, while detailed error logs are recorded on the server side and are accessible only to the system administrator for debugging and monitoring purposes.

System activity logs are also maintained to record significant events such as login attempts, failed authentications, order modifications, and payment transactions. These logs support accountability, allow administrators to detect suspicious behavior, and provide an audit trail for reviewing system activity.

Protection Against Brute-Force Attacks: To prevent automated brute-force login attempts, PECTRACK enforces an account lockout policy. After a defined number of consecutive failed login attempts, the account is temporarily locked and the user is required to wait before attempting again or to request a password reset. This significantly reduces the risk of unauthorized access through repeated password guessing.

<!-- PDF page 104 -->

Database Design

<!-- PDF page 105 -->

Figure 32. Relational Database Diagram

The Relational Database Diagram ensures a structured organization of data supporting the system’s six primary modules: Login, User Management, Order Management, Payment and Billing, Inventory Management, Notifications, and Reporting and Analytics. By implementing normalized tables and clearly defined relationships, the system maintains data integrity, reduces redundancy, and ensures efficient data retrieval for operational and analytical purposes.

USER TABLE

The USER table stores the authentication credentials used to access the system. It contains the login information of all users regardless of role. Each user account is uniquely identified by a UserID and can be associated with one of the system roles such as Admin, Cashier, Customer.

Primary Key

● UserID

Attributes

● UserID(PK) ● Username ● Password ● UserType

Relationships

Referenced by:

● ADMIN ● CASHIER ● CUSTOMER

<!-- PDF page 106 -->

ADMIN TABLE

The ADMIN table stores the profile information of administrative users responsible for managing system operations such as generating reports, monitoring transactions, and supervising system activity.

Primary Key

● AdminID

Foreign Key

● UserID - USER(UserID)

Attributes

● AdminID(PK) ● UserID(FK) ● Name ● ContactNum ● Email

CASHIER TABLE

The CASHIER table contains the information of staff members responsible for processing orders, recording payments, and managing daily transactions within the system.

Primary Key

● CashierID

Foreign Key

<!-- PDF page 107 -->

● UserID - USER(UserID)

Attributes

● CashierID(PK) ● UserID(FK) ● Name ● ContactNum ● Email

CUSTOMER TABLE

The CUSTOMER table stores the profile of each registered customer — name, contact number, and email address — and links it to the customer's login account in the USER table. A customer's delivery addresses are stored separately in the CUSTOMER_ADDRESSES table, so that one customer can save several addresses.

Primary Key

● CustomerID

Foreign Key

● UserID - USER(UserID)

Attributes

● CustomerID(PK) ● UserID(FK) ● Name ● ContactNum ● Email ● Address

<!-- PDF page 108 -->

DELIVERY_PERSONNEL TABLE

The DELIVERY_PERSONNEL table stores information about delivery staff responsible for delivering customer orders.

Primary Key

● DeliveryPersonnelID

Foreign Key

● UserID - USER(UserID)

Attributes

● DeliveryPersonnelID(PK) ● UserID(FK) ● Name ● ContactNum ● Email

ORDER TABLE

The ORDER table records all customer orders placed within the system. It includes order status, order type (pickup or delivery), and the total amount of the transaction.

Primary Key

● OrderID

Foreign Key

● CustomerID - CUSTOMER(CustomerID) ● ProcessedBy - CASHIER(CashierID)

<!-- PDF page 109 -->

Attributes

● OrderID(PK) ● CustomerID(FK) ● ProcessedBy(FK) ● OrderDate ● Status ● OrderType ● Instructions ● Address ● TotalAmount

ORDER_DETAILS TABLE

The ORDER_DETAILS table stores the list of products included in each order. This table resolves the many-to-many relationship between orders and products.

Primary Key

● OrderDetailID

Foreign Key

● OrderID - ORDER(OrderID) ● ProductID - PRODUCT(ProductID)

Attributes

● OrderDetailID(PK) ● OrderID(FK) ● ProductID(FK) ● Quantity

<!-- PDF page 110 -->

● Status.

PRODUCT TABLE

The PRODUCT table contains information about bakery products available for sale such as cakes, bread, and pastries.

Primary Key

● ProductID

Foreign Key

● CategoryID - CATEGORY(CategoryID)

Attributes

● ProductID(PK) ● CategoryID(FK) ● ProductName ● Description ● Price ● Variant ● AvailabilityStatus

CATEGORY TABLE

The CATEGORY table organizes bakery products into groups such as cakes, breads, and pastries to simplify product management.

Primary Key ● CategoryID

<!-- PDF page 111 -->

Attributes

● CategoryID (PK) ● CategoryName

PAYMENT TABLE

The PAYMENT table records all payment transactions made for customer orders. It supports multiple payment methods such as cash for walk-in orders and QR Ph for online transactions like GCash payments.

Primary Key

● PaymentID

Foreign Key

● OrderID - ORDER(OrderID) ● RecordedBy - CASHIER(CashierID)

Attributes

● PaymentID(PK) ● OrderID(FK) ● RecordedBy(FK) ● PaymentMethod ● Amount ● Status ● GatewayReference ● PaymentDate

<!-- PDF page 112 -->

INVENTORY TABLE

The INVENTORY table monitors the stock levels of bakery products. It helps the system track available quantities and determine when restocking is necessary.

Primary Key

● InventoryID

Foreign Key

● ProductID - PRODUCT(ProductID)

Attributes

● InventoryID(PK) ● ProductID(FK) ● StockQuantity ● MinStockLevel ● LastUpdated

STOCK_ALERT TABLE

The STOCK_ALERT table records alerts generated when product inventory falls below the minimum stock level.

Primary Key

● AlertID

Foreign Key

● InventoryID - INVENTORY(InventoryID)

<!-- PDF page 113 -->

Attributes

● AlertID(PK) ● InventoryID(FK) ● AlertMessage ● IsResolved ● CreatedAt

REPORT_LOG TABLE

The REPORT_LOG table records system-generated reports for monitoring sales performance and operational activities.

Primary Key

● ReportID

Foreign Key

● GeneratedBy - ADMIN(AdminID)

Attributes

● ReportID(PK) ● GeneratedBy(FK) ● ReportType ● GeneratedAt

ORDER_STATUS_HISTORY TABLE

The ORDER_STATUS_HISTORY table stores the history of status changes for each order. This allows the system to track updates such as order confirmation, preparation, delivery assignment, and completion.

<!-- PDF page 114 -->

Primary Key ● HistoryID

Foreign Key

● OrderID - ORDER(OrderID) ● UpdatedBy - USER(UserID)

Attributes

● HistoryID(PK) ● OrderID(FK) ● UpdatedBy(FK) ● Status ● UpdatedAt

DATABASE NORMALIZATION

The database design follows the Third Normal Form (3NF) to ensure data integrity and eliminate redundancy.

First Normal Form (1NF)

All tables contain atomic values and each field stores only a single value. Repeating groups have been removed.

Second Normal Form (2NF)

All non-key attributes are fully dependent on the entire primary key.

Third Normal Form (3NF)

All tables eliminate transitive dependencies, ensuring that non-key
