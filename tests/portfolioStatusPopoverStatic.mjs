import fs from 'fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');

const requiredAppTokens = [
  'function portfolioStatusButton',
  'data-portfolio-status-trigger',
  'showPortfolioStatusPopover',
  'closePortfolioStatusPopover',
  'Click any status pill for the action year and recommendation',
  'portfolioSortHeader("category", "Category")',
  'portfolioSortHeader("performance", "Status")'
];
for (const token of requiredAppTokens) {
  if (!app.includes(token)) throw new Error(`Missing portfolio status popover token: ${token}`);
}

const removedMainColumns = [
  'portfolioSortHeader("kwhPerPlugDay", "kWh/plug/day")',
  'portfolioSortHeader("firstTriggerYear", "Year")',
  'portfolioSortHeader("performance", "Action")'
];
for (const token of removedMainColumns) {
  if (app.includes(token)) throw new Error(`Old wide portfolio column still visible in main table: ${token}`);
}

const requiredCssTokens = [
  '.portfolio-status-popover',
  '.portfolio-status-trigger',
  '.portfolio-status-popover-kpis',
  'v35.21 portfolio concise status popover'
];
for (const token of requiredCssTokens) {
  if (!css.includes(token)) throw new Error(`Missing portfolio status popover CSS token: ${token}`);
}

console.log('Portfolio status popover static regression passed.');
