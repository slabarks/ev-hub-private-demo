import { toCsv, downloadText, currency, number, pct, kwh, kva } from "../utils.js";
import { lineChart, stackedBarChart, financeComboChart } from "../ui/charts.js";
import { MOCK_LOCATION } from "../providers/mockProviders.js";

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function reportMetric(label, value) {
  return `<div class="report-card"><div class="label">${esc(label)}</div><div class="value">${value}</div></div>`;
}

function htmlTable(headers, rows) {
  if (!rows || !rows.length) rows = [["No rows to display."]];
  return `<div class="report-table-wrap"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(x => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function scenarioRows(compare) {
  return [...(compare?.scenarios || [])]
    .sort((a, b) => (Number.isFinite(b.roi) ? b.roi : -999) - (Number.isFinite(a.roi) ? a.roi : -999))
    .map((s, i) => [
      i + 1,
      esc(s.name),
      esc(s.config.platform),
      `${esc(s.config.selectedMicKva)} kVA`,
      esc(s.config.batterySize || "No battery"),
      Number.isFinite(s.roi) ? pct(s.roi, 1) : "—",
      currency(s.cumulativeCashFlow, 0),
      s.breakEvenYear || "Not within horizon",
      esc(s.feasibilityStatus)
    ]);
}

function getReportCtx(state) {
  return state.siteContext || {
    ...MOCK_LOCATION,
    traffic: { ...MOCK_LOCATION.traffic, source: "Excel / TII N40 corridor reference" }
  };
}

function getSiteLat(ctx) { return Number(ctx?.site?.lat ?? ctx?.latitude ?? MOCK_LOCATION.site.lat); }
function getSiteLon(ctx) { return Number(ctx?.site?.lon ?? ctx?.longitude ?? MOCK_LOCATION.site.lon); }

function lonLatToWorldPx(lon, lat, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const x = (lon + 180) / 360 * scale;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function staticMapZoomForRadius(lat, radiusKm, width, height) {
  const radiusMeters = Math.max(250, Number(radiusKm || 3) * 1000);
  // Keep the full radius ring comfortably inside the printable map frame.
  // A fixed zoom caused large search radii to print with only the edge of the circle visible.
  const targetRadiusPx = Math.min(width, height) * 0.34;
  const cosLat = Math.max(0.25, Math.cos(lat * Math.PI / 180));
  const rawZoom = Math.log2((cosLat * 156543.03392) / (radiusMeters / targetRadiusPx));
  return Math.max(8, Math.min(15, Math.floor(rawZoom)));
}

function staticMapHtml(state, ctx) {
  const lat = getSiteLat(ctx);
  const lon = getSiteLon(ctx);
  const width = 980;
  const height = 360;
  const radiusKm = Number(state.filters?.radiusKm || 3);
  const zoom = staticMapZoomForRadius(lat, radiusKm, width, height);
  const center = lonLatToWorldPx(lon, lat, zoom);
  const startX = center.x - width / 2;
  const startY = center.y - height / 2;
  const tileStartX = Math.floor(startX / 256);
  const tileEndX = Math.floor((center.x + width / 2) / 256);
  const tileStartY = Math.floor(startY / 256);
  const tileEndY = Math.floor((center.y + height / 2) / 256);
  const maxTile = Math.pow(2, zoom);
  const tiles = [];
  for (let x = tileStartX; x <= tileEndX; x++) {
    for (let y = tileStartY; y <= tileEndY; y++) {
      if (y < 0 || y >= maxTile) continue;
      const wrappedX = ((x % maxTile) + maxTile) % maxTile;
      const left = Math.round(x * 256 - startX);
      const top = Math.round(y * 256 - startY);
      tiles.push(`<img class="static-map-tile" src="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png" style="left:${left}px;top:${top}px" alt="" loading="eager" decoding="sync">`);
    }
  }
  const mpp = Math.cos(lat * Math.PI / 180) * 156543.03392 / Math.pow(2, zoom);
  const radiusPx = Math.max(14, (radiusKm * 1000) / mpp);
  const radius = `<div class="static-map-radius" style="width:${radiusPx * 2}px;height:${radiusPx * 2}px;left:${width / 2 - radiusPx}px;top:${height / 2 - radiusPx}px"></div>`;
  const siteMarker = `<div class="static-map-marker site" style="left:${width / 2}px;top:${height / 2}px">⚡</div>`;
  const chargerMarkers = (ctx.chargers || []).slice(0, 20).map(c => {
    const pt = lonLatToWorldPx(Number(c.lon), Number(c.lat), zoom);
    const left = Math.round(pt.x - startX);
    const top = Math.round(pt.y - startY);
    if (!Number.isFinite(left) || !Number.isFinite(top) || left < -30 || left > width + 30 || top < -30 || top > height + 30) return "";
    return `<div class="static-map-marker charger" style="left:${left}px;top:${top}px" title="${esc(c.name)}">•</div>`;
  }).join("");
  return `<div class="static-map" style="width:${width}px;height:${height}px">${tiles.join("")}${radius}${chargerMarkers}${siteMarker}<div class="static-map-scale">Radius: ${number(radiusKm, radiusKm < 1 ? 1 : 0)} km</div><div class="static-map-attribution">© OpenStreetMap contributors</div></div>`;
}

function mapPanelHtml(state, ctx) {
  return `
    <div class="panel">
      <h3>Site map</h3>
      ${staticMapHtml(state, ctx)}
      <p class="report-caption">Selected site, search radius and nearby charger coverage. Map tiles are loaded from OpenStreetMap for the investor PDF.</p>
    </div>`;
}

function reportValidationChecklist(results, state) {
  const tech = results.yearByYear.technical || {};
  const failures = tech.failures || [];
  const lower = failures.map(f => String(f).toLowerCase());
  const has = text => lower.some(f => f.includes(text));
  const gridOnly = state.config.batteryStrategy === "Grid only";
  const checks = [
    ["Platform compatibility", !(has("invalid") || has("platform") || has("cabinet")), "Select compatible charger, cabinet and battery options."],
    ["Plug capacity", !has("plug"), "Increase chargers, dispensers or satellites."],
    ["MIC coverage", !(has("mic") || has("power constrained")), gridOnly ? "Increase MIC to cover peak site load." : "Increase MIC or select more battery support."],
    ["Battery power coverage", gridOnly || !has("battery power"), "Select a higher-kW battery or increase MIC."],
    ["Battery energy coverage", gridOnly || !has("battery energy"), "Select a larger usable kWh battery or enable augmentation."],
    ["Overnight recharge", !has("overnight") && !has("recharge"), "Increase MIC or reduce residual battery duty."],
    ["Battery SOH / replacement", true, "Battery degradation and replacement timing are handled in the model."],
    ["Charger replacement", true, "Charger replacement cycle is included in annual cash flow."]
  ];
  return `<div class="validator-grid report-validator">${checks.map(([label, ok, fix]) => {
    const status = ok ? "Passed" : "Needs action";
    const cls = ok ? "good" : "bad";
    return `<div class="validator-card ${cls}"><div class="status">${status}</div><strong>${esc(label)}</strong><small>${ok ? "Configuration passes this check." : esc(fix)}</small></div>`;
  }).join("")}</div>`;
}

function waitForImages(container, timeoutMs = 8500) {
  const imgs = [...container.querySelectorAll("img")];
  if (!imgs.length) return Promise.resolve();
  const loaders = imgs.map(img => new Promise(resolve => {
    if (img.complete) return resolve();
    const done = () => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }));
  return Promise.race([
    Promise.all(loaders),
    new Promise(resolve => setTimeout(resolve, timeoutMs))
  ]);
}

function annualFinancialChartRows(rows) {
  return rows.map(r => ({
    ...r,
    additionalCapex: Math.abs((r.batteryReplacementCapex || 0) + (r.chargerReplacementCapex || 0) + (r.augmentationCapex || 0))
  }));
}

export function exportDemandCsv(demand) {
  downloadText("ev_hub_demand_model.csv", toCsv(demand.years), "text/csv;charset=utf-8");
}

export function exportYearByYearCsv(yearByYear) {
  downloadText("ev_hub_year_by_year.csv", toCsv(yearByYear.rows), "text/csv;charset=utf-8");
}

export function exportScenarioCsv(compare) {
  const rows = compare.scenarios.map(s => ({
    rank: s.rank || "",
    scenario: s.name,
    platform: s.config.platform,
    mic: s.config.selectedMicKva,
    battery: s.config.batterySize,
    validityStatus: s.validityStatus,
    feasibilityStatus: s.feasibilityStatus,
    totalCapex: s.totalCapex,
    totalOpex: s.totalOpex,
    totalCostToServeDemand: s.totalCostToServeDemand,
    cumulativeCashFlow: s.cumulativeCashFlow,
    roi: s.roi,
    breakEvenYear: s.breakEvenYear || "",
    npv: s.npv,
    irr: s.irr,
    servedDemandPercentage: s.servedDemandPercentage,
    lostDemand: s.lostDemand,
    lostRevenue: s.lostRevenue,
    failureReason: s.failureReason
  }));
  downloadText("ev_hub_scenario_comparison.csv", toCsv(rows), "text/csv;charset=utf-8");
}

export function exportAssumptionsJson(state) {
  downloadText("ev_hub_assumptions.json", JSON.stringify({
    exportedAt: new Date().toISOString(),
    inputs: state.inputs,
    config: state.config,
    site: state.siteContext
  }, null, 2), "application/json;charset=utf-8");
}

export function exportAuditJson(state, results) {
  downloadText("ev_hub_audit_log.json", JSON.stringify({
    exportedAt: new Date().toISOString(),
    selectedSite: state.siteContext,
    assumptions: state.inputs,
    technicalConfiguration: state.config,
    demandSummary: results.demand,
    financialSummary: results.financialSummary,
    scenarioComparison: results.compare
  }, null, 2), "application/json;charset=utf-8");
}

export function exportAnnualFinancialsExcel(state, results) {
  const rows = results.yearByYear.rows.slice(0, state.inputs.investmentHorizon);
  const financial = results.financialSummary;
  const recommended = results.compare.recommended;
  const annualRows = rows.map(r => [
    r.year,
    number(r.sessionsServed, 0),
    number(r.deliveredEnergyServedKwh, 0),
    currency(r.totalRevenue, 0),
    currency(r.electricityCost, 0),
    currency(r.grossProfit, 0),
    currency(r.totalOperatingCosts, 0),
    currency(r.annualCashFlow, 0),
    currency(r.cumulativeCashFlow, 0)
  ]);
  const scenario = results.compare.scenarios.map(s => [
    esc(s.name), esc(s.config.platform), `${esc(s.config.selectedMicKva)} kVA`, esc(s.config.batterySize || "No battery"), Number.isFinite(s.roi) ? pct(s.roi,1) : "—", currency(s.cumulativeCashFlow,0), s.breakEvenYear || "Not within horizon", esc(s.feasibilityStatus)
  ]);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Inter,Arial,sans-serif;color:#14221f;padding:20px;} h1,h2{color:#0f8f4f;} table{border-collapse:collapse;margin:12px 0 28px;width:100%;} th{background:#e6f6ec;} th,td{border:1px solid #cbdccc;padding:7px;text-align:right;} th:first-child,td:first-child{text-align:left;}
  </style></head><body>
  <h1>EV Hub Annual Financials</h1>
  <h2>Investment Summary</h2>
  ${htmlTable(["Metric","Value"], [
    ["Site", esc(state.inputs.siteAddress)],
    ["Investment horizon", `${esc(state.inputs.investmentHorizon)} years`],
    ["Selected platform", esc(state.config.platform)],
    ["Selected MIC", `${esc(state.config.selectedMicKva)} kVA`],
    ["Selected battery", esc(state.config.batterySize || "No battery")],
    ["Recommended scenario", esc(recommended?.name || "No feasible scenario")],
    ["Cumulative cash flow", currency(financial.cumulativeCashFlow,0)],
    ["ROI", Number.isFinite(financial.roi) ? pct(financial.roi,1) : "—"],
    ["Break-even year", financial.breakEvenYear || "Not within horizon"]
  ])}
  <h2>Annual Financials</h2>
  ${htmlTable(["Year","Sessions served","Delivered kWh","Revenue","Electricity cost","Gross profit","Total opex","Annual cash flow","Cumulative cash flow"], annualRows)}
  <h2>Scenario Ranking</h2>
  ${htmlTable(["Scenario","Platform","MIC","Battery","ROI","Cumulative cash flow","Break-even","Status"], scenario)}
  </body></html>`;
  downloadText("ev_hub_annual_financials.xls", html, "application/vnd.ms-excel;charset=utf-8");
}

export async function exportInvestorPdf(state, results) {
  const d = results.demand;
  const f = results.financialSummary;
  const y = results.yearByYear;
  const rec = results.compare.recommended;
  const ctx = getReportCtx(state);
  const lat = getSiteLat(ctx);
  const lon = getSiteLon(ctx);
  const horizonRows = y.rows.slice(0, state.inputs.investmentHorizon);
  const annualChartRows = annualFinancialChartRows(horizonRows);
  const demandChartRows = d.years.slice(0, 20).map(r => ({
    ...r,
    annualPeakWindowSessions: (r.annualSessionsDemanded || 0) * state.inputs.peakWindowShare,
    annualNonPeakSessions: (r.annualSessionsDemanded || 0) * (1 - state.inputs.peakWindowShare),
    annualPeakWindowKwh: (r.annualEnergyDemandedKwh || 0) * state.inputs.peakWindowShare,
    annualNonPeakKwh: (r.annualEnergyDemandedKwh || 0) * (1 - state.inputs.peakWindowShare)
  }));

  const annualTableRows = horizonRows.map(r => [
    r.year,
    number(r.sessionsServed, 0),
    number(r.deliveredEnergyServedKwh, 0),
    currency(r.totalRevenue, 0),
    currency(r.electricityCost, 0),
    currency(r.grossProfit, 0),
    currency(r.totalOperatingCosts, 0),
    currency(r.annualCashFlow, 0),
    currency(r.cumulativeCashFlow, 0)
  ]);

  const demandRows = d.years.slice(0, 20).map(r => [
    r.year,
    pct(r.bevShare, 1),
    number(r.bevDailyTraffic, 0),
    number(r.annualSessionsDemanded, 0),
    number(r.annualEnergyDemandedKwh, 0),
    kva(r.requiredMicNoBatteryKva, 0)
  ]);

  const chargerSummary = (ctx.chargers || []).slice(0, 8).map(c => [
    esc(c.name),
    esc(c.operator || "—"),
    `${number(c.distance_km, 2)} km`,
    esc(c.source || "—")
  ]);

  const scenarioTableRows = scenarioRows(results.compare);
  const capexRows = (f.capexEvents || []).map(e => [e.year, currency(e.amount, 0), esc(e.reason)]);
  const technicalStatus = results.yearByYear.technical.feasible
    ? "Configuration is technically feasible under the model checks."
    : (results.yearByYear.technical.failures || []).join("; ");

  const demandCharts = [
    lineChart("reportBevTrafficChart", demandChartRows, "year", [{ key: "bevDailyTraffic", label: "Relevant BEV traffic" }], { title: "Relevant BEV traffic growth by year" }),
    stackedBarChart("reportDemandSessionsChart", demandChartRows, "year", [{ key: "annualPeakWindowSessions", label: "Peak-window sessions" }, { key: "annualNonPeakSessions", label: "Non-peak sessions" }], { title: "Demanded charging sessions by year" }),
    stackedBarChart("reportDemandKwhChart", demandChartRows, "year", [{ key: "annualPeakWindowKwh", label: "Peak-window kWh" }, { key: "annualNonPeakKwh", label: "Non-peak kWh" }], { title: "Demanded kWh by year" }),
    lineChart("reportRequiredMicChart", demandChartRows, "year", [{ key: "requiredMicNoBatteryKva", label: "Required MIC no battery" }], { title: "Required MIC by year" })
  ].join("");

  const investmentChart = financeComboChart("reportCashflowBreakEvenChart", horizonRows, {
    title: "Cash flow and break-even over the selected horizon",
    bars: [{ key: "annualCashFlow", label: "Annual cash flow" }],
    lines: [{ key: "cumulativeCashFlow", label: "Cumulative cash flow" }]
  });

  const annualCharts = [
    financeComboChart("reportAnnualPerformanceTrend", annualChartRows, {
      title: "Annual performance trend",
      bars: [{ key: "annualCashFlow", label: "Annual cash flow" }],
      lines: [{ key: "totalRevenue", label: "Revenue" }, { key: "grossProfit", label: "Gross profit" }, { key: "cumulativeCashFlow", label: "Cumulative cash flow" }]
    }),
    stackedBarChart("reportAnnualCostBreakdown", annualChartRows, "year", [
      { key: "electricityCost", label: "Electricity cost" },
      { key: "totalOperatingCosts", label: "Operating costs" },
      { key: "additionalCapex", label: "Replacement / augmentation capex" }
    ], { title: "Annual cost breakdown" })
  ].join("");

  const report = `
  <section class="print-page cover-page">
    <div class="report-hero">
      <div>
        <img class="report-logo" src="./assets/epower-logo.png" alt="ePower" />
        <div class="eyebrow">Investor report</div>
        <h1>EV Charging Hub Investment Tool</h1>
        <p>${esc(state.inputs.siteAddress)} · exported ${esc(new Date().toLocaleString("en-IE"))}</p>
      </div>
      <div class="report-grid">
        ${reportMetric("Model start year", esc(state.inputs.modelStartYear || state.inputs.codYear))}
        ${reportMetric("Investment horizon", `${esc(state.inputs.investmentHorizon)} years`)}
        ${reportMetric("Selected platform", esc(state.config.platform))}
        ${reportMetric("Selected MIC", kva(state.config.selectedMicKva, 0))}
      </div>
    </div>
    <h2>1. Site Screening</h2>
    <div class="report-grid">
      ${reportMetric("AADT used", number(state.inputs.rawCorridorTrafficAadt, 0))}
      ${reportMetric("Traffic source", esc(ctx.traffic?.source || "Base / manual input"))}
      ${reportMetric("Nearby sites", number((ctx.chargers || []).length, 0))}
      ${reportMetric("Latitude", number(lat, 5))}
      ${reportMetric("Longitude", number(lon, 5))}
      ${reportMetric("Search radius", `${number(state.filters?.radiusKm || 0, 1)} km`)}
    </div>
    ${mapPanelHtml(state, ctx)}
    <div class="panel">
      <h3>Nearby charging sites</h3>
      ${htmlTable(["Site", "Operator", "Distance", "Source"], chargerSummary)}
    </div>
  </section>

  <section class="print-page">
    <h2>2. Demand Forecast</h2>
    <div class="report-grid">
      ${reportMetric("Required MIC no battery", kva(d.maxRequiredMicNoBatteryKva, 0))}
      ${reportMetric("Max concurrent sessions", number(d.maxConcurrentSessions, 1))}
      ${reportMetric("20-year demanded energy", kwh(d.totalDemandedEnergyKwh, 0))}
      ${reportMetric("Year 1 demanded sessions", number(d.years?.[0]?.annualSessionsDemanded || 0, 0))}
      ${reportMetric("Peak-window share", pct(state.inputs.peakWindowShare, 0))}
      ${reportMetric("Average session energy", kwh(state.inputs.averageSessionEnergy, 0))}
    </div>
    <div class="report-chart-grid two">${demandCharts}</div>
    <div class="panel">
      <h3>Demand model table</h3>
      ${htmlTable(["Year", "BEV share", "Relevant BEV traffic", "Demanded sessions", "Demanded kWh", "Required MIC"], demandRows)}
    </div>
  </section>

  <section class="print-page">
    <h2>3. Product Configuration</h2>
    <div class="report-grid">
      ${reportMetric("Platform", esc(state.config.platform))}
      ${reportMetric("Battery", esc(state.config.batterySize || "No battery"))}
      ${reportMetric("Selected MIC", kva(state.config.selectedMicKva, 0))}
      ${reportMetric("Selling price", currency(state.inputs.netSellingPriceExVat, 3) + "/kWh")}
      ${reportMetric("Electricity cost", currency(state.inputs.electricityCost, 3) + "/kWh")}
      ${reportMetric("Grant support", currency(state.inputs.grantSupport, 0))}
    </div>
    <div class="panel">
      <h3>Configuration validator</h3>
      <p>${esc(technicalStatus)}</p>
      ${reportValidationChecklist(results, state)}
    </div>
  </section>

  <section class="print-page">
    <h2>4. Investment Case</h2>
    <div class="report-grid">
      ${reportMetric("Initial investment", currency(f.grossInitialInvestmentBeforeGrant, 0))}
      ${reportMetric("Net initial investment", currency(f.initialInvestment, 0))}
      ${reportMetric("Total capex", currency(f.totalCapex, 0))}
      ${reportMetric("Cumulative cash flow", currency(f.cumulativeCashFlow, 0))}
      ${reportMetric("ROI", Number.isFinite(f.roi) ? pct(f.roi, 1) : "—")}
      ${reportMetric("Break-even", f.breakEvenYear || "Not within horizon")}
    </div>
    <div class="report-chart-grid">${investmentChart}</div>
    <div class="panel">
      <h3>Capex deployment years</h3>
      ${htmlTable(["Year", "Amount", "Reason"], capexRows)}
    </div>
  </section>

  <section class="print-page">
    <h2>5. Annual Financials</h2>
    <div class="report-grid">
      ${reportMetric("Total sessions served", number(horizonRows.reduce((a, r) => a + (r.sessionsServed || 0), 0), 0))}
      ${reportMetric("Total delivered energy", kwh(f.lifetimeKwhDelivered, 0))}
      ${reportMetric("Total revenue", currency(f.totalRevenue, 0))}
      ${reportMetric("Cumulative cash flow", currency(f.cumulativeCashFlow, 0))}
    </div>
    <div class="report-chart-grid">${annualCharts}</div>
    <div class="panel">
      <h3>Annual financial table</h3>
      ${htmlTable(["Year", "Sessions served", "Delivered kWh", "Revenue", "Electricity cost", "Gross profit", "Total opex", "Annual cash flow", "Cumulative cash flow"], annualTableRows)}
    </div>
  </section>

  <section class="print-page scenario-page">
    <h2>6. Scenario Ranking</h2>
    <div class="recommend-card">
      <div>
        <div class="eyebrow">Recommended configuration</div>
        <h3>${esc(rec?.name || "No feasible scenario")}</h3>
        <p>${esc(results.compare.explanation || "No feasible scenario could be recommended for the selected assumptions.")}</p>
      </div>
      <div class="recommend-metrics">
        ${reportMetric("Recommended MIC", rec ? kva(rec.config.selectedMicKva, 0) : "—")}
        ${reportMetric("Recommended battery", esc(rec?.config?.batterySize || "No battery"))}
        ${reportMetric("Recommended ROI", rec && Number.isFinite(rec.roi) ? pct(rec.roi, 1) : "—")}
        ${reportMetric("Cumulative cash flow", rec ? currency(rec.cumulativeCashFlow, 0) : "—")}
        ${reportMetric("Break-even", rec?.breakEvenYear || "Not within horizon")}
        ${reportMetric("Status", esc(rec?.feasibilityStatus || "No feasible scenario"))}
      </div>
    </div>
    <div class="panel" style="margin-top:18px">
      <h3>ROI ranking of scenarios</h3>
      ${htmlTable(["ROI rank", "Scenario", "Platform", "MIC", "Battery", "ROI", "Cumulative CF", "Break-even", "Status"], scenarioTableRows)}
    </div>
  </section>`;

  let container = document.getElementById("printReportContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "printReportContainer";
    container.className = "print-report";
    document.body.appendChild(container);
  }
  container.innerHTML = report;
  document.body.classList.add("print-mode");
  await waitForImages(container);
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove("print-mode"), 500);
  }, 250);
}

export function printInvestorMemo() {
  window.print();
}
