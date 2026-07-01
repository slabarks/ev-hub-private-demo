import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const requiredAppTokens = [
  'function portfolioCategoryCompactLabel',
  'function portfolioCategoryCell',
  'function portfolioMaturityBadgeCompact',
  'function portfolioPerformanceCompactLabel',
  'compactLabelMap',
  'portfolioCategoryCell(r)',
  'portfolioMaturityBadgeCompact(r.site.maturity?.tier)',
  'compact: true'
];
for (const token of requiredAppTokens) {
  if (!app.includes(token)) throw new Error(`Missing compact portfolio rendering app token: ${token}`);
}

const requiredCssTokens = [
  'v35.50 compact portfolio rendering fix',
  'min-width: 1280px',
  '.portfolio-category-label',
  'text-overflow: ellipsis',
  'white-space: nowrap'
];
for (const token of requiredCssTokens) {
  if (!css.includes(token)) throw new Error(`Missing compact portfolio rendering CSS token: ${token}`);
}

if (!html.includes('35.50-portfolio-compact-render')) throw new Error('Compact rendering cache-busting version tag missing.');
console.log('Portfolio compact rendering static regression passed.');
