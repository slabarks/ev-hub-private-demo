import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');

if (!html.includes('17.6-landlord-default-zero-20260703')) throw new Error('V17.6 cache-busting tag missing from index.html.');
if (!app.includes('V17.6 landlord default zero')) throw new Error('V17.6 app build marker missing.');
if (!app.includes('portfolio-financial-sort-header${isActive ? " active" : ""}')) throw new Error('Active sort-header class logic missing.');
if (!app.includes('class="sort-arrow"')) throw new Error('Sort arrow span missing from financial headers.');
if (!app.includes('Use the green header buttons to sort any column')) throw new Error('Financial table sort instruction missing.');

const expectedHeaders = [
  'portfolioFinancialSortHeader("site", "Site")',
  'portfolioFinancialSortHeader("days", "Days")',
  'portfolioFinancialSortHeader("capex", "CAPEX")',
  'portfolioFinancialSortHeader("kwh", "kWh / yr")',
  'portfolioFinancialSortHeader("revenue", "Revenue / yr")',
  'portfolioFinancialSortHeader("opex", "OPEX / yr")',
  'portfolioFinancialSortHeader("ebitda", "EBITDA / yr")',
  'portfolioFinancialSortHeader("payback", "Payback")',
  'portfolioFinancialSortHeader("status", "Status / quality")'
];
for (const token of expectedHeaders) {
  if (!app.includes(token)) throw new Error(`Missing sortable Portfolio Financials header: ${token}`);
}

for (const token of ['v17.3 portfolio financials', '.portfolio-financial-sort-header.active', '.portfolio-financial-sort-header .sort-arrow']) {
  if (!css.includes(token)) throw new Error(`Missing financial sort CSS token: ${token}`);
}

console.log('Portfolio Financials sortable header static smoke passed.');
