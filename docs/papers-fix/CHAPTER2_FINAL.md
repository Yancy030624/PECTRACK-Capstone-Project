# Chapter 2, final text

**For:** the whole group. Paste this over the entire Review of Related Literature/Studies/Systems, from its heading through the end of the Synthesis.
**Date:** 2026-10-30
**Based on:** the teammate's updated Chapter 2 (Oct 30), with every decision from `CHAPTER_GRILL.md` Rounds 4, 5, 7, 8, 12, and 13 applied.

**What changed from the teammate's version:**
- Removed 7 sources: 6 that could not be found anywhere (Cruz; Lopez; Santos & Villanueva; Taqueban & Villamor; Salazar; Alzoubi & Snider) and Krishnamurthy (weak journal).
- Added the verified local studies (Labastida, Juanatas, Bonto, Dalupang), the foreign studies (Velasquez Jimenez, Sinaga & Johan), and the forecasting-method literature.
- Brought back van der Haar et al. (2024) from the October 29 version.
- Kept Yoo and Park (2025), verified against the full text, and corrected the "56 days of simulated data" error. The assumed history is one year; 56 days is when the forecast switches to actual sales.
- Kept the teammate's Synthesis structure and tone, with the facts corrected, tense changed to present, and the POS paragraph added.
- Changed in-text citations to APA 7 and system years to match the reference list.

**If the adviser declines the per-product accuracy display** (`RULES-PLANS/FORECAST_ACCURACY_PLAN.md`), delete the sentence marked † in the Synthesis.

**References:** use the final list in `CHAPTER_GRILL.md`, Round 8b. Yoo and Park (2025) has been added there.

---

## Review of Related Literature/Studies/Systems

### Related Literature

#### Local Literature

**Predictive Analytics**

*Predictive Analytics for Sales Forecasting and Inventory Management*

Divina et al. (2025) developed a data-driven point-of-sale and inventory system for Pastil sa Tabi that combines sales forecasting with predictive analytics. The study aimed to improve transaction processing, inventory monitoring, and demand prediction by integrating these functions into one system. Its approach demonstrates how historical sales records can help a food business estimate future demand and make better inventory decisions. However, forecasting accuracy depends on the quality of the available records and the sales patterns of the business. This study is relevant to PECTRACK because it is a local example of combining sales forecasting with sales and inventory records in a food business, which PECTRACK does for a bakery.

*Predictive Analytics and Linear Regression for Sales Forecasting*

Lo et al. (2025) developed RELTRACK, a web-based system for inventory, appointments, and sales forecasting for REL Glass and Aluminum Works. The system uses linear regression to analyze sales data and estimate future sales performance. By combining forecasting with inventory monitoring, the system supports decisions based on recorded business transactions rather than relying entirely on manual estimates. However, its business setting differs from a bakery, where products may be perishable and daily demand may change considerably. This study is relevant to PECTRACK because it uses linear regression for sales forecasting within a web-based system, as PECTRACK's multiple linear regression does.

*Sales Forecasting for Inventory Control in Small Businesses*

Orquesta (2026) examined the development of a computerized point-of-sale and inventory system with sales forecasting for micro, small, and medium enterprises in Pagadian City. The system incorporated several forecasting methods, including moving averages, linear regression, weighted moving averages, quadratic regression, and Holt-Winters seasonal smoothing. These methods can help businesses examine historical sales patterns and estimate future demand. However, the most suitable method depends on the availability of historical records and the characteristics of the products being sold. This study is relevant to PECTRACK because it compares several forecasting methods, including Holt-Winters seasonal smoothing and linear regression, which PECTRACK compares for each product before choosing one.

*Predictive Analytics in E-Commerce and Market Demand Estimation*

Culili (2026) developed an e-commerce platform for the Department of Agrarian Reform Region 02's Agrarian Reform Beneficiary Organizations, incorporating predictive analytics for sales forecasting and market demand estimation. The study addressed challenges involving sales tracking, inventory management, and market reach. Its findings highlight how integrating online transactions with predictive analytics can support planning and data-driven decision-making. However, agricultural enterprises have different operational needs from a bakery that produces and sells fresh products daily. This study is relevant to PECTRACK because it demonstrates how predictive analytics can work alongside online ordering and inventory records to help a business anticipate demand.

*Predictive Sales Analytics and Inventory Decision-Making*

Custodio et al. (2026) presented a predictive sales and inventory system that uses linear regression for sales forecasting and K-means clustering for customer segmentation. The system combines sales transactions, inventory monitoring, and customer information to support business decisions. However, its customer segmentation feature may not be necessary for every small business, and the usefulness of its predictions depends on the quality of the data collected. This study is relevant to PECTRACK because it applies linear regression to product-level sales, as PECTRACK does for each of the bakery's products.

#### Foreign Literature

**Predictive Analytics**

*Integrating Demand Forecasting with Inventory Control*

van der Haar et al. (2024) investigated how supervised learning can connect forecasting with inventory control. Rather than treating demand prediction and inventory decisions as completely separate activities, their approach directly estimates inventory-related decisions using available data. The study also considered situations involving perishable goods and lost sales. However, its methods may require sufficient historical data and careful adjustment to a business's operating conditions. This study is relevant to PECTRACK because bakery products have limited shelf lives, so expected demand must inform how much is produced, which PECTRACK's forecast check does beside the Production list.

*Machine Learning for Retail Sales Forecasting*

Pattnaik et al. (2025) examined artificial intelligence and machine learning approaches for forecasting sales using data from Big Bazaar. Their research compared different predictive models and grouped products into categories, including fresh and perishable foods, packaged foods, and household items. The study highlights the importance of evaluating different models to determine which provides more accurate forecasts for particular product categories. However, a large retail chain may have more extensive transaction records and resources than a small bakery. This study is relevant to PECTRACK because it supports evaluating models for each product category, as PECTRACK selects the most accurate method for each product.

*Automated Machine Learning for Retail Forecasting*

Kristian and Suri (2025) compared traditional machine learning models with automated machine learning approaches using transaction data from an Indonesian traditional store. The study evaluated forecasting performance using several error measurements and found that model performance varied depending on the method and characteristics of the data. However, automated tools may still require data preparation and model evaluation to produce reliable results. This study is relevant to PECTRACK because it shows that accuracy depends on the method and the data, which is why PECTRACK tests every method before using one.

*Predictive Analytics for Sales Forecasting and Inventory Optimization*

Mansur et al. (2025) investigated a hybrid neural-network approach for retail sales forecasting. Their model combined convolutional neural networks and long short-term memory networks while considering factors such as holidays, salary days, protests, and weather conditions. The study reported improved forecasting performance by considering both historical sales and relevant external factors. However, a complex neural-network model may not be necessary for a small bakery if simpler methods can produce sufficiently accurate predictions. This research is relevant to PECTRACK because it shows that holidays and salary days affect sales, the same factors PECTRACK's regression uses, together with the day of the week and bakery events.

**Forecasting Methods, Evaluation, and Data Requirements**

*Principles of Forecasting Methods*

Hyndman and Athanasopoulos (2021), in their textbook *Forecasting: Principles and Practice*, define the seasonal naïve method, Holt-Winters exponential smoothing, and regression with calendar variables, together with time-series cross-validation and error measures such as the mean absolute error. The textbook is widely used as a standard reference in forecasting. However, it presents general methods that must still be tested on the data of each business. This literature is relevant to PECTRACK because it is the basis of the three forecasting methods the system compares and of the way the system tests them.

*Minimum Data for Seasonal Forecasting Models*

Hyndman and Kostenko (2007) examined how much data seasonal forecasting models require. They explained that a model must always have more observations than parameters; with a weekly season of seven days, a regression with seasonal variables needs at least nine observations and Holt-Winters at least twelve. However, these minimums hold only for data with very little random variation, and real sales data usually need more. This literature is relevant to PECTRACK because it shows that the system's 56 days of actual sales are well above the theoretical minimum, while also explaining why the system measures the forecast's accuracy instead of relying on a number of days alone.

*Data Length and Accuracy in Short-Term Demand Forecasting*

Yoo and Park (2025) examined how the length of historical data affects the accuracy of daily demand forecasting at a large-scale catering service. They compared data lengths of 28, 56, 84, 182, 365, and 730 days using Holt-Winters exponential smoothing and a Hidden Markov Model. Across the two- and three-week forecast horizons, the 84-day data length produced lower average errors than the 56-day length for both models, and the authors proposed three months as the optimal data length for their data. The results also showed that a longer history does not always produce a better forecast. However, the authors noted that their findings are specific to the data they analyzed, and they measured error as a percentage of actual sales, a measure that cannot be computed on days with no sales. This study is relevant to PECTRACK because it directly compares 56 days with longer histories: PECTRACK switches to actual sales at 56 days, the earliest point at which its accuracy can be measured, and continues to learn from each additional day afterward, which the study suggests can improve accuracy.

*Evaluating Forecasting Models in Time Order*

Cerqueira, Torgo, and Mozetič (2020) compared methods for estimating forecast accuracy on 174 real-world time series. For real and non-stationary data, the most accurate estimates came from methods that preserve the time order of the data, especially holdout testing repeated over several periods. However, such testing requires enough history to set aside several test periods. This study is relevant to PECTRACK because the system's rolling four-week backtest tests each method on four separate weeks that come after the data it learned from.

*Best Practices in Forecast Evaluation*

Hewamalage, Ackermann, and Bergmeir (2023) reviewed common pitfalls in evaluating forecasts. They recommended rolling-origin testing, which preserves the time order of the data, warned that percentage errors break down when sales are very small, and stressed that every method must be compared against simple benchmarks. However, their guidelines are general and must be applied to each business's data. This study is relevant to PECTRACK because the system compares its methods against the seasonal naïve benchmark and reports the mean absolute error, which remains valid on days with low sales.

*Retail Forecasting Research and Practice*

Fildes, Ma, and Kolassa (2022) reviewed forecasting research and practice in retail, from strategic decisions down to forecasts for individual products, including the effects of calendar events, promotions, and new products. However, much of the reviewed work comes from large retailers with extensive data. This literature is relevant to PECTRACK because it shows that daily, product-level forecasting with calendar effects is an established practice in retail.

*Daily Retail Sales Forecasting Competition*

Makridakis, Spiliotis, and Assimakopoulos (2022) reported the results of the M5 competition, which forecast the daily unit sales of 42,840 Walmart product series and compared every method against benchmarks on the same data. However, the competition used far more data than a small bakery has. This study is relevant to PECTRACK because it supports comparing several methods on the same sales data before choosing one, which the system does for each product.

*Statistical and Machine Learning Methods for Daily Demand*

Spiliotis, Makridakis, Semenoglou, and Assimakopoulos (2022) compared statistical and machine learning methods for forecasting the daily demand of individual products. Some machine learning methods were more accurate, but not all of them, and not in every case. However, their results depend on the characteristics of the data used. This study is relevant to PECTRACK because the system does not assume that its regression model is always the most accurate, and instead selects the best method for each product.

**Forecasting in Bakeries**

*Daily Demand Forecasting at a Bakery Chain*

Huber and Stuckenschmidt (2020) forecast the daily demand of the stores of a bakery chain. Machine learning methods outperformed established forecasting methods, and special calendar days such as holidays needed separate treatment. However, the study used the data of a chain with many stores. This study is relevant to PECTRACK because it is the closest match to the system: a bakery, daily demand, and calendar effects, which the system's regression includes as variables for holidays and bakery events.

*Demand Forecasting Against Food Waste in Bakeries*

Hübner, Caspers, Coroamă, and Finkbeiner (2024) studied a machine learning sales forecasting service used by bakeries. Its use was associated with an average 30% reduction in returned unsold bread and rolls in 2022, and its environmental benefits outweighed its own impacts. However, the results came from bakeries that already had sales records. This study is relevant to PECTRACK because it shows how forecasting can help a bakery plan its production and reduce unsold products.

*Using Sales Forecasts in a Bakery*

Fries and Ludwig (2024) conducted a design case study of machine learning sales forecasting in a bakery. Setting up the data and processes was a major challenge, the measured quality of the forecasts did not always match how the staff perceived them, and the staff's trust in the algorithm was the most important factor in its use. However, the study examined one bakery. This study is relevant to PECTRACK because the system presents the forecast as a check beside the bakery's own production rules, so the staff remain in control of what to bake.

**Learning from Generated Data**

*Generated Time Series for Limited Data*

Bandara, Hewamalage, Liu, Kang, and Bergmeir (2021) showed that when real data are scarce, generating synthetic time series and training forecasting models on them improved forecasting accuracy on competition and real-world datasets. However, generated data must reflect the patterns of the real data. This study is relevant to PECTRACK because it supports the adviser-approved approach of demonstrating the forecast on an assumed sales history built from the patterns described by the bakery.

### Related Studies

#### Local Studies

*Web-Based Ordering System with Forecasting for a Start-Up Business*

Labastida et al. (2024) developed a web-based ordering system for a start-up business in the Philippines that integrated online ordering, inventory management, and demand forecasting in one platform. The study demonstrated how combining these functions can support the operations of a small business. However, it was designed for a start-up with limited sales history rather than an established bakery with daily production. This study is relevant to PECTRACK because it combines online ordering, inventory, and forecasting in a single web-based system, as PECTRACK does.

*Web and Mobile-Based Ordering and Inventory System with Sales Analytics*

Juanatas and Juanatas (2024) developed a web and mobile-based ordering and inventory system with sales analytics that addressed order management, inventory management, and customer engagement. The system allowed customers to browse and order products, allowed authorized personnel to handle inventory transactions, and provided the owner with a sales analytics module that used a simple moving average to reveal trends and patterns in sales data. The technical and non-technical evaluation produced an overall rating of 4.55, indicating strong agreement and high customer satisfaction. However, the study did not specify a food business setting or a payment recording feature, and its analytics were limited to describing past trends. This study is relevant to PECTRACK because it combines customer ordering, inventory control, and sales trend analysis in a single system, which parallels PECTRACK's integration of online and walk-in ordering, automated inventory, and sales forecasting.

*Sentimart*

Bonto et al. (2025) developed Sentimart, a web-based ordering, inventory, and feedback system for RTEA Shop, a specialty tea retailer. The study applied a long short-term memory (LSTM)-based sentiment analysis to customer feedback to forecast inventory and recommend which products to purchase. The ISO 25010 evaluation by technical specialists and end customers showed that the system was highly functional, reliable, user-friendly, and efficient, although portability received a comparatively lower rating. However, its forecasting was driven by customer sentiment rather than by recorded sales, and the study did not report a payment recording feature. This study is relevant to PECTRACK because both are web-based ordering and inventory systems for a Philippine food and beverage business with a predictive component that guides stock decisions, while PECTRACK bases its forecast on recorded sales and links it to daily production planning.

*TrackPOS-IN*

Dalupang (2026) developed TrackPOS-IN, a web-and-mobile point-of-sale and inventory platform for micro food enterprises that combine a fixed stall with mobile selling units. Piloted with Kuya Siomai in Isabela, the system replaced handwritten sales logs and informal messaging with an offline-capable Android point-of-sale, centralized inventory with adjustment logs and low-stock alerts, consolidated dashboards, and GPS monitoring of mobile sellers. All seven functional test cases passed, and user acceptance measured with ISO/IEC 25010 quality characteristics reached a grand mean of 4.68. However, the study was limited to a single pilot, did not provide online customer ordering, and identified cashless payment support as future work. This study is relevant to PECTRACK because both systems address manual sales and stock recording in a Philippine food business through centralized inventory and low-stock alerts, while PECTRACK adds an online storefront, GCash payment confirmation, production planning, and sales forecasting.

#### Foreign Studies

*Order Management Software for Small and Medium-Sized Enterprises*

Velasquez Jimenez et al. (2024) examined the design and evaluation of order management software for small and medium-sized enterprises (SMEs) in Lima, Peru. Their study involved 308 employees and reported positive evaluations of the system's usability and perceived operational efficiency. However, the evaluation measured the employees' perceptions rather than changes in order errors or processing time. This study is relevant to PECTRACK because it supports the use of a centralized order management system in small businesses.

*Web-Based Order Management for Multiple Sales Channels*

Sinaga and Johan (2024) designed a web-based Order Management System to help a company consolidate the transactions it received through multiple online marketplaces. However, the system focused on online marketplace orders and did not cover walk-in transactions. This study is relevant to PECTRACK because the system also brings orders from different channels, the online storefront and the counter, into one order list.

### Related Systems

#### Local Systems

*Foodpanda (2023)*

In the Philippines, digital platforms such as Foodpanda are widely used to enhance business operations through automation and online services. Foodpanda operates as an online food delivery platform that connects customers, partner merchants, and delivery riders through a centralized system. It utilizes a platform-based architecture supported by client-server architecture and cloud infrastructure, allowing users to access services via mobile applications or web interfaces. The system also applies concepts from e-commerce systems and service-oriented architecture (SOA), where services such as ordering, payment processing, and delivery tracking function as interconnected components. While Foodpanda provides convenience and faster transactions, it acts as a third-party intermediary, limiting business control over pricing, operations, and customer data.

*GrabFood (2023)*

GrabFood, another widely used platform in the Philippines, functions similarly as an online food delivery system. It follows a platform ecosystem model where multiple stakeholders, namely customers, merchants, and delivery personnel, interact within a unified system. GrabFood employs a cloud-based client-server architecture and integrates real-time processing to manage orders, payments, and delivery tracking efficiently. It also applies principles of distributed systems, ensuring scalability and reliability across high-demand usage. However, like Foodpanda, GrabFood operates as a third-party platform, which restricts direct control of businesses over their operations, customer relationships, and data management.

*Jollibee Delivery System (2024)*

Jollibee Foods Corporation uses a web-based and mobile-based order processing system that follows client-server architecture and e-commerce system architecture. It allows customers to place orders, process payments, and track deliveries in real time. The system uses centralized order management and transaction processing principles. However, it is designed for large-scale fast-food operations. PECTRACK adopts similar ordering concepts but is customized for bakery operations.

*Red Ribbon Online Ordering System (2024)*

Red Ribbon Bakeshop implements an online ordering platform that uses cloud-based architecture and integrated transaction systems. It allows customers to browse bakery products, place orders, and process payments online. This system is related to PECTRACK because both focus on improving bakery ordering transactions and making order processing more convenient and organized. Similarly, PECTRACK aims to streamline order management, monitor product availability, and help ensure accurate and efficient order fulfillment at Pecto's Bakery.

*Goldilocks Online Delivery System (2024)*

Goldilocks Bakeshop operates a digital ordering platform supported by cloud computing and service-oriented architecture (SOA). It integrates order processing, billing, and customer order history in one system. However, it focuses mainly on large-scale bakery operations. PECTRACK adopts similar concepts while focusing specifically on small-scale bakery operations.

#### Foreign Systems

*Shopify (2023)*

Shopify is a widely used e-commerce platform that enables businesses to create and manage online stores. It operates using cloud computing and follows e-commerce architecture, integrating content management system (CMS) principles to manage products, orders, and customer data. Shopify also uses scalable infrastructure and database systems to support high volumes of transactions. Although it enhances online presence and accessibility, it is not specifically designed for food service operations and lacks specialized features for managing bakery production workflows.

*Square for Restaurants (2023)*

Square for Restaurants is another foreign system designed for food service businesses. It utilizes cloud computing and a software-as-a-service (SaaS) architecture to deliver services through web and mobile interfaces. The system follows a service-oriented architecture (SOA), where functionalities such as billing, order tracking, and reporting are handled by separate but integrated services. It also incorporates secure payment processing technologies and database systems to manage financial transactions and customer data. While it provides a comprehensive solution, its features and infrastructure may be too extensive for small businesses with simpler operational needs.

*StoreHub POS (2023)*

StoreHub POS is a cloud-based point-of-sale system commonly used by small and medium enterprises. It follows a cloud-based client-server architecture, where data is stored and processed on remote servers and accessed through internet-enabled devices such as tablets or computers. The system integrates multiple modules, including sales tracking, inventory management, and reporting, aligning with the concept of an integrated information system. It also utilizes database management system (DBMS) principles to ensure centralized and accurate data storage. While StoreHub improves efficiency and supports decision-making, it is designed for general retail operations and may include features that are not specifically tailored to bakery businesses.

*Toast (2023)*

Toast POS is a restaurant-focused digital system that demonstrates the use of advanced integrated platforms in business operations. It operates on a cloud-based architecture using a software-as-a-service (SaaS) model, allowing businesses to access the system through subscription-based services. Toast follows a modular architecture, where different components such as order processing, payment handling, and inventory management are combined into a unified platform. It also uses relational database management systems (RDBMS) to manage large volumes of transactional data and implements real-time processing to monitor operations instantly. Despite its efficiency, the system can be complex and may require advanced setup, making it less suitable for small-scale businesses.

*Domino's Pizza Online Ordering System (2024)*

Domino's Pizza operates one of the most advanced food ordering systems globally, integrating web-based ordering, mobile ordering, and real-time delivery tracking into one platform. The system follows e-commerce architecture combined with real-time processing systems, allowing customers to place orders, customize products, and monitor order preparation and delivery status instantly. It also applies database management system (DBMS) principles to store customer data, order history, and payment transactions. One of its strengths is its ability to provide real-time visibility in the order lifecycle, improving customer trust and satisfaction. However, its advanced infrastructure and enterprise-level resources may not be suitable for small bakery operations. This system is relevant to PECTRACK because it demonstrates how digital ordering and order tracking improve customer experience, which is one of the main objectives of the proposed study.

*Uber Eats Merchant System (2024)*

Uber Eats provides merchants with a digital food-ordering system that connects customers, restaurants, and delivery personnel through a centralized cloud-based platform. It follows a platform ecosystem architecture, where different users interact within one system environment. It also applies distributed systems theory, allowing the system to handle multiple simultaneous orders and deliveries efficiently across different locations. The system integrates real-time order processing, payment validation, and delivery tracking to improve customer convenience. Its advantage is its scalability and ability to manage high transaction volumes. However, because it acts as a third-party intermediary, businesses have limited control over customer data and pricing. This system is related to PECTRACK because it demonstrates effective order and delivery coordination, while PECTRACK offers direct control over business data and operations.

### Synthesis

The reviewed literature and studies identify two complementary applications of digital systems in business operations: organizing transaction records and using those records to support planning. The local literature of Divina et al. (2025), Lo et al. (2025), Orquesta (2026), Culili (2026), and Custodio et al. (2026) illustrates how sales recording, inventory monitoring, and predictive analytics can be integrated into business platforms. Although these works address different industries, they provide examples of connecting operational information with forecasting functions. Taken together, they suggest that the value of predictive analytics depends partly on the availability of organized and relevant transaction records. For PECTRACK, this relationship supports integrating order management and inventory monitoring with a forecasting component within a centralized platform.

Foreign literature further demonstrates that forecasting requires methods suited to the available data and the intended business application. van der Haar et al. (2024), Pattnaik et al. (2025), Kristian and Suri (2025), and Mansur et al. (2025) discuss different approaches to demand estimation, including supervised learning tied to inventory decisions, model comparison across product categories, automated machine learning, and hybrid neural networks. These approaches offer possible ways to analyze sales patterns, but their reported performance should be interpreted within their respective datasets and evaluation conditions. Their relevance to PECTRACK lies in the importance of selecting and assessing an appropriate forecasting method, rather than assuming that a more complex model will necessarily produce better predictions for a small bakery.

The reviewed forecasting literature also guided the design of PECTRACK's forecast. Following Hewamalage et al. (2023), every method is compared against a simple benchmark, the seasonal naïve method, which expects the same sales as on the same day of the previous week. Holt-Winters exponential smoothing and multiple linear regression with variables for the day of the week, payday, holidays, and bakery events were chosen because they are standard methods for seasonal daily data (Hyndman & Athanasopoulos, 2021), because similar methods appear in comparable local systems (Lo et al., 2025; Orquesta, 2026), and because calendar factors strongly affect demand (Huber & Stuckenschmidt, 2020; Mansur et al., 2025). Since no single method is always the most accurate (Kristian & Suri, 2025; Makridakis et al., 2022; Spiliotis et al., 2022), the system compares the three methods for each product through a rolling four-week backtest, which tests them in time order on weeks they have not seen (Cerqueira et al., 2020), and measures their error with the mean absolute error, which remains valid on days with no sales.

Historical data length is another consideration in forecasting design. Fifty-six days of actual sales, which provide 28 days of learning followed by four test weeks, are well above the theoretical minimum for weekly seasonal models (Hyndman & Kostenko, 2007), but a number of days alone does not guarantee accuracy. Yoo and Park (2025) compared several historical windows for daily catering demand and found that 84 days produced lower average errors than 56 days for both Holt-Winters exponential smoothing and Hidden Markov models. This finding informs PECTRACK's treatment of 56 days as the earliest point at which the forecast's accuracy can be measured, not as a guarantee that its forecasts will be reliable. After the switch to actual sales, the system continues to learn from every additional day. † Each product's measured error is shown beside that of the seasonal naïve benchmark, so the bakery can see whether the forecast improves as its sales history grows (Fries & Ludwig, 2024).

The reviewed local studies show the value of bringing a food business's orders, stock, and sales into one digital system. Labastida et al. (2024) integrated online ordering, inventory management, and demand forecasting for a start-up business; Juanatas and Juanatas (2024) combined customer ordering, inventory control, and sales analytics; Bonto et al. (2025) added a predictive component to a web-based ordering and inventory system for a tea shop; and Dalupang (2026) replaced handwritten sales logs at a food stall with centralized inventory and low-stock alerts. The foreign studies of Velasquez Jimenez et al. (2024) and Sinaga and Johan (2024) further support the use of order management systems to centralize orders received through different channels and to improve operational efficiency. However, none of these studies combines scheduled pickup and delivery, payment confirmation, production planning based on a bakery's stocking rules, and a forecast tested against a simple benchmark, which PECTRACK provides.

The reviewed existing systems provide additional references for designing ordering and transaction workflows. Platforms such as Foodpanda, GrabFood, Jollibee Delivery, Red Ribbon, and Goldilocks illustrate digital ordering in food-service settings. Shopify, Square for Restaurants, StoreHub POS, Toast, Domino's, and Uber Eats also provide examples of functions relevant to online selling, transaction management, reporting, or order coordination. These systems offer useful design references, but their suitability for Pecto's Bakery depends on how their documented capabilities align with the bakery's requirements. Their inclusion therefore informs PECTRACK's feature design without establishing that existing commercial solutions are inherently unsuitable for small businesses.

Several of the reviewed systems are point-of-sale (POS) systems, such as StoreHub POS, Square for Restaurants, and Toast, together with the studies of Divina et al. (2025) and Dalupang (2026). These systems record each sale at the counter as it happens and keep the stock and sales records that follow from it. PECTRACK is not a POS system. It manages each order from placement to completion across the online storefront and the counter, including orders scheduled for a later date, pickup and delivery, the staff's confirmation of GCash payments, production planning based on the bakery's stocking rules, and sales forecasting. Its Walk-in tab records counter sales because walk-in customers make up most of the bakery's daily sales (Appendix B, 09:59); without recording them, the stock counts and the sales history behind the forecast would be incomplete. The system also does not provide the hardware or compliance functions of a POS, such as a barcode scanner, a cash drawer, receipt printer integration, or BIR-registered official receipts.

Within this context, PECTRACK addresses an operational need specific to Pecto's Bakery, where orders were received through Facebook messages and walk-in transactions and records were maintained manually. Its contribution is the integration of customer records, order processing, inventory monitoring and production planning, payment recording, delivery status updates, and reporting within a web-based system organized around the bakery's identified workflow. The forecasting component extends this integration by demonstrating how recorded product sales can be analyzed to generate short-term demand estimates. The study's contribution therefore centers on the implementation and evaluation of these connected functions in the bakery's context.

Since actual historical sales records were unavailable for the study, PECTRACK demonstrates its predictive analytics on an assumed one-year history of daily sales, generated from the patterns described by the bakery and approved by the adviser, following the practice of developing forecasting models on generated series when real data are scarce (Bandara et al., 2021). Any forecasting results or accuracy measurements on this history describe performance under the assumed conditions and do not establish the system's ability to predict the bakery's actual demand. The forecast switches to the bakery's actual sales once 56 days are recorded, and validation using those operational records is necessary before the forecasts are relied upon for production or inventory decisions. Within these boundaries, the study shows how a centralized order management system can incorporate forecasting functionality while clearly distinguishing demonstrated system capabilities from outcomes that require real-world validation.
