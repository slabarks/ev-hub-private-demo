
import fs from 'node:fs';
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG } from './js/data/defaultAssumptions.js';
import { calculateDemand } from './js/engines/demandEngine.js';
import { calculateYearByYear, summariseFinancials } from './js/engines/financialEngine.js';
import { PORTFOLIO_CALIBRATION_SITES } from './js/data/operatingHubCalibrationLibrary.js';
import { actualCapexForSite, capexNoteForSite } from './js/data/capexCalibrationLibrary.js';

const app = fs.readFileSync('./js/app.js', 'utf8');
const start = app.indexOf('const PORTFOLIO_CATEGORY_FACTORS = {');
const end = app.indexOf('\nconst DEVELOPER_GROUPS = [', start);
const prelude = `
function portfolioCapexInfo(site, modelInitialCapex = 0) {
  const actual = Number(site?.actualCapexExVat || actualCapexForSite(site) || 0);
  const model = Number(modelInitialCapex || 0);
  const note = capexNoteForSite(site);
  return { actual, model, note, variance: actual > 0 && Number.isFinite(model) ? model - actual : null };
}
`;
const number = (v, d = 0) => Number(v).toLocaleString('en-IE', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v, d = 0) => `${(Number(v) * 100).toFixed(d)}%`;
const factory = new Function('DEFAULT_INPUTS','DEFAULT_SELECTED_CONFIG','calculateDemand','calculateYearByYear','summariseFinancials','PORTFOLIO_CALIBRATION_SITES','actualCapexForSite','capexNoteForSite','number','pct', `${prelude}${app.slice(start, end)}\nreturn { portfolioBenchmarksByCategory, portfolioFinancialRow, portfolioFinancialSummary, portfolioActualDataDays, portfolioOperationalDays, portfolioActualDateInfo, portfolioDateDiffDays };`);
const funcs = factory(DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, calculateDemand, calculateYearByYear, summariseFinancials, PORTFOLIO_CALIBRATION_SITES, actualCapexForSite, capexNoteForSite, number, pct);
const active = PORTFOLIO_CALIBRATION_SITES.filter(s => s.displayInPortfolio !== false && !s.retiredFromPortfolio && !s.excludeFromPortfolio && !s.excludeFromLiveUploads);
const benchmarks = funcs.portfolioBenchmarksByCategory(active);
const rows = active.map(site => funcs.portfolioFinancialRow(site, benchmarks));
function sourceInfo(site) {
  const actual = site.actual || {};
  const liveActuals = site.liveActuals || {};
  const diagnostics = liveActuals.diagnostics || {};
  const text = [actual.annualisationMethod, actual.actualBasis, actual.basis, actual.sourceNote, liveActuals.actualBasis].filter(Boolean).join(" ");
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*(?:calendar\s*)?days?\s*(?:live|operational|of\s*data)?/i);
  if (match) return {source:'actual text evidence', value:Number(match[1]), text};
  const candidates = [
    ['actual.dataDays', actual.dataDays],
    ['actual.operationalDays', actual.operationalDays],
    ['actual.daysLive', actual.daysLive],
    ['actual.liveDays', actual.liveDays],
    ['liveActuals.dataDays', liveActuals.dataDays],
    ['liveActuals.operationalDays', liveActuals.operationalDays],
    ['diagnostics.dataDays', diagnostics.dataDays],
    ['diagnostics.operationalDays', diagnostics.operationalDays],
    ['diagnostics.daysLive', diagnostics.daysLive],
    ['maturity.dataDays', site?.maturity?.dataDays],
  ];
  for (const [name, val] of candidates) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) return {source:name, value:n, text:''};
  }
  const dateInfo=funcs.portfolioActualDateInfo(site);
  const diff=funcs.portfolioDateDiffDays(dateInfo.firstActiveDate, dateInfo.latestDate);
  if (Number.isFinite(diff)&&diff>=0) return {source:'date difference firstActiveDate/latestDate', value:diff+1, text:JSON.stringify(dateInfo)};
  return {source:'missing', value:null, text:''};
}
const out = rows.map(r => {
  const src = sourceInfo(r.site);
  return {
    site:r.site.name,
    days:r.operationalDays,
    source:src.source,
    sourceValue:src.value,
    text:src.text,
    maturityDays:r.site?.maturity?.dataDays ?? null,
    firstActiveDate:r.site?.firstActiveDate ?? null,
    latestDate:r.site?.latestDate ?? null,
    actualKeys:Object.keys(r.site.actual||{}),
    annualKwh:r.annualKwh,
    revenue:r.annualRevenue,
    status:r.status?.label,
    dataQuality:r.dataQuality
  };
});
console.log(JSON.stringify(out,null,2));
