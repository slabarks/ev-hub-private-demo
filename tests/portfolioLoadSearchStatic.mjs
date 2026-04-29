import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const applyStart = app.indexOf('const applyPortfolioSite = el("applyPortfolioSite");');
const applyEnd = app.indexOf('const searchBtn = el("searchBtn");', applyStart);
assert.ok(applyStart > 0 && applyEnd > applyStart, 'Apply portfolio site handler should be present');
const applyBlock = app.slice(applyStart, applyEnd);
assert.ok(applyBlock.includes('pendingPortfolioSiteSearch = { siteId: site.id };'), 'Portfolio load should queue a Site Screening search');
assert.ok(applyBlock.includes('goTab("site")'), 'Portfolio load should open Site Screening, not skip the map workflow');
assert.ok(!applyBlock.includes('goTab("investment")'), 'Portfolio load should not jump directly to Investment before map search');
assert.ok(!applyBlock.includes('lat: 53.35, lon: -7.70, source: "Portfolio calibration library"'), 'Portfolio load should not finalise the site on the old Ireland-centre fallback');

const runStart = app.indexOf('const runSiteSearch = async (options = {}) =>');
const runEnd = app.indexOf('const radius = el("radiusKm");', runStart);
assert.ok(runStart > 0 && runEnd > runStart, 'Site search runner should be present');
const runBlock = app.slice(runStart, runEnd);
assert.ok(runBlock.includes('portfolioSite'), 'Site search should support a portfolio-site mode');
assert.ok(runBlock.includes('searchLocation(address, state.filters.radiusKm'), 'Portfolio site mode should use the normal address search engine');
assert.ok(runBlock.includes('portfolioSearchContext(ctx, portfolioSite)'), 'Portfolio site mode should preserve portfolio AADT/MIC while using search results');
assert.ok(runBlock.includes('pendingPortfolioSiteSearch = null'), 'Pending portfolio search should clear after scheduling');

console.log('Portfolio load → Site Screening search static regression passed.');
