import fs from 'node:fs';

const css = fs.readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const requiredCss = [
  '@media (max-width: 1180px)',
  '@media (max-width: 900px)',
  '@media (max-width: 720px)',
  '.table-wrap td::before',
  'content: attr(data-label)',
  'overflow-x: hidden',
  'grid-template-columns: repeat(auto-fit'
];

for (const token of requiredCss) {
  if (!css.includes(token)) throw new Error(`Missing responsive CSS token: ${token}`);
}

if (!app.includes('function plainTableLabel')) throw new Error('Missing plainTableLabel helper for responsive table labels.');
if (!app.includes('data-label="${h(labels[i] || "Value")}"')) throw new Error('Responsive table data-label attributes are not rendered.');
if (!html.includes('width=device-width, initial-scale=1.0')) throw new Error('Viewport meta tag missing.');
if (!html.includes('35.24-responsive')) throw new Error('Responsive cache-busting version tag missing.');

console.log('Responsive static checks passed.');
