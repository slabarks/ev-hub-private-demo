import fs from 'fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');

const requiredAppTokens = [
  'showPortfolioVariancePopover',
  'data-portfolio-variance-trigger',
  'data-curator',
  'Curator framework:',
  'showPortfolioMaturityPopover',
  'data-portfolio-maturity-trigger',
  'portfolioMaturityDescription',
  'The main table matches actual performance to the relevant model year/basis before calculating variance',
  'portfolioSortHeader("category", "Category")',
  'portfolioSortHeader("annualVariance", "Variance")'
];
for (const token of requiredAppTokens) {
  if (!app.includes(token)) throw new Error(`Missing portfolio variance/maturity popover token: ${token}`);
}

const removedMainColumns = [
  'portfolioSortHeader("performance", "Status")',
  'portfolioSortHeader("kwhPerPlugDay", "kWh/plug/day")',
  'portfolioSortHeader("firstTriggerYear", "Year")',
  'portfolioSortHeader("performance", "Action")'
];
for (const token of removedMainColumns) {
  if (app.includes(token)) throw new Error(`Old portfolio column still visible in main table: ${token}`);
}

const requiredCssTokens = [
  '.portfolio-status-popover',
  '.portfolio-variance-trigger',
  '.portfolio-maturity-trigger',
  '.portfolio-status-popover-kpis'
];
for (const token of requiredCssTokens) {
  if (!css.includes(token)) throw new Error(`Missing portfolio popover CSS token: ${token}`);
}

console.log('Portfolio variance and maturity popover static regression passed.');
