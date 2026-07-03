import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');

const appTokens = [
  'portfolioFinancials: "Portfolio Financials"',
  'portfolioFinancials: () => renderPortfolioFinancialPerformance()',
  'function renderPortfolioFinancialPerformance()',
  'function portfolioFinancialRow',
  'function portfolioOperationalDays',
  'function portfolioFinancialOpexFromActuals',
  'function portfolioActualLandlordTerms',
  'Landlord rent/share is excluded unless actual site-level landlord terms are provided',
  'Medium · CAPEX missing',
  'function portfolioFinancialPaybackState',
  'Negative-cashflow sites show “No payback”',
  'OPEX / yr',
  'EBITDA proxy / yr',
  'portfolioPaybackLabel(summary.paybackYears)',
  'function portfolioFinancialSortHeader',
  'data-portfolio-financial-sort',
  'function portfolioFinancialSortRows'
];
for (const token of appTokens) {
  if (!app.includes(token)) throw new Error(`Missing Portfolio Financials app token: ${token}`);
}

const htmlTokens = [
  'data-tab="portfolioFinancials"',
  '8. Portfolio Financials',
  'data-step-tab="portfolioFinancials"',
  'Step 1 of 10: Site Screening'
];
for (const token of htmlTokens) {
  if (!html.includes(token)) throw new Error(`Missing Portfolio Financials html token: ${token}`);
}

const cssTokens = [
  'v35.59 portfolio financial performance tab',
  '.portfolio-financial-table',
  '.portfolio-financial-muted',
  '.portfolio-financial-partial',
  '.portfolio-financial-metric',
  '.portfolio-financial-sort-header'
];
for (const token of cssTokens) {
  if (!css.includes(token)) throw new Error(`Missing Portfolio Financials CSS token: ${token}`);
}

console.log('Portfolio Financials static smoke passed.');
