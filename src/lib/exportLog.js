import { apiPost } from '../api/client.js'

// The export history (RULES-PLANS/REPORTS_UI_PLAN.md, U2): a PDF is printed
// by the browser, so the screen tells the server it happened. Never in the
// way of the print itself: a failed log is ignored.
export const logPrint = (type) => { apiPost('/api/reports/exports', { type }).catch(() => {}) }

// What each export is called in the history.
export const exportLabels = {
  SALES_CSV: 'Sales (CSV)',
  SALES_PDF: 'Sales report (PDF)',
  PRODUCTS_PDF: 'Products report (PDF)',
  INVENTORY_PDF: 'Inventory report (PDF)',
  FORECAST_PDF: 'Forecast (PDF)',
  FORECAST_CSV: 'Forecast (CSV)',
  PAYMENT_LOG_PDF: 'Payment log (PDF)',
  PRODUCTION_PDF: 'Production list (PDF)',
}
