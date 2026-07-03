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
  'Not enough data · CAPEX missing',
  'OPEX / yr',
  'EBITDA proxy / yr',
  'portfolioPaybackLabel(summary.paybackYears)'
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
  'v35.58 portfolio financial performance tab',
  '.portfolio-financial-table',
  '.portfolio-financial-muted',
  '.portfolio-finance-footnote'
];
for (const token of cssTokens) {
  if (!css.includes(token)) throw new Error(`Missing Portfolio Financials CSS token: ${token}`);
}

console.log('Portfolio Financials static smoke passed.');
