#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const python = process.env.PYTHON || "python";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed`);
}

console.log("\n[1/8] Syntax and static production guards");
run(python, ["-m", "py_compile", "server.py"]);
for (const file of [
  "js/app.js", "js/liveHistoryLocalParser.js", "js/engines/maturityEngine.js",
  "js/engines/financialEngine.js", "js/engines/technicalEngine.js",
  "js/engines/optimizerEngine.js", "js/engines/exportEngine.js",
  "js/engines/forecastSnapshotEngine.js", "js/data/defaultAssumptions.js", "js/utils.js"
]) run("node", ["--check", file]);
run("node", ["tests/upload_route_resilience_test.js"]);
console.log("\n[2/8] Browser-local ZIP/XLSX live-history parser regression suite");
run("node", ["tests/local_history_parser_test.js"]);
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.py"), "utf8");
const css = fs.readFileSync(path.join(root, "assets", "styles.css"), "utf8");
const financialEngine = fs.readFileSync(path.join(root, "js", "engines", "financialEngine.js"), "utf8");
const exportEngine = fs.readFileSync(path.join(root, "js", "engines", "exportEngine.js"), "utf8");
const bundle = JSON.parse(fs.readFileSync(path.join(root, "data", "tii_counter_locations_bundled_vetted.json"), "utf8"));

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "DEPLOYMENT_MANIFEST.json"), "utf8"));
assert.equal((indexHtml.match(/id="workflowStepper"/g) || []).length, 1, "only one readiness/navigation workflow element may be rendered");
assert.match(indexHtml, /data-nav-mode="investor"/);
assert.match(indexHtml, /data-nav-mode="analyst"/);
assert.ok(manifest.requiredRootFiles.includes("js/engines/forecastSnapshotEngine.js"));
assert.ok(manifest.requiredRootFiles.includes("js/engines/financialEngine.js"));
assert.match(server, /js\/engines\/forecastSnapshotEngine\.js/);
assert.match(financialEngine, /cashflowTimingConvention/);
assert.match(app, /securedLeaseNpv/);
assert.match(app, /grantCapped/);
assert.match(app, /assumption-tag/);
assert.match(app, /savePortfolioForecastSnapshots/);
assert.match(exportEngine, /postInitialAnnualCashFlow/);
assert.match(app, /V21 browser provenance-controlled AADT engine/);
assert.match(server, /V21\.6 AADT audited resolver/);
assert.match(app, /value > 0[\s\S]*cls: "capex-delta-red"/);
assert.match(app, /value < 0[\s\S]*cls: "capex-delta-green"/);
assert.match(app, /absolute <= 30000 \? "green" : absolute <= 50000 \? "amber" : "red"/);
const capexFunctionSource = app.match(/function portfolioCapexDeltaBand\(delta\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(capexFunctionSource, "CAPEX band function must exist");
const capexContext = {};
vm.runInNewContext(`${capexFunctionSource}; this.portfolioCapexDeltaBand = portfolioCapexDeltaBand;`, capexContext);
assert.equal(capexContext.portfolioCapexDeltaBand(30000).key, "green");
assert.equal(capexContext.portfolioCapexDeltaBand(30000).cls, "capex-delta-red");
assert.equal(capexContext.portfolioCapexDeltaBand(-30000).key, "green");
assert.equal(capexContext.portfolioCapexDeltaBand(-30000).cls, "capex-delta-green");
assert.equal(capexContext.portfolioCapexDeltaBand(30000.01).key, "amber");
assert.equal(capexContext.portfolioCapexDeltaBand(50000).key, "amber");
assert.equal(capexContext.portfolioCapexDeltaBand(-50000.01).key, "red");
assert.match(css, /\.portfolio-financial-metric\.capex-delta-green/);
assert.match(css, /\.portfolio-financial-metric\.capex-delta-amber/);
assert.match(css, /\.portfolio-financial-metric\.capex-delta-red/);
assert.match(app, /buildMaturityModel/);
assert.match(app, /forecastSiteMaturity/);
assert.match(app, /forecastSiteForward12M/);
assert.match(app, /annualElectricityCostEscalation/);
assert.match(app, /result\.yearByYear\?\.derived\?\.initialInvestmentCapex/);
assert.doesNotMatch(app, /portfolioCapexInfo\(site, result\.financialSummary\?\.totalCapex/);
assert.match(app, /portfolioFinancialSortHeader\("electricity", "Energy & network"\)/);
assert.match(app, /portfolioFinancialSortHeader\("performance", "Actual vs age-matched model"\)/);
assert.match(app, /portfolioFinancialSortHeader\("kwh", "Actual & Next 12m kWh"\)/);
assert.doesNotMatch(app, /portfolioFinancialSortHeader\("confidence", "Forecast confidence"\)/);
assert.doesNotMatch(app, /portfolioFinancialSortHeader\("maturity", "Maturity"\)/);
assert.match(app, /revenue − energy − network − other OPEX/);
assert.match(app, /Net invested CAPEX when funding is applied/);
assert.doesNotMatch(app, /portfolio-financial-scroll-top/);
assert.match(css, /portfolio-financial-scroll-top \{ display: none !important; \}/);
assert.match(css, /app\.portfolio-financial-wide/);
assert.match(css, /portfolio-financial-table th:nth-child\(10\)/);
assert.match(css, /portfolio-financial-table td:first-child[\s\S]*position: sticky/);
assert.match(css, /portfolio-financial-table \{[\s\S]*table-layout: fixed/);
const v213CssMarker = css.lastIndexOf("/* V21.5 — full-width Portfolio Financials");
assert.ok(v213CssMarker > css.lastIndexOf("width: 1650px"), "V21.6 fluid-width rules must override legacy fixed-width rules");
const v212Css = css.slice(v213CssMarker);
assert.match(v212Css, /overflow-x: visible/);
assert.match(v212Css, /min-width: 0/);
assert.match(v212Css, /@media \(max-width: 1279px\)[\s\S]*overflow-x: auto/);
assert.match(server, /"monthlyHistory": monthly_history/);
assert.match(server, /LIVE_UPLOAD_SCHEMA_VERSION = "v21-live-history-v7"/);
assert.match(server, /APP_BUILD_ID = "EVHUB-V21.6-20260719-R1"/);
assert.match(server, /LIVE_UPLOAD_PARSER_BUILD_ID = "EVHUB-LIVE-PARSER-21\.6"/);
assert.match(server, /"monthlyObservationCount": monthly_observation_count/);
assert.match(server, /"dailyHistory": daily_history/);
assert.match(server, /"dailyObservationCount": daily_observation_count/);
assert.match(app, /data-forecast-modal-open/);
assert.match(app, /Rolling 30-day/);
assert.match(app, /data-funding-modal-open/);
assert.match(app, /data-funding-bulk-action="apply-confirmed"/);
assert.match(app, /Manage portfolio terms/);
assert.match(app, /step="1" value="\$\{h\(funding\.available\)\}" data-funding-amount/);
assert.match(app, /portfolioHistoricalModelBacktest/);
assert.match(app, /Actual performance versus model to date/);
assert.match(app, /PORTFOLIO_STORED_ACTUALS_DATE = "2026-07-13"/);
assert.match(app, /<small>MIC \$\{number\(mic,0\)\} kVA<\/small>/);
assert.match(app, /Standing \+ capacity/);
assert.match(app, /portfolio-two-card-stack kwh-card-stack/);
assert.match(app, /portfolio-two-card-stack performance-card-stack/);
assert.doesNotMatch(app, /Forward model \$\{kwh\(fin\.modelForward12mKwh/);
assert.match(app, /Actual above model/);
assert.match(app, /Actual below model/);
assert.match(app, /In line with model/);
assert.match(app, /label: "Actual vs age-matched model"/);
assert.match(app, /kpi\("In line with model"/);
assert.match(css, /V21\.5 — compact investor cards/);
const fundingLibrary = fs.readFileSync(path.join(root, "js", "data", "zeviFundingLibrary.js"), "utf8");
assert.match(fundingLibrary, /"id": "confirmed_supervalu_tipperary"[\s\S]*?"confidence": "confirmed"/);
assert.match(app, /Funding available EUR/);
assert.match(app, /PORTFOLIO_LIVE_ACTUALS_SCHEMA_VERSION = "v21-live-history-v7"/);
assert.match(app, /APP_BUILD_ID = "EVHUB-V21.6-20260719-R1"/);
assert.match(app, /accept="\.xlsx,\.xlsm,\.csv,\.zip"/);
assert.match(server, /def _expand_calibration_upload_files/);
assert.match(server, /def _is_primary_daily_calibration_filename/);
assert.match(server, /primarySourceSelection/);
assert.match(server, /Content-Encoding/);
assert.match(server, /Server-Timing/);
assert.match(server, /PACKAGE_LAYOUT_VERSION = "flat-root-v1"/);
assert.doesNotMatch(app, /Portfolio maturity & forecast quality/);
assert.match(app, /Advanced forecast methodology & audit/);
assert.match(app, /Model forward 12m benchmark/);
assert.match(app, /Historical actual vs model/);
assert.match(app, /performanceBucket = portfolioFinancialPerformanceBucket/);
assert.match(app, /monthly-history-unavailable/);
assert.match(app, /Array\.from\(\{ length: 20 \}/);
assert.match(app, /type="range" min="1" max="20" step="1"/);
assert.match(app, /node\.addEventListener\("change", e => \{ setPortfolioFinancialHorizon/);
assert.doesNotMatch(app, /node\.addEventListener\("input", e => \{ setPortfolioFinancialHorizon/);
assert.match(css, /capex-direction-negative/);
assert.match(css, /capex-direction-positive/);
assert.match(css, /portfolio-horizon-range/);
assert.match(css, /portfolio-performance-cell/);
assert.doesNotMatch(app, /Low \/ missing history/);
assert.match(app, /History quality/);
assert.match(app, /does not replace the actual-versus-age-matched-model classification/);
assert.match(app, /P25–P75/);
assert.doesNotMatch(app, /Revenue downside EUR|Revenue upside EUR|year revenue downside EUR|year revenue upside EUR/);
assert.match(exportEngine, /Actual performance vs age-matched model/);
assert.doesNotMatch(exportEngine, /range \${currency\(r\.next12mRevenue/);
assert.doesNotMatch(exportEngine, /Low \/ missing history/);
assert.match(exportEngine, /History quality/);
assert.match(fs.readFileSync(path.join(root, "js", "engines", "exportEngine.js"), "utf8"), /name: "Portfolio Summary"/);
assert.match(fs.readFileSync(path.join(root, "js", "engines", "exportEngine.js"), "utf8"), /name: "Definitions"/);
assert.doesNotMatch(app, /<h3>Maturity forecast summary<\/h3>/);
assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /21-6-audit-20260719-r1/);
assert.doesNotMatch(server, /raise SystemExit\(2\)/);
const compatibilitySource = app.match(/function portfolioServerCompatibility\(info, options = \{\}\) \{[\s\S]*?\n\}/)?.[0];
const snapshotValidationSource = app.match(/function portfolioSnapshotValidation\(snapshot\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(compatibilitySource, "server compatibility diagnostics must exist");
assert.ok(snapshotValidationSource, "live-upload snapshot validation must exist");
assert.match(app, /portfolioVerifyUploadBackend/);
assert.match(app, /portfolioApiCandidates\("api\/version"\)/);
assert.match(app, /portfolioUploadCalibrationFiles/);
assert.match(app, /Reading the selected file locally in this browser/);
assert.match(app, /parsePortfolioCalibrationFilesLocally/);
assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /assets\/vendor\/jszip\.min\.js/);
assert.ok(fs.existsSync(path.join(root, "js", "liveHistoryLocalParser.js")), "browser-local live-history parser must be packaged");
assert.match(app, /PORTFOLIO_UPLOAD_REQUEST_TIMEOUT_MS = 150000/);
assert.match(app, /responseText \? JSON\.parse/);
assert.match(app, /api\/import-live-calibration-v1745/);
const snapshotContext = {};
vm.runInNewContext(`const APP_RELEASE_VERSION = "V21.6"; const APP_BUILD_ID = "EVHUB-V21.6-20260719-R1"; const LIVE_UPLOAD_PARSER_BUILD_ID = "EVHUB-LIVE-PARSER-21.6"; const PORTFOLIO_LIVE_ACTUALS_SCHEMA_VERSION = "v21-live-history-v7"; ${compatibilitySource}; ${snapshotValidationSource}; this.validate = portfolioSnapshotValidation;`, snapshotContext);
const buildMeta = { buildId: "EVHUB-V21.6-20260719-R1", uploadSchemaVersion: "v21-live-history-v7", parserBuildId: "EVHUB-LIVE-PARSER-21.6", monthlyHistorySupported: true, dailyHistorySupported: true, deploymentRootOk: true, packageLayoutVersion: "flat-root-v1", serverFileFingerprint: "testfingerprint" };
const missingHistoryResult = snapshotContext.validate({ ...buildMeta, parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: { annualKwh: 1000, monthlyHistory: [], dailyHistory: [] } }] });
assert.equal(missingHistoryResult.ok, false, "Daily_Charger_kWh must not be activated when the backend omits daily or monthly histories");
assert.equal(missingHistoryResult.code, "history-missing");
assert.match(missingHistoryResult.reason, /both daily and monthly site histories/i);
const validHistory = { annualKwh: 1000, monthlyHistory: [{ month: "2026-01", kwh: 100 }], dailyHistory: [{ date: "2026-01-01", kwh: 10, rolling30Kwh: 10 }] };
assert.equal(snapshotContext.validate({ ...buildMeta, parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: validHistory }] }).ok, true, "valid daily and monthly history upload must be accepted");
const mismatchedBuild = snapshotContext.validate({ ...buildMeta, buildId: "OLDER-COMPATIBLE-BUILD", parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: validHistory }] });
assert.equal(mismatchedBuild.ok, true, "a build-ID difference must not block a structurally valid history payload");
const legacyCompatible = snapshotContext.validate({ aadt_engine_version: "legacy", parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: validHistory }] });
assert.equal(legacyCompatible.ok, true, "an unversioned backend response must be accepted when the daily/monthly payload validates");
const schemaMismatch = snapshotContext.validate({ ...buildMeta, uploadSchemaVersion: "old-schema", parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: validHistory }] });
assert.equal(schemaMismatch.ok, false, "an explicitly incompatible history schema must still be rejected");
assert.equal(schemaMismatch.code, "schema-mismatch");
assert.equal(snapshotContext.validate({ parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: { monthlyHistory: [] } }] }).ok, false, "empty rows without usable actuals must still be rejected");
const performanceSource = app.match(/function portfolioFinancialPerformanceStatus\(forecastKwh, modelKwh\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(performanceSource, "forward performance status function must exist");
const performanceContext = {};
vm.runInNewContext(`const PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE = 0.15; ${performanceSource}; this.classify = portfolioFinancialPerformanceStatus;`, performanceContext);
assert.equal(performanceContext.classify(120, 100).label, "Above benchmark");
assert.equal(performanceContext.classify(80, 100).label, "Underperforming");
assert.equal(performanceContext.classify(110, 100).label, "In benchmark");
assert.equal(Math.round(performanceContext.classify(120, 100).variance * 100), 20);
const historyQualitySource = app.match(/function portfolioFinancialHistoryQuality\(fin\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(historyQualitySource, "history-quality function must exist");
const historyQualityContext = { number: (value) => String(Math.round(Number(value) || 0)) };
vm.runInNewContext(`${historyQualitySource}; this.classifyHistory = portfolioFinancialHistoryQuality;`, historyQualityContext);
const earlyHistory = historyQualityContext.classifyHistory({ hasActualKwh: true, hasOperationalDays: true, operationalDays: 4, maturityForecast: { forward12m: { historyMonths: 0 } } });
assert.equal(earlyHistory.label, "Early operation");
assert.equal(earlyHistory.note, "4 days");
const limitedHistory = historyQualityContext.classifyHistory({ hasActualKwh: true, hasOperationalDays: true, operationalDays: 90, maturityForecast: { forward12m: { historyMonths: 0 } } });
assert.equal(limitedHistory.label, "Limited history");
assert.equal(limitedHistory.note, "No completed month yet");
const usableHistory = historyQualityContext.classifyHistory({ hasActualKwh: true, hasOperationalDays: true, operationalDays: 180, maturityForecast: { forward12m: { historyMonths: 6 } } });
assert.equal(usableHistory.low, false);
const matureMissingHistory = historyQualityContext.classifyHistory({ hasActualKwh: true, hasOperationalDays: true, operationalDays: 524, maturityForecast: { forward12m: { historyMonths: 0 } } });
assert.equal(matureMissingHistory.label, "Monthly history unavailable");
assert.equal(matureMissingHistory.note, "524 operating days");
const performanceBucketSource = app.match(/function portfolioFinancialPerformanceBucket\(fin\) \{[\s\S]*?\n\}/)?.[0];
const performanceCountsSource = app.match(/function portfolioFinancialPerformanceCounts\(rows\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(performanceBucketSource && performanceCountsSource, "performance status/count helpers must exist");
const performanceCountContext = {};
vm.runInNewContext(`${performanceBucketSource}; ${performanceCountsSource}; this.countPerformance = portfolioFinancialPerformanceCounts;`, performanceCountContext);
const reconciledCounts = performanceCountContext.countPerformance([
  { performanceStatus: { key: "underperforming" }, historyQuality: { low: true } },
  { performanceStatus: { key: "in-benchmark" }, historyQuality: { low: true } },
  { performanceStatus: { key: "above-benchmark" }, historyQuality: { low: false } },
  { performanceStatus: { key: "review" }, historyQuality: { low: true } }
]);
assert.deepEqual(JSON.parse(JSON.stringify(reconciledCounts)), { inBenchmark: 1, underperforming: 1, outperforming: 1, review: 1 }, "history quality must not replace performance status counts");
const maturitySummarySource = app.match(/function portfolioFinancialMaturitySummary\(model, rows\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(maturitySummarySource, "investor maturity summary function must exist");
const maturitySummaryContext = {};
vm.runInNewContext(`${maturitySummarySource}; this.summarise = portfolioFinancialMaturitySummary;`, maturitySummaryContext);
const maturitySample = maturitySummaryContext.summarise({ source: "empirical", trainingSiteCount: 5, eligibleTrainingSiteCount: 5, stableSiteCount: 3, empiricalMonths: 12, curve: [{ month: 18, p50: 0.95 }], backtest: { 6: { medianAbsoluteError: 0.10 } } }, [
  { hasActualKwh: true, hasOperationalDays: true, operationalDays: 400, annualRevenue: 80, matureAnnualRevenue: 100, maturityRevenueUplift: 20, maturityEbitdaUplift: 10, maturityForecast: { forward12m: { historyMonths: 12 }, recentTrend: { blockChange: 0.05 }, lateRamp: false } },
  { hasActualKwh: true, hasOperationalDays: true, operationalDays: 200, annualRevenue: 50, matureAnnualRevenue: 100, maturityRevenueUplift: 50, maturityEbitdaUplift: 25, maturityForecast: { forward12m: { historyMonths: 6 }, recentTrend: { blockChange: 0.10 }, lateRamp: false } }
]);
assert.equal(Math.round(maturitySample.revenueWeightedMaturity * 100), 65);
assert.equal(maturitySample.empiricalMatureCount, 1);
assert.equal(maturitySample.rampingCount, 1);
assert.equal(maturitySample.remainingRevenueUplift, 70);
assert.equal(maturitySample.longTermConfidence.label, "High");
assert.match(app, /Cumulative actual revenue annualised/);
assert.ok(app.indexOf("serverFallback") < app.indexOf("CLIENT_TII_COUNTER_LOCATION_BUNDLED_URL", app.indexOf("async function loadClientOfficialAadtLocations")), "client should retain server fallback while attempting official data");
assert.match(app, /coarse-ranking-only/);
assert.match(server, /coarse ranking-only coordinate/);
assert.equal(bundle.locations.filter(x => x.mappable_location).length, 11);
assert.equal(bundle.locations.filter(x => x.map_coordinate_status === "ranking-only-coarse-coordinate-not-for-map").length, 295);

console.log("\n[3/8] AADT regression suite");
run(python, ["tests/aadt_regression_test.py"]);

console.log("\n[4/8] Monthly live-data parser regression suite");
run(python, ["tests/live_financial_maturity_test.py"]);

console.log("\n[5/8] Revenue maturity engine regression suite");
run("node", ["tests/maturity_regression_test.js"]);

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(err => err ? reject(err) : resolve(port));
    });
    srv.on("error", reject);
  });
}
async function waitFor(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      last = new Error(`HTTP ${r.status}`);
    } catch (err) { last = err; }
    await new Promise(r => setTimeout(r, 150));
  }
  throw last || new Error(`Timed out waiting for ${url}`);
}

console.log("\n[6/8] Financial and technical integrity regression suite");
run("node", ["tests/financial_integrity_test.js"]);

console.log("\n[7/8] Live local API and static-delivery smoke test");
const port = await freePort();
const child = spawn(python, ["server.py"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), EVHUB_ALLOW_PORT_FALLBACK: "0", DISABLE_BROWSER_OPEN: "1", PYTHONUNBUFFERED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", d => { logs += d.toString(); });
child.stderr.on("data", d => { logs += d.toString(); });
try {
  const versionResp = await waitFor(`http://127.0.0.1:${port}/api/version`);
  const version = await versionResp.json();
  assert.equal(version.ok, true);
  assert.match(version.aadt_engine_version, /V21/);
  assert.equal(version.buildId, "EVHUB-V21.6-20260719-R1");
  assert.equal(version.uploadSchemaVersion, "v21-live-history-v7");
  assert.equal(version.parserBuildId, "EVHUB-LIVE-PARSER-21.6");
  assert.equal(version.monthlyHistorySupported, true);
  assert.equal(version.deploymentRootOk, true);
  assert.equal(version.packageLayoutVersion, "flat-root-v1");
  assert.equal(version.frontendBuildVerified, true);
  assert.match(version.serverFileFingerprint, /^[a-f0-9]{16}$/);

  const prefixedVersionResp = await fetch(`http://127.0.0.1:${port}/embedded/app/api/version`);
  assert.equal(prefixedVersionResp.status, 200);
  const prefixedVersion = await prefixedVersionResp.json();
  assert.equal(prefixedVersion.buildId, "EVHUB-V21.6-20260719-R1");

  const healthResp = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(healthResp.status, 200);
  const health = await healthResp.json();
  assert.equal(health.health, "ok");
  assert.equal(health.buildId, "EVHUB-V21.6-20260719-R1");
  assert.equal(health.packageLayoutVersion, "flat-root-v1");

  const empty = await fetch(`http://127.0.0.1:${port}/api/auto-tii-aadt`);
  assert.equal(empty.status, 400);

  const trafficResp = await fetch(`http://127.0.0.1:${port}/api/auto-tii-aadt?address=Ballincollig&lat=51.8879&lon=-8.5920`);
  assert.equal(trafficResp.status, 200);
  const trafficPayload = await trafficResp.json();
  assert.equal(trafficPayload.ok, true);
  assert.match(trafficPayload.traffic.route, /N22/);
  assert.ok(trafficPayload.traffic.candidates.length <= 4);
  assert.ok(trafficPayload.traffic.nearby_counters.length > 4);

  const locationsResp = await fetch(`http://127.0.0.1:${port}/api/tii-counter-locations`);
  assert.equal(locationsResp.status, 200);
  const locations = await locationsResp.json();
  assert.equal(locations.ok, true);
  assert.equal(locations.count, 306);
  assert.equal(locations.mappable_count, 11);
  assert.equal(locations.official_count, 0);
  assert.equal(locations.source_mode, "bundled-fallback");

  const csvRows = ["Date of start_time,charge_point_name,Total charge_amount,Total net,transaction_id Count"];
  for (let i = 0; i < 95; i += 1) {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    csvRows.push(`${date},HTTP Smoke Site - Charger 1,${50 + i / 10},${(32 + i / 20).toFixed(2)},2`);
  }
  const uploadForm = new FormData();
  uploadForm.append("files", new Blob([csvRows.join("\n")], { type: "text/csv" }), "Daily_Charger_kWh.csv");
  const uploadResp = await fetch(`http://127.0.0.1:${port}/api/import-live-calibration-v1745`, { method: "POST", body: uploadForm });
  assert.equal(uploadResp.status, 200);
  const upload = await uploadResp.json();
  assert.equal(upload.ok, true);
  assert.equal(upload.buildId, "EVHUB-V21.6-20260719-R1");
  assert.equal(upload.schemaVersion, "v21-live-history-v7");
  assert.equal(upload.parserBuildId, "EVHUB-LIVE-PARSER-21.6");
  assert.equal(upload.packageLayoutVersion, "flat-root-v1");
  assert.equal(upload.monthlyHistorySiteCount, 1);
  assert.ok(upload.monthlyObservationCount >= 3);
  assert.equal(upload.dailyHistorySiteCount, 1);
  assert.ok(upload.dailyObservationCount >= 95);
  assert.equal(upload.primarySourceSelection, "canonical_filename");
  assert.ok(Number(upload.parserTimingsMs?.parserTotal) >= 0);
  assert.ok(Number(upload.requestTimingsMs?.serverBeforeResponse) >= 0);
  assert.match(uploadResp.headers.get("server-timing") || "", /parse;dur=/);
  assert.equal(uploadResp.headers.get("x-evhub-build"), "EVHUB-V21.6-20260719-R1");
  assert.equal(uploadResp.headers.get("x-evhub-parser"), "EVHUB-LIVE-PARSER-21.6");
  assert.equal(uploadResp.headers.get("content-encoding"), "gzip");

  const prefixedUploadForm = new FormData();
  prefixedUploadForm.append("files", new Blob([csvRows.join("\n")], { type: "text/csv" }), "Daily_Charger_kWh.csv");
  const prefixedUploadResp = await fetch(`http://127.0.0.1:${port}/embedded/app/api/import-live-calibration`, { method: "POST", body: prefixedUploadForm });
  assert.equal(prefixedUploadResp.status, 200, "upload API must work behind an application subpath");
  const prefixedUpload = await prefixedUploadResp.json();
  assert.equal(prefixedUpload.dailyHistorySiteCount, 1);

  const indexResp = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(indexResp.status, 200);
  const indexText = await indexResp.text();
  assert.match(indexText, /<title>EV Charging Hub Investment Tool<\/title>/i);
  assert.doesNotMatch(indexText, /<title>[^<]*V21/i);

  const maturityResp = await fetch(`http://127.0.0.1:${port}/js/engines/maturityEngine.js`);
  assert.equal(maturityResp.status, 200);
  assert.match(await maturityResp.text(), /buildMaturityModel/);

  const localParserResp = await fetch(`http://127.0.0.1:${port}/js/liveHistoryLocalParser.js`);
  assert.equal(localParserResp.status, 200);
  assert.match(await localParserResp.text(), /parsePortfolioCalibrationFilesLocally/);

  const jszipResp = await fetch(`http://127.0.0.1:${port}/assets/vendor/jszip.min.js`);
  assert.equal(jszipResp.status, 200);
  assert.match(await jszipResp.text(), /JSZip/);
} finally {
  child.kill("SIGTERM");
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

console.log("\n[8/8] Result");
console.log("PASS — V21.6 browser-local upload integrity, backend fallback resilience, compact investor table cards, confirmed funding, 1–20-year horizon, exports and API smoke tests completed successfully.");
if (logs.trim()) console.log("Server smoke log:\n" + logs.trim());
