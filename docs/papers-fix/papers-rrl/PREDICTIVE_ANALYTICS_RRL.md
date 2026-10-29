# Predictive Analytics: Review of Related Literature

This file supports the panel's major revision on predictive analytics (mock defense, 2026-10-26). The panel said the paper lacks studies on predictive analytics, and asked how we can be sure the forecast is reliable once it switches to real sales after 56 days.

It has four parts:
1. **The studies:** what each found, and how it supports PECTRACK.
2. **RRL paragraphs** ready to adapt into Chapter 2.
3. **The answer to "why 56 days?"**, grounded in the literature, with a proposed change to discuss with the adviser.
4. **The reference list** (APA 7th edition).

Every source was checked against its journal, publisher or repository page on 2026-10-27. All are from 2020–2024 except Hyndman and Kostenko (2007), a short, widely cited paper on exactly the panel's question. Keep it as a foundational source, or drop it if the panel requires 2020–2024 only.

---

## 1. The studies

### A. How much history a forecast needs

| Study | What it found | How it supports PECTRACK |
|---|---|---|
| **Hyndman & Kostenko (2007)**, "Minimum sample size requirements for seasonal forecasting models," *Foresight* | There must always be more observations than parameters. With *m* seasons, a regression with seasonal dummies needs at least *m* + 2 observations, and Holt-Winters at least *m* + 5. These minimums hold only when the data has very little random variation: "Real data often contain a lot of random variation, and sample size requirements increase accordingly." | Our season is the week (*m* = 7). The theoretical minimums are 9 days for the regression and 12 days for Holt-Winters. PECTRACK waits for **56 days**, several times those minimums. The study also explains why a day count alone cannot **guarantee** reliability: the amount of randomness decides, so accuracy has to be **measured**. See part 3. |
| **Hyndman & Athanasopoulos (2021)**, *Forecasting: Principles and Practice* (3rd ed.) | The standard open textbook. It defines the seasonal-naïve method, Holt-Winters exponential smoothing, regression with calendar dummy variables, time-series cross-validation (rolling origin), and error measures such as MAE. | The source for each of PECTRACK's three methods and for its rolling backtest. |

### B. How to test a forecast and pick a method

| Study | What it found | How it supports PECTRACK |
|---|---|---|
| **Cerqueira, Torgo & Mozetič (2020)**, *Machine Learning* | Compared ways of estimating forecast accuracy on 174 real-world series. For real, non-stationary data, the most accurate estimates came from out-of-sample methods that **preserve time order**, especially holdout **repeated over several test periods**. | PECTRACK's backtest is exactly that: it pretends it is four weeks ago, forecasts each following week, and compares with what actually sold, four times. This study is the evidence that this is the right way to measure accuracy. |
| **Hewamalage, Ackermann & Bergmeir (2023)**, *Data Mining and Knowledge Discovery* | Best practices for forecast evaluation. Rolling-origin (time-series cross-validation) "preserves the temporal order". MAPE breaks on series with very small values. "Comparison against the right benchmarks and especially the simpler ones is essential," and seasonal series "should accordingly be benchmarked against the seasonal naïve model." | Supports three of our choices: the rolling backtest, **MAE and WAPE instead of MAPE** (a bread can sell 0 on a day), and **seasonal-naïve as the baseline** every other method must beat. |
| **Petropoulos et al. (2022)**, "Forecasting: theory and practice," *International Journal of Forecasting* | A 167-page review by leading forecasting researchers, covering how to prepare data, produce forecasts, evaluate them, and apply them in practice, including retail. | An authoritative overview to anchor the RRL section. |

### C. Retail and food demand forecasting

| Study | What it found | How it supports PECTRACK |
|---|---|---|
| **Fildes, Ma & Kolassa (2022)**, "Retail forecasting: Research and practice," *International Journal of Forecasting* | A review of forecasting in retail, from strategic to product-level decisions, including calendar effects, promotions and new products, and how companies forecast in practice. | Shows that product-level daily forecasting, the level PECTRACK works at, is a recognised research area with established methods. |
| **Makridakis, Spiliotis & Assimakopoulos (2022)**, "M5 accuracy competition," *International Journal of Forecasting* | A worldwide competition forecasting **daily unit sales** of 42,840 Walmart product series. Methods were compared against benchmarks on the same data. | The largest test of daily retail sales forecasting. It supports comparing several methods on the same data, which PECTRACK does for each product. |
| **Spiliotis, Makridakis, Semenoglou & Assimakopoulos (2022)**, *Operational Research* | Compared statistical and machine-learning methods for **daily** product (SKU) demand. Some machine-learning methods were more accurate, but not all, and not always. | Supports **not** assuming machine learning always wins. PECTRACK lets the backtest choose, for each product, between the regression and the simpler methods. |
| **Huber & Stuckenschmidt (2020)**, *International Journal of Forecasting* | Forecast daily store-level demand at a **bakery chain**. Machine learning outperformed established methods, and **special calendar days** (holidays) need separate treatment. | The closest match to PECTRACK: a bakery, daily demand, and calendar effects. It supports the regression's holiday and event variables. |

### D. Forecasting in bakeries in practice

| Study | What it found | How it supports PECTRACK |
|---|---|---|
| **Hübner, Caspers, Coroamă & Finkbeiner (2024)**, *Journal of Industrial Ecology* | A machine-learning sales forecasting service for bakeries was associated with an average **30% reduction in returned (unsold) bread and rolls** in 2022. Its environmental benefits outweighed its own impacts by one to three orders of magnitude. | Evidence that forecasting helps bakeries specifically, by reducing unsold bread. That is the problem PECTRACK's forecast check addresses. |
| **Fries & Ludwig (2024)**, *Computer Supported Cooperative Work* | A design case study of machine-learning sales forecasting **at a bakery**. Setting up the data and processes was a major challenge; the forecast's measured quality did not always match how staff perceived it; and **trust in the algorithm** was the most important factor in whether staff used it. | Supports two PECTRACK design choices: showing the **measured accuracy** honestly (the "Practice data (assumed)" label and the method-test figure), and keeping the bakery's own **rules in charge** while the forecast only warns ("+N more"). |
| **Labastida et al. (2024)**, *World Journal of Advanced Research and Reviews* | A web-based ordering system with demand forecasting, built for a start-up business in the Philippines. | A local study combining ordering and forecasting in one web system, as PECTRACK does. |

### E. Learning from generated (assumed) data

| Study | What it found | How it supports PECTRACK |
|---|---|---|
| **Bandara, Hewamalage, Liu, Kang & Bergmeir (2021)**, *Pattern Recognition* | When real data is scarce, generating **synthetic time series** and training on them improved forecasting accuracy on competition and real-world datasets. | Supports the adviser-approved approach of demonstrating the forecast on assumed (generated) history until real sales exist. It also shows synthetic data is a recognised technique, not a shortcut. |

---

## 2. RRL paragraphs to adapt into Chapter 2

Adjust the wording to the paper's voice; the facts and citations are checked.

> **Predictive analytics in retail and food businesses.** Forecasting product demand at the daily level is a well-established area of retail research (Fildes et al., 2022; Petropoulos et al., 2022). The M5 competition, which forecast the daily unit sales of more than 42,000 product series, showed that methods must be compared on the same data before one is chosen (Makridakis et al., 2022). Studies comparing statistical and machine-learning methods for daily product demand found that machine learning can be more accurate, but not in every case (Spiliotis et al., 2022). In bakeries specifically, machine-learning forecasts of daily store demand outperformed established methods, especially when holidays and other special days were treated separately (Huber & Stuckenschmidt, 2020). Forecasting has also been associated with an average 30% reduction in unsold bread returned by bakeries (Hübner et al., 2024).

> **Evaluating a forecast.** A forecast is only as useful as the evidence of its accuracy. For real-world sales data, the most accurate estimates of a forecast's performance come from testing it on several periods in time order, never on shuffled data (Cerqueira et al., 2020). Best practice also requires comparing every method against a simple benchmark, such as the seasonal-naïve method for seasonal data, and choosing error measures that remain valid when sales are zero (Hewamalage et al., 2023; Hyndman & Athanasopoulos, 2021).

> **How much data is enough.** The minimum history a forecasting method needs depends on how many parameters it estimates and on how much random variation the data contains (Hyndman & Kostenko, 2007). Theoretical minimums exist, for example the number of seasons plus two observations for a regression with seasonal variables, but they apply only to data with very little randomness; real sales data usually need more. When real history is scarce, models can be developed and demonstrated on generated (synthetic) series, an approach shown to improve forecasting accuracy when data is limited (Bandara et al., 2021).

> **Forecasting in practice.** A design case study of machine-learning sales forecasting in a bakery found that staff trust in the algorithm was the most important factor in its use, and that measured accuracy did not always match how staff perceived the forecasts (Fries & Ludwig, 2024). In the Philippines, a web-based ordering system for a start-up business integrated demand forecasting into its ordering process (Labastida et al., 2024).

---

## 3. "How can you be sure it is reliable after 56 days?"

### What the literature says
1. **There is a minimum, and 56 days is well above it.** With a weekly season, the theoretical minimum is 9 days for a regression with weekday variables and 12 days for Holt-Winters (Hyndman & Kostenko, 2007). PECTRACK's regression has 12 variables, so it needs at least 13 days; the code waits for 21 usable days before using it at all.
2. **56 days is what the testing needs.** In the code, 56 = 28 days of learning + 4 test weeks × 7 days (`MIN_TRAIN_DAYS + BACKTEST_FOLDS * SEASON` in `server/lib/forecasting.js`). The backtest checks four separate weeks, and the first check must have four weeks of history before it to learn from. It is the minimum for **measuring** accuracy (Cerqueira et al., 2020); with less, the system uses the simple baseline and claims no accuracy at all.
3. **No day count can guarantee accuracy.** The minimums assume data with little randomness, and real bakery sales are noisy (Hyndman & Kostenko, 2007). Reliability has to be **shown by measured error**, compared with a simple benchmark (Hewamalage et al., 2023).

### The honest answer for the panel
> "Fifty-six days is not a guarantee of accuracy, and no number of days can be — the literature says the data needed depends on how random the sales are (Hyndman & Kostenko, 2007). Fifty-six days is the minimum that lets the system **measure** its own accuracy on four separate weeks, the method the literature recommends for real sales data (Cerqueira et al., 2020). That measured accuracy is what tells the bakery whether to trust the forecast."

### A change to propose to the adviser
Today the switch to real sales depends **only on the day count**. The literature supports making it depend on **measured accuracy**:

- Keep 56 days as the **earliest** the system may switch.
- Switch a product to real sales only when its backtest on real sales **beats the seasonal-naïve benchmark**, meaning its error is lower than "same day last week" (Hewamalage et al., 2023).
- Show the measured accuracy for each product on the Forecast tab, so the bakery sees how reliable each forecast is (Fries & Ludwig, 2024).

This turns "trust us after 56 days" into "the system switches when it has **proven** it beats the simplest method". It is a design decision for the adviser and the group; nothing has been changed in the system yet.

---

## 4. References (APA 7th edition)

Bandara, K., Hewamalage, H., Liu, Y.-H., Kang, Y., & Bergmeir, C. (2021). Improving the accuracy of global forecasting models using time series data augmentation. *Pattern Recognition, 120*, 108148. https://doi.org/10.1016/j.patcog.2021.108148

Cerqueira, V., Torgo, L., & Mozetič, I. (2020). Evaluating time series forecasting models: An empirical study on performance estimation methods. *Machine Learning, 109*. https://doi.org/10.1007/s10994-020-05910-7

Fildes, R., Ma, S., & Kolassa, S. (2022). Retail forecasting: Research and practice. *International Journal of Forecasting, 38*(4), 1283–1318. https://doi.org/10.1016/j.ijforecast.2019.06.004

Fries, M., & Ludwig, T. (2024). "Why are the sales forecasts so low?" Socio-technical challenges of using machine learning for forecasting sales in a bakery. *Computer Supported Cooperative Work (CSCW), 33*(2). https://doi.org/10.1007/s10606-022-09458-z

Hewamalage, H., Ackermann, K., & Bergmeir, C. (2023). Forecast evaluation for data scientists: Common pitfalls and best practices. *Data Mining and Knowledge Discovery, 37*(2), 788–832. https://doi.org/10.1007/s10618-022-00894-5

Huber, J., & Stuckenschmidt, H. (2020). Daily retail demand forecasting using machine learning with emphasis on calendric special days. *International Journal of Forecasting, 36*(4), 1420–1438. https://doi.org/10.1016/j.ijforecast.2020.02.005

Hübner, N., Caspers, J., Coroamă, V. C., & Finkbeiner, M. (2024). Machine-learning-based demand forecasting against food waste: Life cycle environmental impacts and benefits of a bakery case study. *Journal of Industrial Ecology, 28*(5), 1117–1131. https://doi.org/10.1111/jiec.13528

Hyndman, R. J., & Athanasopoulos, G. (2021). *Forecasting: Principles and practice* (3rd ed.). OTexts. https://otexts.com/fpp3/

Hyndman, R. J., & Kostenko, A. V. (2007). Minimum sample size requirements for seasonal forecasting models. *Foresight: The International Journal of Applied Forecasting, 6*, 12–15.

Labastida, P., Simbulan, M., Estrella, C. J., Flores, W., & Centeno, C. (2024). Web-based ordering system for start-up business with forecasting. *World Journal of Advanced Research and Reviews, 22*(3), 357–368. https://doi.org/10.30574/wjarr.2024.22.3.1721

Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2022). M5 accuracy competition: Results, findings, and conclusions. *International Journal of Forecasting, 38*(4), 1346–1364. https://doi.org/10.1016/j.ijforecast.2021.11.013

Petropoulos, F., et al. (2022). Forecasting: Theory and practice. *International Journal of Forecasting, 38*(3), 705–871. https://doi.org/10.1016/j.ijforecast.2021.11.001

Spiliotis, E., Makridakis, S., Semenoglou, A.-A., & Assimakopoulos, V. (2022). Comparison of statistical and machine learning methods for daily SKU demand forecasting. *Operational Research, 22*(3), 3037–3061. https://doi.org/10.1007/s12351-020-00605-2

**To check before printing:**
- **Cerqueira et al. (2020):** add the page range from the journal page; the volume and DOI are confirmed.
- **Fries & Ludwig (2024):** add the page range from the journal page; it was published online in 2022 and in print in 2024, volume 33, issue 2.
- **Petropoulos et al. (2022):** APA 7 lists up to 20 authors. This paper has more, so list the first 19, then "…", then the last author, or keep "et al." if your school's format allows it.
