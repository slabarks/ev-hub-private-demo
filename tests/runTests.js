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

console.log("\n[1/7] Syntax and static production guards");
run(python, ["-m", "py_compile", "server.py"]);
for (const file of ["js/app.js", "js/liveUploadClientParser.js", "js/engines/maturityEngine.js", "js/engines/exportEngine.js"]) run("node", ["--check", file]);
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.py"), "utf8");
const css = fs.readFileSync(path.join(root, "assets", "styles.css"), "utf8");
const bundle = JSON.parse(fs.readFileSync(path.join(root, "data", "tii_counter_locations_bundled_vetted.json"), "utf8"));
assert.match(app, /V17\.46 browser provenance-controlled AADT engine/);
assert.match(server, /V17\.46 AADT audited resolver/);
assert.match(app, /if \(absolute <= 30000\).*capex-delta-green/);
assert.match(app, /if \(absolute <= 50000\).*capex-delta-amber/);
assert.match(app, /return \{ key: "red", cls: "capex-delta-red"/);
const capexFunctionSource = app.match(/function portfolioCapexDeltaBand\(delta\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(capexFunctionSource, "CAPEX band function must exist");
const capexContext = {};
vm.runInNewContext(`${capexFunctionSource}; this.portfolioCapexDeltaBand = portfolioCapexDeltaBand;`, capexContext);
assert.equal(capexContext.portfolioCapexDeltaBand(30000).key, "green");
assert.equal(capexContext.portfolioCapexDeltaBand(-30000).key, "green");
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
assert.match(app, /portfolioFinancialSortHeader\("electricity", "Electricity"\)/);
assert.match(app, /portfolioFinancialSortHeader\("performance", "Performance vs model"\)/);
assert.doesNotMatch(app, /portfolioFinancialSortHeader\("confidence", "Forecast confidence"\)/);
assert.doesNotMatch(app, /portfolioFinancialSortHeader\("maturity", "Maturity"\)/);
assert.match(app, /revenue − electricity − OPEX/);
assert.match(app, /actual day-one CAPEX \/ next-12-month site EBITDA/);
assert.match(app, /parseLiveCalibrationFilesClient/);
assert.match(app, /V17\.46 browser-local live-history parsing \+ fit-to-width portfolio table/);
assert.doesNotMatch(app, /portfolio-financial-scroll-top/);
assert.match(css, /\.app\.portfolio-financials-active/);
assert.match(css, /overflow: visible !important/);
assert.match(css, /portfolio-financial-table th:nth-child\(10\)/);
assert.match(css, /portfolio-financial-table td:first-child[\s\S]*position: sticky/);
assert.match(css, /portfolio-financial-table \{[\s\S]*table-layout: fixed/);
assert.match(server, /"monthlyHistory": monthly_history/);
assert.match(server, /LIVE_UPLOAD_SCHEMA_VERSION = "v17\.46-live-history-v7"/);
assert.match(server, /APP_BUILD_ID = "EVHUB-V17\.46-20260711-R1"/);
assert.match(server, /LIVE_UPLOAD_PARSER_BUILD_ID = "EVHUB-LIVE-PARSER-17\.46\.1"/);
assert.match(server, /"monthlyObservationCount": monthly_observation_count/);
assert.match(app, /PORTFOLIO_LIVE_ACTUALS_SCHEMA_VERSION = "v17\.46-live-history-v7"/);
assert.match(app, /APP_BUILD_ID = "EVHUB-V17\.46-20260711-R1"/);
assert.match(app, /accept="\.xlsx,\.xlsm,\.csv,\.zip"/);
assert.match(server, /def _expand_calibration_upload_files/);
assert.match(server, /PACKAGE_LAYOUT_VERSION = "flat-root-v1"/);
assert.doesNotMatch(app, /Portfolio maturity & forecast quality/);
assert.match(app, /Advanced forecast methodology & audit/);
assert.match(app, /Model forward 12m benchmark/);
assert.match(app, /Performance variance/);
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
assert.match(app, /does not replace the Above \/ In \/ Under benchmark classification/);
assert.match(app, /base forecast used in EBITDA/);
assert.doesNotMatch(app, /Revenue downside EUR|Revenue upside EUR|year revenue downside EUR|year revenue upside EUR/);
const exportEngine = fs.readFileSync(path.join(root, "js", "engines", "exportEngine.js"), "utf8");
assert.doesNotMatch(exportEngine, /range \${currency\(r\.next12mRevenue/);
assert.doesNotMatch(exportEngine, /Low \/ missing history/);
assert.match(exportEngine, /History quality/);
assert.match(fs.readFileSync(path.join(root, "js", "engines", "exportEngine.js"), "utf8"), /name: "Portfolio Summary"/);
assert.match(fs.readFileSync(path.join(root, "js", "engines", "exportEngine.js"), "utf8"), /name: "Definitions"/);
assert.doesNotMatch(app, /<h3>Maturity forecast summary<\/h3>/);
assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /17\.46-browser-parser-fit-table-20260711-r1/);
assert.doesNotMatch(server, /raise SystemExit\(2\)/);
const compatibilitySource = app.match(/function portfolioServerCompatibility\(info\) \{[\s\S]*?\n\}/)?.[0];
const snapshotValidationSource = app.match(/function portfolioSnapshotValidation\(snapshot\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(compatibilitySource, "server compatibility diagnostics must exist");
assert.ok(snapshotValidationSource, "live-upload snapshot validation must exist");
assert.doesNotMatch(app, /fetch\(`\/api\/version/);
assert.match(app, /browser parsed Daily_Charger_kWh locally/);
assert.match(app, /api\/import-live-calibration-v1746/);
const snapshotContext = {};
vm.runInNewContext(`const APP_RELEASE_VERSION = "V17.46"; const APP_BUILD_ID = "EVHUB-V17.46-20260711-R1"; const LIVE_UPLOAD_PARSER_BUILD_ID = "EVHUB-LIVE-PARSER-17.46.1"; const PORTFOLIO_LIVE_ACTUALS_SCHEMA_VERSION = "v17.46-live-history-v7"; ${compatibilitySource}; ${snapshotValidationSource}; this.validate = portfolioSnapshotValidation;`, snapshotContext);
const buildMeta = { buildId: "EVHUB-V17.46-20260711-R1", uploadSchemaVersion: "v17.46-live-history-v7", parserBuildId: "EVHUB-LIVE-PARSER-17.46.1", monthlyHistorySupported: true, deploymentRootOk: true, packageLayoutVersion: "flat-root-v1", serverFileFingerprint: "testfingerprint" };
const missingHistoryResult = snapshotContext.validate({ ...buildMeta, parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: { annualKwh: 1000, monthlyHistory: [] } }] });
assert.equal(missingHistoryResult.ok, false, "Daily_Charger_kWh must not be activated when the backend returns zero monthly histories");
assert.equal(missingHistoryResult.code, "monthly-history-missing");
assert.match(missingHistoryResult.reason, /zero monthly histories/i);
assert.equal(snapshotContext.validate({ ...buildMeta, parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: { monthlyHistory: [{ month: "2026-01", kwh: 100 }] } }] }).ok, true, "valid monthly history upload must be accepted");
assert.equal(snapshotContext.validate({ ...buildMeta, buildId: "OLD", parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: { annualKwh: 1000, monthlyHistory: [{ month: "2026-01" }] } }] }).ok, true, "backend build metadata must not block valid parsed data");
const legacyCompatible = snapshotContext.validate({ aadt_engine_version: "V17.40 legacy", parsedFiles: ["Daily_Charger_kWh.xlsx"], siteActuals: [{ actual: { annualKwh: 1000, monthlyHistory: [{ month: "2026-01" }] } }] });
assert.equal(legacyCompatible.ok, true);
assert.ok(Array.isArray(legacyCompatible.warnings));
assert.match(legacyCompatible.warnings.join(" "), /build ID|backend/i);
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

console.log("\n[2/7] Browser-local production upload parser regression");
const { parseLiveCalibrationFilesClient } = await import("../js/liveUploadClientParser.js");
const productionZip = path.resolve(root, "..", "Funded_Overview_Data_10_07_26.zip");
if (fs.existsSync(productionZip)) {
  const productionBuffer = fs.readFileSync(productionZip);
  const localPayload = await parseLiveCalibrationFilesClient([{ name: "Funded_Overview_Data_10_07_26.zip", async arrayBuffer() { return productionBuffer.buffer.slice(productionBuffer.byteOffset, productionBuffer.byteOffset + productionBuffer.byteLength); } }], {
    appVersion: "V17.46",
    buildId: "EVHUB-V17.46-20260711-R1",
    parserBuildId: "EVHUB-LIVE-PARSER-17.46.1-browser",
    schemaVersion: "v17.46-live-history-v7"
  });
  assert.equal(localPayload.siteCount, 45);
  assert.equal(localPayload.rowCount, 37728);
  assert.equal(localPayload.monthlyHistorySiteCount, 45);
  assert.equal(localPayload.monthlyObservationCount, 430);
  assert.equal(localPayload.latestDate, "2026-07-09");
  const j20 = localPayload.siteActuals.find(site => site.siteName === "Circle K - Junction 20");
  assert.equal(j20?.maturity?.dataDays, 524);
  assert.equal(j20?.actual?.monthlyHistory?.length, 18);

  const unpackedDir = path.resolve(root, "..", "v1746_individual_upload", "Funded_Overview_Data_10_07_26", "Overview");
  if (fs.existsSync(unpackedDir)) {
    const individualFiles = fs.readdirSync(unpackedDir)
      .filter(name => /\.(xlsx|xlsm|csv)$/i.test(name))
      .map(name => {
        const fileBuffer = fs.readFileSync(path.join(unpackedDir, name));
        return { name, async arrayBuffer() { return fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength); } };
      });
    const individualPayload = await parseLiveCalibrationFilesClient(individualFiles, { schemaVersion: "v17.46-live-history-v7" });
    assert.equal(individualPayload.siteCount, 45);
    assert.equal(individualPayload.rowCount, 37728);
    assert.equal(individualPayload.monthlyHistorySiteCount, 45);
    assert.equal(individualPayload.monthlyObservationCount, 430);
    assert.equal(individualPayload.latestDate, "2026-07-09");
  }
}

console.log("\n[3/7] AADT regression suite");
run(python, ["tests/aadt_regression_test.py"]);

console.log("\n[4/7] Monthly live-data parser regression suite");
run(python, ["tests/live_financial_maturity_test.py"]);

console.log("\n[5/7] Revenue maturity engine regression suite");
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

console.log("\n[6/7] Live local API and static-delivery smoke test");
const port = await freePort();
const child = spawn(python, ["server.py"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DISABLE_BROWSER_OPEN: "1", PYTHONUNBUFFERED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", d => { logs += d.toString(); });
child.stderr.on("data", d => { logs += d.toString(); });
try {
  const versionResp = await waitFor(`http://127.0.0.1:${port}/api/version`);
  const version = await versionResp.json();
  assert.equal(version.ok, true);
  assert.match(version.aadt_engine_version, /V17\.46/);
  assert.equal(version.buildId, "EVHUB-V17.46-20260711-R1");
  assert.equal(version.uploadSchemaVersion, "v17.46-live-history-v7");
  assert.equal(version.parserBuildId, "EVHUB-LIVE-PARSER-17.46.1");
  assert.equal(version.monthlyHistorySupported, true);
  assert.equal(version.deploymentRootOk, true);
  assert.equal(version.packageLayoutVersion, "flat-root-v1");
  assert.equal(version.frontendBuildVerified, true);
  assert.match(version.serverFileFingerprint, /^[a-f0-9]{16}$/);

  const healthResp = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(healthResp.status, 200);
  const health = await healthResp.json();
  assert.equal(health.health, "ok");
  assert.equal(health.buildId, "EVHUB-V17.46-20260711-R1");
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
  const uploadResp = await fetch(`http://127.0.0.1:${port}/api/import-live-calibration-v1746`, { method: "POST", body: uploadForm });
  assert.equal(uploadResp.status, 200);
  const upload = await uploadResp.json();
  assert.equal(upload.ok, true);
  assert.equal(upload.buildId, "EVHUB-V17.46-20260711-R1");
  assert.equal(upload.schemaVersion, "v17.46-live-history-v7");
  assert.equal(upload.parserBuildId, "EVHUB-LIVE-PARSER-17.46.1");
  assert.equal(upload.packageLayoutVersion, "flat-root-v1");
  assert.equal(upload.monthlyHistorySiteCount, 1);
  assert.ok(upload.monthlyObservationCount >= 3);

  const indexResp = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(indexResp.status, 200);
  const indexText = await indexResp.text();
  assert.match(indexText, /<title>EV Charging Hub Investment Tool<\/title>/i);
  assert.doesNotMatch(indexText, /<title>[^<]*V17\.46/i);

  const maturityResp = await fetch(`http://127.0.0.1:${port}/js/engines/maturityEngine.js`);
  assert.equal(maturityResp.status, 200);
  assert.match(await maturityResp.text(), /buildMaturityModel/);
} finally {
  child.kill("SIGTERM");
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

console.log("\n[7/7] Result");
console.log("PASS — V17.46 browser-resilient upload, reconciled performance status, 1–20-year horizon, fit-to-width Portfolio Financials rendering, exports and API smoke tests completed successfully.");
if (logs.trim()) console.log("Server smoke log:\n" + logs.trim());
