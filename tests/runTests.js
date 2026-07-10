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

console.log("\n[1/6] Syntax and static production guards");
run(python, ["-m", "py_compile", "server.py"]);
for (const file of ["js/app.js", "js/engines/maturityEngine.js", "js/engines/exportEngine.js"]) run("node", ["--check", file]);
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.py"), "utf8");
const css = fs.readFileSync(path.join(root, "assets", "styles.css"), "utf8");
const bundle = JSON.parse(fs.readFileSync(path.join(root, "data", "tii_counter_locations_bundled_vetted.json"), "utf8"));
assert.match(app, /V17\.39 browser provenance-controlled AADT engine/);
assert.match(server, /V17\.39 AADT audited resolver/);
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
assert.match(app, /portfolioFinancialSortHeader\("confidence", "Forecast confidence"\)/);
assert.doesNotMatch(app, /portfolioFinancialSortHeader\("maturity", "Maturity"\)/);
assert.match(app, /revenue − electricity − OPEX/);
assert.match(app, /actual day-one CAPEX \/ next-12-month site EBITDA/);
assert.match(app, /portfolio-financial-scroll-top/);
assert.match(css, /portfolio-financial-table th:nth-child\(10\)/);
assert.match(css, /portfolio-financial-table td:first-child[\s\S]*position: sticky/);
assert.match(css, /portfolio-financial-table \{[\s\S]*table-layout: fixed/);
assert.match(server, /"monthlyHistory": monthly_history/);
assert.match(app, /Cumulative actual revenue annualised/);
assert.ok(app.indexOf("serverFallback") < app.indexOf("CLIENT_TII_COUNTER_LOCATION_BUNDLED_URL", app.indexOf("async function loadClientOfficialAadtLocations")), "client should retain server fallback while attempting official data");
assert.match(app, /coarse-ranking-only/);
assert.match(server, /coarse ranking-only coordinate/);
assert.equal(bundle.locations.filter(x => x.mappable_location).length, 11);
assert.equal(bundle.locations.filter(x => x.map_coordinate_status === "ranking-only-coarse-coordinate-not-for-map").length, 295);

console.log("\n[2/6] AADT regression suite");
run(python, ["tests/aadt_regression_test.py"]);

console.log("\n[3/6] Monthly live-data parser regression suite");
run(python, ["tests/live_financial_maturity_test.py"]);

console.log("\n[4/6] Revenue maturity engine regression suite");
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

console.log("\n[5/6] Live local API and static-delivery smoke test");
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
  assert.match(version.aadt_engine_version, /V17\.39/);

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

  const indexResp = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(indexResp.status, 200);
  const indexText = await indexResp.text();
  assert.match(indexText, /EV Charging Hub Investment Tool V17\.39/i);

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

console.log("\n[6/6] Result");
console.log("PASS — V17.39 AADT, CAPEX bands, monthly history, maturity forecasting, exports, API and static smoke tests completed successfully.");
if (logs.trim()) console.log("Server smoke log:\n" + logs.trim());
