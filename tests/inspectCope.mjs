import fs from 'node:fs';
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG } from '../js/data/defaultAssumptions.js';
import { calculateDemand } from '../js/engines/demandEngine.js';
import { calculateYearByYear, summariseFinancials } from '../js/engines/financialEngine.js';
import { PORTFOLIO_CALIBRATION_SITES } from '../js/data/operatingHubCalibrationLibrary.js';
import { actualCapexForSite, capexNoteForSite } from '../js/data/capexCalibrationLibrary.js';
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('const PORTFOLIO_CATEGORY_FACTORS = {');
const end = app.indexOf('\nconst DEVELOPER_GROUPS = [', start);
const block = app.slice(start, end);
const prelude = `
function portfolioCapexInfo(site, modelInitialCapex = 0) {
  const actual = Number(site?.actualCapexExVat || actualCapexForSite(site) || 0);
  const model = Number(modelInitialCapex || 0);
  const note = capexNoteForSite(site);
  return { actual, model, note, variance: actual > 0 && Number.isFinite(model) ? model - actual : null };
}
`;
const factory = new Function('DEFAULT_INPUTS','DEFAULT_SELECTED_CONFIG','calculateDemand','calculateYearByYear','summariseFinancials','PORTFOLIO_CALIBRATION_SITES','actualCapexForSite','capexNoteForSite','number','pct',`${prelude}${block}\nreturn { portfolioBenchmarksByCategory, portfolioFinancialRow, portfolioFinancialSummary, portfolioFinancialOpexFromActuals };`);
const number = (v,d=0)=>Number(v).toLocaleString('en-IE',{maximumFractionDigits:d,minimumFractionDigits:d});
const pct=(v,d=0)=>`${(Number(v)*100).toFixed(d)}%`;
const { portfolioBenchmarksByCategory, portfolioFinancialRow } = factory(DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, calculateDemand, calculateYearByYear, summariseFinancials, PORTFOLIO_CALIBRATION_SITES, actualCapexForSite, capexNoteForSite, number, pct);
const activeSites = PORTFOLIO_CALIBRATION_SITES.filter(s => s.displayInPortfolio !== false && !s.retiredFromPortfolio && !s.excludeFromPortfolio && !s.excludeFromLiveUploads);
const benchmarks = portfolioBenchmarksByCategory(activeSites);
const row = portfolioFinancialRow(activeSites.find(s => /Cope/i.test(s.name)), benchmarks);
console.log(JSON.stringify(row, null, 2));
