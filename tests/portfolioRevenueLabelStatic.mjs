import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
if (!app.includes('fullYearRevenueData')) throw new Error('Revenue full-year data guard missing.');
if (!app.includes('actual T12M')) throw new Error('Actual T12M revenue label missing.');
if (!app.includes('projected')) throw new Error('Projected revenue label missing.');
if (!app.includes('Not a full-year actual')) throw new Error('Revenue tooltip warning missing.');
if (!app.includes('projected unless 365+ days')) throw new Error('Dashboard revenue basis wording missing.');
console.log('Portfolio revenue label static smoke passed.');
