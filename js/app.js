import { state, setInput, setConfig, setSiteContext, resetState } from "./state.js";
import { MIC_VALUES, DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, ASSUMPTION_DICTIONARY } from "./data/defaultAssumptions.js";
import { PLATFORM_LIBRARY, cabinetOptions, standaloneChargerOptions } from "./data/platformLibrary.js";
import { batteryOptionsFor } from "./data/batteryLibrary.js";
import { calculateDemand } from "./engines/demandEngine.js";
import { calculateYearByYear, summariseFinancials } from "./engines/financialEngine.js";
import { compareExcelScenarios } from "./engines/optimizerEngine.js";
import { searchLocation, searchCoordinates, filterChargers, maxConnectorPower, totalConnectors, categoryForPower } from "./providers/addressProviders.js";
import { MOCK_LOCATION } from "./providers/mockProviders.js";
import { lineChart, stackedBarChart, financeComboChart } from "./ui/charts.js";
import { currency, number, pct, kw, kwh, kva } from "./utils.js";
import { exportDemandCsv, exportYearByYearCsv, exportScenarioCsv, exportAssumptionsJson, exportAuditJson, exportAnnualFinancialsExcel, exportInvestorPdf } from "./engines/exportEngine.js";

const VALID_TABS = ["site", "demand", "setup", "investment", "annuals", "scenario", "advanced", "report"];
const TAB_ALIASES = { simulation: "setup", yearbyyear: "annuals", export: "report" };

function tabFromHash() {
  const raw = (window.location.hash || "#site").replace("#", "");
  const t = TAB_ALIASES[raw] || raw;
  return VALID_TABS.includes(t) ? t : "site";
}

let activeTab = tabFromHash();
let map = null;
let mapLoaded = false;
let siteMarker = null;
let chargerMarkers = [];
let mapSearchVersion = 0;
let lastRenderedMapKey = null;
let mapPointSelectMode = false;

function results() {
  const demand = calculateDemand(state.inputs);
  const yearByYear = calculateYearByYear(state.inputs, state.config, demand);
  const financialSummary = summariseFinancials(state.inputs, state.config, demand, yearByYear, state.inputs.investmentHorizon);
  const compare = compareExcelScenarios(state.inputs, demand, state.inputs.investmentHorizon);
  return { demand, yearByYear, financialSummary, compare };
}

function el(id) { return document.getElementById(id); }
function h(v) { return String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function safePct(v, digits = 1) { return Number.isFinite(v) ? pct(v, digits) : "—"; }
function resetMapState(reason = "map reset") {
  try { if (siteMarker) siteMarker.remove(); } catch (_) {}
  try { chargerMarkers.forEach(m => m.remove()); } catch (_) {}
  chargerMarkers = [];
  siteMarker = null;
  lastRenderedMapKey = null;
  if (map) {
    try { map.remove(); } catch (err) { console.warn("Map reset warning", reason, err); }
    map = null;
  }
  mapLoaded = false;
  const mapDiv = el("map");
  if (mapDiv) mapDiv.innerHTML = `<div class="map-fallback">Loading map for updated address…</div>`;
}

function currentMapKey(ctx = state.siteContext) {
  const lat = Number(ctx?.site?.lat ?? 51.8879);
  const lon = Number(ctx?.site?.lon ?? -8.5920);
  return [Number.isFinite(lat) ? lat.toFixed(6) : "na", Number.isFinite(lon) ? lon.toFixed(6) : "na", state.filters.radiusKm, state.filters.minPower, state.filters.category, mapSearchVersion].join("|");
}

function coordinateAddressLabel(lat, lon) {
  return `Manual map point: ${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function latestYearFromText(value) {
  const years = String(value ?? "").match(/(?:19|20)\d{2}/g);
  return years && years.length ? Math.max(...years.map(Number)) : null;
}
function nextApprovedMic(required) {
  return MIC_VALUES.find(v => v >= required) || MIC_VALUES[MIC_VALUES.length - 1];
}
function dualUnitLabel() { return state.config.platform === "Autel Standalone" ? "charger" : "dual dispenser / satellite"; }
function inputField(key, label, opts = {}) {
  const value = state.inputs[key];
  const type = opts.type || "number";
  return `<div class="field"><label for="${key}">${label}</label><input id="${key}" data-input="${key}" type="${type}" step="${opts.step ?? "any"}" value="${h(value)}" ${opts.min != null ? `min="${opts.min}"` : ""} ${opts.max != null ? `max="${opts.max}"` : ""}/><small>${opts.help || ""}</small></div>`;
}
function selectField(key, label, options, opts = {}) {
  return `<div class="field"><label for="${key}">${label}</label><select id="${key}" data-input="${key}">${options.map(o => `<option value="${h(o)}" ${String(state.inputs[key]) === String(o) ? "selected" : ""}>${h(o)}</option>`).join("")}</select><small>${opts.help || ""}</small></div>`;
}
function selectFieldConfig(key, label, options, opts = {}) {
  return `<div class="field"><label for="${key}">${label}</label><select id="${key}" data-config="${key}">${options.map(o => `<option value="${h(o)}" ${String(state.config[key]) === String(o) ? "selected" : ""}>${h(o)}</option>`).join("")}</select><small>${opts.help || ""}</small></div>`;
}
function inputFieldConfig(key, label, opts = {}) {
  const value = state.config[key];
  return `<div class="field"><label for="${key}">${label}</label><input id="${key}" data-config="${key}" type="${opts.type || "number"}" step="${opts.step ?? "any"}" value="${h(value)}" ${opts.min != null ? `min="${opts.min}"` : ""} ${opts.max != null ? `max="${opts.max}"` : ""}/><small>${opts.help || ""}</small></div>`;
}
function kpi(label, value, sub = "") {
  return `<div class="kpi"><div class="label">${h(label)}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}
function kpiWindow(title, tone, items) {
  return `<section class="kpi-window ${tone}"><h3>${h(title)}</h3><div class="kpi-window-grid">${items.join("")}</div></section>`;
}
function sectionTitle(title, subtitle) {
  return `<div class="page-title"><div><h2>${title}</h2><p>${subtitle}</p></div></div>`;
}
function table(headers, rows, cls = "") {
  const body = rows.length ? rows.map(row => `<tr>${row.map(x => `<td>${x}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">No rows to display.</td></tr>`;
  return `<div class="table-wrap"><table class="${cls}"><thead><tr>${headers.map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function preserveScrollRender() {
  const scrollY = window.scrollY;
  requestAnimationFrame(() => {
    render();
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0, behavior: "auto" }));
  });
}

function resetControl(tab, label = "Reset this page to default values") {
  return `<div class="reset-card"><div><strong>${h(label)}</strong><p>Restores this page’s inputs to the default model values and updates downstream calculations.</p></div><button class="reset" data-reset="${tab}">Reset</button></div>`;
}

function assignDefaults(keys) {
  keys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_INPUTS, key)) setInput(key, DEFAULT_INPUTS[key]);
  });
}

const DEMAND_KEYS = ["annualBevShareGrowthRate", "siteCaptureRate", "siteLimitationFactor", "peakWindowShare", "peakHourShareWithinPeakWindow", "averageSessionEnergy", "baseFleetPlanningPower"];
const SETUP_INPUT_KEYS = ["netSellingPriceExVat", "electricityCost", "grantSupport", "groundRentPerEvSpace", "leaseTerm", "landlordGpShare", "landlordGrossSalesShare", "batteryReplacementThresholdSoh", "chargerEquipmentReplacementCycleYears"];
const SITE_RESET_INPUT_KEYS = ["siteAddress", "rawCorridorTrafficAadt"];
function resetPage(tab) {
  if (tab === "site") {
    assignDefaults(SITE_RESET_INPUT_KEYS);
    state.siteContext = { ...MOCK_LOCATION };
    state.filters.radiusKm = 3;
    state.filters.minPower = "Any";
    state.filters.category = "Any";
    state.filters.manualAadtOverride = false;
  }
  if (tab === "demand") assignDefaults(DEMAND_KEYS);
  if (tab === "setup") {
    assignDefaults(SETUP_INPUT_KEYS);
    Object.assign(state.config, DEFAULT_SELECTED_CONFIG);
  }
  if (tab === "investment") assignDefaults(["investmentHorizon", "modelStartYear", "codYear"]);
  if (tab === "advanced") {
    assignDefaults(advancedInputKeys());
  }
  enforceConfigCompatibility();
}

const TAB_LABELS = {
  site: "Site Screening",
  demand: "Demand Forecast",
  setup: "Product Configuration",
  investment: "Investment Case",
  annuals: "Annual Financials",
  scenario: "Scenario Ranking",
  advanced: "Advanced Model Settings",
  report: "Investor Report"
};
const ORDERABLE_SECTIONS = {
  demand: ["kpis", "assumptions", "bevTraffic", "sessions", "kwh", "mic", "table"],
  setup: ["overviewValidator", "productConfig", "commercial", "landlord"],
  investment: ["horizon", "returns", "investmentFunding", "trading", "lifecycle", "cashflow", "capex"],
  annuals: ["summary", "performance", "costs", "table", "technical"]
};
function getSectionOrder(tab) {
  const defaults = ORDERABLE_SECTIONS[tab] || [];
  try {
    const saved = JSON.parse(localStorage.getItem(`evHub.sectionOrder.v33.${tab}`) || "null");
    if (Array.isArray(saved)) return [...saved.filter(x => defaults.includes(x)), ...defaults.filter(x => !saved.includes(x))];
  } catch (_) {}
  return defaults;
}
function setSectionOrder(tab, order) {
  try { localStorage.setItem(`evHub.sectionOrder.v33.${tab}`, JSON.stringify(order)); } catch (_) {}
}
function moveSection(tab, id, direction) {
  const order = getSectionOrder(tab);
  const idx = order.indexOf(id);
  if (idx < 0) return;
  const next = idx + direction;
  if (next < 0 || next >= order.length) return;
  [order[idx], order[next]] = [order[next], order[idx]];
  setSectionOrder(tab, order);
}
function sectionControls(tab, id, title) {
  if (!ORDERABLE_SECTIONS[tab]) return "";
  return `<div class="section-toolbar"><span>${h(title)}</span><div><button type="button" class="section-move" data-section-tab="${tab}" data-section-id="${id}" data-direction="-1" title="Move up">↑</button><button type="button" class="section-move" data-section-tab="${tab}" data-section-id="${id}" data-direction="1" title="Move down">↓</button></div></div>`;
}
function orderableSection(tab, id, title, html, cls = "") {
  return `<section class="orderable-section ${cls}" data-section="${id}">${sectionControls(tab, id, title)}${html}</section>`;
}
function renderOrderedSections(tab, sections) {
  const map = Object.fromEntries(sections.map(s => [s.id, s]));
  return getSectionOrder(tab).map(id => map[id]).filter(Boolean).map(s => orderableSection(tab, s.id, s.title, s.html, s.cls || "")).join("");
}
function updateWorkflowStepper() {
  const idx = VALID_TABS.indexOf(activeTab);
  const pct = VALID_TABS.length <= 1 ? 0 : (idx / (VALID_TABS.length - 1)) * 100;
  const stepper = document.getElementById("workflowStepper");
  if (stepper) stepper.style.setProperty("--progress", `${Math.max(0, Math.min(100, pct))}%`);
  const statusText = document.getElementById("workflowStatusText");
  if (statusText) statusText.textContent = `Step ${idx + 1} of ${VALID_TABS.length}: ${TAB_LABELS[activeTab]}`;
  document.querySelectorAll("#workflowStepper button[data-step-tab]").forEach(btn => {
    const stepIdx = VALID_TABS.indexOf(btn.dataset.stepTab);
    btn.classList.toggle("active", btn.dataset.stepTab === activeTab);
    btn.classList.toggle("complete", stepIdx >= 0 && stepIdx < idx);
  });
}

function validationChecklist(r) {
  const validity = r.yearByYear.technical;
  const yd = r.yearByYear.derived;
  const demand = r.demand;
  const gridOnly = state.config.batteryStrategy === "Grid only";
  const maxResidualPower = Math.max(...demand.years.map(y => Math.max(0, y.peakDemandRequiredKw - state.config.selectedMicKva * state.inputs.powerFactor)));
  const maxResidualEnergy = Math.max(...demand.years.map(y => Math.max(0, y.peakWindowKwh - state.config.selectedMicKva * state.inputs.powerFactor * 5)));
  const checks = [
    {
      title: "Platform compatibility",
      ok: validity.valid,
      fix: "Select a charger, cabinet and battery combination that belongs to the same platform family."
    },
    {
      title: "Plug capacity",
      ok: yd.installedOutputs >= demand.maxConcurrentSessions,
      fix: "Increase chargers, dispensers or satellites so installed plugs cover peak concurrent sessions."
    },
    {
      title: "Charger output coverage",
      ok: yd.installedChargerPowerKw >= demand.maxPeakDemandKw,
      fix: "Increase charger/cabinet capacity so installed charger kW covers peak charging demand."
    },
    {
      title: "MIC coverage",
      ok: gridOnly ? state.config.selectedMicKva >= demand.maxRequiredMicNoBatteryKva : yd.totalAvailableSitePowerKw >= demand.maxPeakDemandKw,
      fix: gridOnly ? "Increase MIC to cover the grid-only peak requirement." : "Increase MIC or battery power so grid plus battery can cover the peak requirement."
    },
    {
      title: "Battery power coverage",
      ok: gridOnly || yd.batteryPowerKw >= maxResidualPower,
      neutral: gridOnly,
      fix: "Select a battery with higher inverter kW or increase MIC to reduce residual peak power."
    },
    {
      title: "Battery energy coverage",
      ok: gridOnly || yd.batteryEnergyKwh >= maxResidualEnergy,
      neutral: gridOnly,
      fix: "Select a larger battery or increase MIC to reduce residual peak-window energy duty."
    },
    {
      title: "Overnight recharge",
      ok: gridOnly || (state.config.selectedMicKva * state.inputs.powerFactor * state.inputs.overnightRechargeWindowDuration) >= Math.min(yd.batteryEnergyKwh, maxResidualEnergy),
      neutral: gridOnly,
      fix: "Increase MIC, reduce residual duty or choose a configuration with more recharge margin."
    },
    {
      title: "Battery SOH / replacement",
      ok: true,
      fix: "Battery replacement and augmentation triggers are included in the year-by-year model."
    },
    {
      title: "Charger replacement",
      ok: true,
      fix: "Charger replacement cycle is included in the annual financial model."
    }
  ];
  return checks.map(c => {
    const cls = c.neutral ? "warn" : c.ok ? "good" : "bad";
    const status = c.neutral ? "Not used" : c.ok ? "Passed" : "Needs action";
    return `<div class="validator-card ${cls}"><div class="status">${status}</div><strong>${h(c.title)}</strong><small>${h(c.ok && !c.neutral ? "Configuration passes this check." : c.fix)}</small></div>`;
  }).join("");
}
function filteredChargers() {
  const all = state.siteContext?.chargers || [];
  return filterChargers(all, state.filters);
}

function siteOverviewKpis() {
  const chargers = filteredChargers();
  const units = chargers.reduce((a, s) => a + (Number(s.units) || 0), 0);
  const plugs = chargers.reduce((a, s) => a + totalConnectors(s), 0);
  const powers = chargers.map(maxConnectorPower).filter(Number.isFinite);
  return [
    kpi("Sites found", number(chargers.length), "after filters"),
    kpi("Charging units", number(units), "not invented if missing"),
    kpi("Plugs / connectors", number(plugs), "from source data only"),
    kpi("Max plug power", powers.length ? kw(Math.max(...powers), 0) : "not provided", `Min filter: ${state.filters.minPower}`)
  ].join("");
}
function aadtSourceText(ctx) {
  const t = ctx?.traffic;
  if (!t) return "Base model default until site search runs";
  const parts = [t.source || t.provider || "Traffic source not provided"];
  if (t.counter_name || t.counter_id) parts.push(`Counter: ${t.counter_name || t.counter_id}`);
  if (Number.isFinite(Number(t.counter_distance_km))) parts.push(`${number(Number(t.counter_distance_km), 2)} km from site`);
  const sourceYear = Number(state.inputs.trafficSourceYear);
  const startYear = Number(state.inputs.modelStartYear ?? state.inputs.codYear);
  if (Number.isFinite(sourceYear) && Number.isFinite(startYear) && startYear > sourceYear) {
    parts.push(`Extrapolated from ${sourceYear} to ${startYear} using ${pct(state.inputs.annualTrafficGrowthRate, 1)} annual traffic growth`);
  }
  if (t.confidence) parts.push(`Confidence: ${t.confidence}`);
  return parts.join(" · ");
}


function tiiCandidateCards(ctx) {
  const candidates = ctx?.traffic?.candidates || [];
  if (!candidates.length) return "";
  return `<div class="tii-candidate-list"><strong>Automatic TII AADT matches</strong><div class="tii-candidates">${candidates.map(c => {
    const distance = Number.isFinite(Number(c.distance_km)) ? `${number(Number(c.distance_km), 2)} km` : h(c.match_basis || "text match");
    const score = Number.isFinite(Number(c.match_score)) ? ` · score ${number(Number(c.match_score), 1)}` : "";
    const terms = Array.isArray(c.matched_terms) && c.matched_terms.length ? ` · matched ${h(c.matched_terms.slice(0, 4).join(", "))}` : "";
    return `<div class="tii-candidate ${c.selected ? "selected" : ""}"><span>${c.selected ? "Used in average" : "Matched"}</span><strong>${h(c.counter_name || c.counter_id || "TII counter")}</strong><small>${h(c.route || "route not provided")} · ${distance} · ${c.aadt ? number(Number(c.aadt),0) + " AADT" : "no usable data"} · ${h(c.valid_days || "published AADT")}${score}${terms}</small></div>`;
  }).join("")}</div></div>`;
}


function renderSiteDashboard() {
  const ctx = state.siteContext;
  const chargers = filteredChargers();
  const cards = chargers.map(site => {
    const connectors = (site.connectors || []).map(c => {
      const p = Number.isFinite(Number(c.power)) ? Number(c.power) : null;
      const cat = categoryForPower(p);
      return `<span class="badge">${h(c.type || "Connector")} · ${c.quantity || "not provided"} · ${p == null ? "power not provided" : kw(p, 0)} · ${cat}</span>`;
    }).join("");
    return `<div class="site-card"><h4>${h(site.name)}</h4><p>${h(site.address || "Address not provided")} · ${number(site.distance_km, 2)} km</p><div class="badges"><span class="badge good">${h(site.operator || "operator not provided")}</span><span class="badge">${h(site.status || "status not provided")}</span><span class="badge">${h(site.source || "source not provided")}</span><span class="badge">${h(site.confidence || "confidence not provided")}</span></div><div class="badges" style="margin-top:8px">${connectors}</div></div>`;
  }).join("");

  return `
    ${sectionTitle("Site Screening", "Find the site, confirm the AADT source, and review nearby charging competition.")}
    ${resetControl("site")}
    ${ctx?.warning ? `<div class="notice warn">${h(ctx.warning)}</div>` : ""}
    <div class="panel">
      <h3>Address / Eircode search</h3>
      <div class="site-search-grid">
        <div>
          <div class="search-row">
            <input id="addressSearch" type="text" value="${h(state.inputs.siteAddress)}" placeholder="Search Irish address or Eircode" />
            <button class="primary" id="searchBtn">Search</button>
          </div>
          <div id="addressSearchStatus" class="address-search-status" role="status" aria-live="polite">Search any Irish address or Eircode. If live lookup fails, the app will time out safely and offer a fallback.</div>
          <div class="input-grid three" style="margin-top:12px">
            <div class="field"><label>Radius</label><select id="radiusKm">${[0.5,1,2,3,5,10,15,20].map(v => `<option value="${v}" ${state.filters.radiusKm === v ? "selected" : ""}>${v < 1 ? "500 m" : `${v} km`}</option>`).join("")}</select></div>
            <div class="field"><label>Minimum power</label><select id="minPower">${["Any", "7 kW+", "22 kW+", "50 kW+", "100 kW+", "150 kW+", "350 kW+"].map(v => `<option ${state.filters.minPower === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
            <div class="field"><label>Charger category</label><select id="chargerCategory">${["Any", "Ultra 100+ kW", "Rapid 50–99 kW", "Fast 7–49 kW", "Slow / unknown"].map(v => `<option ${state.filters.category === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          </div>
        </div>
        <div class="input-grid">
          <div class="field"><label>AADT used</label><input id="manualAadt" type="number" step="1" value="${state.inputs.rawCorridorTrafficAadt}" /><small>${h(aadtSourceText(ctx))}</small></div>
          <div class="field"><label>Manual override</label><select id="manualAadtOverride"><option value="false" ${!state.filters.manualAadtOverride ? "selected" : ""}>Use provider / base AADT</option><option value="true" ${state.filters.manualAadtOverride ? "selected" : ""}>Use manual AADT</option></select><small>Use this when you have better traffic data.</small></div>
        </div>
      </div>
      <div class="tii-workflow-card">
        <div>
          <strong>AADT source engine</strong>
          <p>Pressing Search now automatically runs the TII AADT lookup first. The app matches the searched address against the uploaded TII AADT Summary database using multiple address tags, averages relevant matches where appropriate, and only then falls back to curated or manual sources if no reliable match is found.</p>
          ${tiiCandidateCards(ctx)}
        </div>
        <div class="tii-actions">
          <button class="secondary" id="openTiiMap" type="button">Open TII map</button>
          <label class="file-button" for="tiiMonthlyFile">Import TII monthly Excel</label>
          <input id="tiiMonthlyFile" type="file" accept=".xlsx,.xlsm,.csv,.txt" style="display:none" />
        </div>
      </div>
    </div>
    <div class="panel map-panel" style="margin-top:18px">
      <div class="map-heading"><h3>Site map and nearby charger coverage</h3><button class="secondary map-select-btn" id="selectMapPoint" type="button">Select point on map</button></div>
      <div id="map"><div class="map-fallback">Loading map…</div></div>
      <div class="map-overview"><h3>Quick overview</h3><div class="grid-4">${siteOverviewKpis()}</div></div>
      <div id="mapStatus" class="map-status">Map uses online tile data. If tiles are blocked, site data still remains available below.</div>
    </div>
    <div class="panel" style="margin-top:18px">
      <h3>Nearby charging sites</h3>
      <div class="card-list">${cards || `<div class="notice">No chargers found with current filters. Try widening radius or lowering power/category filters.</div>`}</div>
    </div>`;
}

function demandIcon(name) {
  const iconMap = {
    sessions: "./assets/demand_sessions.png?v=35-production",
    energy: "./assets/demand_energy.png?v=35-production",
    ccs: "./assets/demand_ccs.png?v=35-production",
    grid: "./assets/demand_grid.png?v=35-production"
  };
  const altMap = {
    sessions: "Daily charging sessions icon",
    energy: "Annual energy demand icon",
    ccs: "Required plugs icon",
    grid: "Required MIC icon"
  };
  const src = iconMap[name] || iconMap.grid;
  const alt = altMap[name] || altMap.grid;
  return `<img src="${src}" alt="${alt}" class="demand-icon-image" />`;
}

function renderDemandDashboard(r) {
  const d = r.demand;
  const rows = d.years;
  const first = rows[0] || {};
  const final = rows[rows.length - 1] || first;
  const chartRows = rows.map(y => ({
    ...y,
    annualPeakWindowSessions: y.annualSessionsDemanded * state.inputs.peakWindowShare,
    annualNonPeakSessions: y.annualSessionsDemanded * (1 - state.inputs.peakWindowShare),
    annualPeakWindowKwh: y.annualEnergyDemandedKwh * state.inputs.peakWindowShare,
    annualNonPeakKwh: y.annualEnergyDemandedKwh * (1 - state.inputs.peakWindowShare)
  }));
  const demandCard = (icon, title, subtitle, y1, y20, unit = "") => `
    <article class="demand-snapshot-card">
      <div class="demand-card-head"><span class="demand-icon">${icon}</span><div><h3>${h(title)}</h3><p>${h(subtitle)}</p></div></div>
      <div class="demand-card-divider"></div>
      <div class="demand-compare">
        <div><span>Year 1</span><strong>${y1}</strong>${unit ? `<em>${h(unit)}</em>` : ""}</div>
        <div class="future"><span>Year 20</span><strong>${y20}</strong>${unit ? `<em>${h(unit)}</em>` : ""}</div>
      </div>
    </article>`;
  const sections = [
    { id: "kpis", title: "Demand quick look", html: `<section class="panel demand-snapshot"><div class="demand-snapshot-title"><h3>Demand quick look</h3><p>A simple view of how site demand grows from Year 1 to Year 20.</p></div><div class="demand-snapshot-grid">
      ${demandCard(demandIcon("sessions"), "Daily charging sessions", "captured sessions per day", number(first.effectiveDailyArrivals || 0, 1), number(final.effectiveDailyArrivals || 0, 1))}
      ${demandCard(demandIcon("energy"), "Annual energy demand", "delivered energy per year", number(first.annualEnergyDemandedKwh || 0, 0), number(final.annualEnergyDemandedKwh || 0, 0), "kWh")}
      ${demandCard(demandIcon("ccs"), "Required plugs", "peak simultaneous charging points needed", number(first.requiredPlugs || 0, 1), number(final.requiredPlugs || 0, 1))}
      ${demandCard(demandIcon("grid"), "Required MIC", "grid capacity needed without battery", number(first.requiredMicNoBatteryKva || 0, 0), number(final.requiredMicNoBatteryKva || 0, 0), "kVA")}
    </div></section>` },
    { id: "assumptions", title: "Editable demand assumptions", html: `<div class="panel">
      <h3>Editable demand assumptions</h3>
      <div class="input-grid three">
        ${inputField("annualBevShareGrowthRate", "Annual BEV share growth rate", { step: 0.01, help: "Compounds the starting BEV share each model year, capped by the model BEV share cap." })}
        ${inputField("siteCaptureRate", "Site capture rate", { step: 0.01, help: "Share of fast-charge candidates captured by this site before ramp-up." })}
        ${inputField("siteLimitationFactor", "Site limitation factor", { step: 0.01, help: "Constraint factor applied to captured sessions to reflect site limits or access limitations." })}
        ${inputField("peakWindowShare", "Peak-window share", { step: 0.01, help: "Share of daily sessions falling in the peak window. Default window is 10:00–15:00." })}
        ${inputField("peakHourShareWithinPeakWindow", "Peak-hour share within peak window", { step: 0.01, help: "Share of peak-window demand concentrated in the single highest hour." })}
        ${inputField("averageSessionEnergy", "Average session energy", { step: 1, help: "Average delivered energy per charging session. Default is 30 kWh." })}
        ${inputField("baseFleetPlanningPower", "Base fleet planning power", { step: 1, help: "Planning power per charging session used to estimate peak kW, required plugs and MIC. Default is 75 kW." })}
      </div>
    </div>` },
    { id: "bevTraffic", title: "BEV traffic growth", html: lineChart("bevTrafficChart", rows, "year", [{ key: "bevDailyTraffic", label: "Relevant BEV traffic", color: "var(--chart-blue)" }], { title: "Relevant BEV traffic growth by year", xLabel: "Year", yLabel: "Relevant BEV vehicles/day" }) },
    { id: "sessions", title: "Demanded sessions", html: stackedBarChart("sessionsChart", chartRows, "year", [{ key: "annualPeakWindowSessions", label: "Peak-window sessions", color: "var(--chart-green)" }, { key: "annualNonPeakSessions", label: "Non-peak sessions", color: "var(--chart-blue)" }], { title: "Demanded charging sessions by year", xLabel: "Year", yLabel: "Sessions/year" }) },
    { id: "kwh", title: "Demanded kWh", html: stackedBarChart("kwhChart", chartRows, "year", [{ key: "annualPeakWindowKwh", label: "Peak-window kWh", color: "var(--chart-amber)" }, { key: "annualNonPeakKwh", label: "Non-peak kWh", color: "var(--chart-purple)" }], { title: "Demanded kWh by year", xLabel: "Year", yLabel: "kWh/year" }) },
    { id: "mic", title: "Required MIC", html: lineChart("requiredMicChart", rows, "year", [{ key: "requiredMicNoBatteryKva", label: "Required MIC no battery", color: "var(--chart-slate)" }], { title: "Required MIC by year", xLabel: "Year", yLabel: "kVA", ySuffix: " kVA" }) },
    { id: "table", title: "Demand table", html: table(["Year","BEV share","Relevant BEV traffic","Demanded sessions","Demanded kWh","Peak-window kWh","Required plugs","Required MIC no battery"], rows.map(y => [
      y.year, pct(y.bevShare,1), number(y.bevDailyTraffic,0), number(y.annualSessionsDemanded,0), number(y.annualEnergyDemandedKwh,0), number(y.peakWindowKwh,0), number(y.requiredPlugs,2), kva(y.requiredMicNoBatteryKva,1)
    ])) }
  ];
  return `
    ${sectionTitle("Demand Forecast", "Forecast how local BEV charging demand grows over the 20-year model horizon.")}
    ${resetControl("demand")}
    ${renderOrderedSections("demand", sections)}`;
}
function configOptions() {
  const platform = state.config.platform;
  const cabinets = cabinetOptions(platform).map(x => x.item);
  const batteries = batteryOptionsFor(platform, state.config.batteryStrategy).map(x => x.item);
  const chargerModels = ["N/A", ...standaloneChargerOptions().map(x => x.item)];
  return { cabinets: ["N/A", ...cabinets], batteries, chargerModels };
}

function configValidatorItems(r) {
  const c = state.config;
  const yd = r.yearByYear.derived;
  const demand = r.demand;
  const gridOnly = c.batteryStrategy === "Grid only";
  const peakWindowHours = 5;
  const requiredPeakKw = demand.maxPeakDemandKw;
  const requiredPlugs = Math.ceil(demand.maxConcurrentSessions || 0);
  const plugDeficit = Math.max(0, requiredPlugs - (yd.installedOutputs || 0));
  const maxResidualPower = Math.max(...demand.years.map(y => Math.max(0, y.peakDemandRequiredKw - c.selectedMicKva * state.inputs.powerFactor)));
  const maxResidualEnergy = Math.max(...demand.years.map(y => Math.max(0, y.peakWindowKwh - c.selectedMicKva * state.inputs.powerFactor * peakWindowHours)));
  const selectedMicOk = gridOnly ? c.selectedMicKva >= demand.maxRequiredMicNoBatteryKva : yd.totalAvailableSitePowerKw >= requiredPeakKw;
  const chargerPowerOk = yd.installedChargerPowerKw >= requiredPeakKw;
  const plugOk = yd.installedOutputs >= demand.maxConcurrentSessions;
  const batteryPowerOk = gridOnly || yd.batteryPowerKw >= maxResidualPower;
  const batteryEnergyOk = gridOnly || yd.batteryEnergyKwh >= maxResidualEnergy;
  const rechargeRequired = Math.min(yd.batteryEnergyKwh || maxResidualEnergy, maxResidualEnergy);
  const rechargeAvailable = c.selectedMicKva * state.inputs.powerFactor * state.inputs.overnightRechargeWindowDuration;
  const rechargeOk = gridOnly || rechargeAvailable >= rechargeRequired;
  const nextMic = nextApprovedMic(demand.maxRequiredMicNoBatteryKva);
  const micPowerDeficit = Math.max(0, requiredPeakKw - c.selectedMicKva * state.inputs.powerFactor);
  const chargerOutputDeficit = Math.max(0, requiredPeakKw - yd.installedChargerPowerKw);
  const batteryPowerDeficit = Math.max(0, maxResidualPower - yd.batteryPowerKw);
  const batteryEnergyDeficit = Math.max(0, maxResidualEnergy - yd.batteryEnergyKwh);
  const dualNeeded = Math.max(1, Math.ceil(plugDeficit / 2));
  const unit = dualUnitLabel();
  return [
    { title: "Required site peak power", value: kw(requiredPeakKw,1), sub: "forecast peak charging demand", ok: true, guidance: "Reference demand level used to size MIC, charger output and battery support." },
    { title: "Selected MIC", value: kva(c.selectedMicKva,0), sub: "approved MIC library", ok: selectedMicOk, guidance: selectedMicOk ? "MIC plus battery support can cover the peak requirement." : gridOnly ? `Increase MIC to ${nextMic} kVA, or switch to a battery-supported power strategy.` : `Increase MIC or add at least ${kw(micPowerDeficit,0)} battery inverter support.` },
    { title: "Charger output capacity", value: kw(yd.installedChargerPowerKw,0), sub: "installed charger hardware output", ok: chargerPowerOk, guidance: chargerPowerOk ? "Installed charger output is sufficient for forecast peak demand." : `Required charging output is ${kw(requiredPeakKw,0)}. Add ${kw(chargerOutputDeficit,0)} charger output or select a higher-power charger model.` },
    { title: "Installed plugs", value: number(yd.installedOutputs,0), sub: "hardware outputs", ok: plugOk, guidance: plugOk ? "Plug capacity is sufficient." : `Required plugs: ${requiredPlugs}. Installed: ${number(yd.installedOutputs,0)}. Add ${dualNeeded} ${unit}${dualNeeded === 1 ? "" : "s"} to reach ${requiredPlugs} plugs.` },
    { title: "Battery inverter power", value: kw(yd.batteryPowerKw,0), sub: gridOnly ? "not used in grid-only strategy" : "selected battery", ok: gridOnly || batteryPowerOk, neutral: gridOnly, guidance: gridOnly ? "Not required for grid-only." : batteryPowerOk ? "Battery inverter power is sufficient." : `Residual peak power is ${kw(maxResidualPower,0)}. Increase battery inverter by ${kw(batteryPowerDeficit,0)} or increase MIC.` },
    { title: "Battery energy capacity", value: kwh(yd.batteryEnergyKwh,0), sub: gridOnly ? "not used in grid-only strategy" : "selected battery", ok: gridOnly || batteryEnergyOk, neutral: gridOnly, guidance: gridOnly ? "Not required for grid-only." : batteryEnergyOk ? "Battery energy coverage is sufficient." : `Required usable energy is ${kwh(maxResidualEnergy,0)}. Add at least ${kwh(batteryEnergyDeficit,0)} usable battery capacity.` },
    { title: "Overnight recharge", value: rechargeOk ? "OK" : "LIMITED", sub: "recharge check", ok: rechargeOk, neutral: gridOnly, guidance: gridOnly ? "No battery recharge needed." : rechargeOk ? "Recharge margin is sufficient." : `Recharge needs ${kwh(rechargeRequired,0)} but available overnight is ${kwh(rechargeAvailable,0)}. Increase MIC or reduce residual duty.` },
    { title: "Substation requirement", value: yd.substationRequired ? "YES" : "NO", sub: yd.substationRequired ? "higher-capacity connection" : "low-voltage connection", ok: true, guidance: yd.substationRequired ? "Substation capex is included in the investment model." : "No substation upgrade needed." }
  ];
}
function validatorSummary(items) {
  const actionable = items.filter(x => !x.ok && !x.neutral);
  const passed = items.filter(x => x.ok || x.neutral).length;
  const plugIssue = actionable.find(x => x.title === "Installed plugs");
  const micIssue = actionable.find(x => x.title === "Selected MIC");
  const batteryIssue = actionable.find(x => x.title === "Battery inverter power");
  const outputIssue = actionable.find(x => x.title === "Charger output capacity");
  const next = plugIssue
    ? `${plugIssue.guidance} Then ${micIssue ? "increase MIC or add more battery inverter support." : outputIssue ? "increase charger output capacity." : "review remaining checks."}`
    : micIssue
      ? "Increase MIC or add more battery inverter power to cover the site peak requirement."
      : batteryIssue
        ? "Add more battery inverter power or increase MIC."
        : actionable.length ? actionable[0].guidance : "Configuration checks passed";
  return `<div class="validator-summary"><span class="good">✓ ${passed} checks passed</span><span class="bad">⚠ ${actionable.length} item${actionable.length === 1 ? "" : "s"} to adjust</span><span class="next">↗ ${h(next)}</span></div>`;
}
function productValidatorCard(item) {
  const cls = item.neutral ? "neutral" : item.ok ? "good" : "bad";
  const status = item.neutral ? "NOT USED" : item.ok ? "PASSED" : "ACTION NEEDED";
  const icon = item.ok || item.neutral ? "✓" : "⚠";
  return `<article class="product-validator-card ${cls}"><div class="product-validator-top"><h4>${h(item.title)}</h4><span>${status}</span></div><strong>${item.value}</strong><p>${h(item.sub)}</p><div class="product-guidance"><i>${icon}</i>${h(item.guidance)}</div></article>`;
}


function renderScenarioSetup(r) {
  const c = state.config;
  const o = configOptions();
  const priceDisplay = Number.isFinite(Number(state.inputs.netSellingPriceExVat)) ? Number(state.inputs.netSellingPriceExVat).toFixed(2) : "";
  const validatorItems = configValidatorItems(r);
  const sections = [
    { id: "commercial", title: "Commercial / funding inputs", html: `<div class="panel">
      <h3>Commercial / Funding inputs</h3>
      <div class="input-grid">
        <div class="field"><label for="netSellingPriceExVat">Net selling price excluding VAT</label><input id="netSellingPriceExVat" data-input="netSellingPriceExVat" type="number" step="0.01" value="${h(priceDisplay)}" /><small>Displayed to two decimals for clarity; used to calculate charging revenue from delivered energy.</small></div>
        ${inputField("electricityCost", "Electricity cost", { step: 0.01, help: "Applied to delivered energy to calculate energy purchase cost." })}
        ${inputField("grantSupport", "Grant support (€)", { step: 1000, help: "One-off funding support that reduces the net initial investment." })}
      </div>
    </div>` },
    { id: "landlord", title: "Landlord inputs", html: `<div class="panel">
      <h3>Landlord inputs</h3>
      <div class="input-grid">
        ${inputField("groundRentPerEvSpace", "Ground rent per EV space", { step: 50, help: "Fixed annual site rent linked to EV spaces or outputs." })}
        ${inputField("leaseTerm", "Lease term", { step: 1, help: "Lease context used for the investment review." })}
        ${inputField("landlordGpShare", "Gross profit share", { step: 0.01, help: "Share of gross profit paid to the landlord when applicable." })}
        ${inputField("landlordGrossSalesShare", "Gross-sales share", { step: 0.01, help: "Share of gross sales paid to the landlord when applicable." })}
      </div>
    </div>` },
    { id: "productConfig", title: "Product configuration", html: `<div class="panel">
      <h3>Product Configuration</h3>
      <div class="config-subgroups">
        <section class="config-subgroup">
          <h4>Charging Platform</h4>
          <div class="input-grid">
            ${selectFieldConfig("platform", "Charging platform", ["Autel Standalone", "Autel Distributed", "Kempower Distributed"])}
            ${selectFieldConfig("chargerModel", "Charger model", o.chargerModels)}
            ${inputFieldConfig("chargerCount", "Number of chargers", { step: 1, min: 1 })}
            ${selectFieldConfig("cabinetType", "Cabinet type", o.cabinets)}
            ${inputFieldConfig("dispenserCount", "Dual dispensers / satellites", { step: 1, min: 0 })}
          </div>
        </section>
        <section class="config-subgroup">
          <h4>Power Strategy</h4>
          <div class="input-grid">
            ${selectFieldConfig("batteryStrategy", "Power strategy", ["Grid only", "Grid + battery"])}
            ${selectFieldConfig("selectedMicKva", "Selected grid MIC (kVA)", MIC_VALUES.map(String), { help: "Approved model values only: 50, 100, 200, 400, 800, 1000, 1500 kVA." })}
            ${selectFieldConfig("batterySize", "Battery size", o.batteries)}
            ${inputField("batteryReplacementThresholdSoh", "Battery SOH replacement threshold", { step: 0.01, help: "Battery replacement is based on state of health, not state of charge." })}
          </div>
        </section>
        <section class="config-subgroup">
          <h4>Services</h4>
          <div class="input-grid">
            ${selectFieldConfig("serviceLevel", "Service level", ["Basic", "Advance", "Premium", "Standard (2yr warranty + remote support)"])}
            ${selectFieldConfig("chargerWarrantyYears", "Extended charger warranty years", Array.from({length: 21}, (_, i) => String(i)))}
            ${selectFieldConfig("batteryWarrantyYears", "Extended battery warranty years", Array.from({length: 21}, (_, i) => String(i)))}
            ${selectField("chargerEquipmentReplacementCycleYears", "Charger replacement cycle", [7,8,9,10], { help: "Controls scheduled charger replacement years." })}
          </div>
        </section>
      </div>
    </div>` },
    { id: "overviewValidator", title: "Selected product overview & configuration validator", html: `<section class="panel product-validator-section">
      <div class="product-validator-heading"><h3>Selected product overview & configuration validator</h3><p>Review the selected configuration below. Cards marked in red show exactly what to change to make the setup pass.</p></div>
      <div class="product-validator-grid">${validatorItems.map(productValidatorCard).join("")}</div>
      ${validatorSummary(validatorItems)}
    </section>`}
  ];
  return `
    ${sectionTitle("Product Configuration", "Configure the commercial terms, charging product, battery, MIC and service package being tested.")}
    ${resetControl("setup")}
    ${renderOrderedSections("setup", sections)}`;
}
function graphRowsWithCapex(rows) {
  return rows.map(r => ({
    ...r,
    opexNegative: -Math.abs(r.totalOperatingCosts || 0),
    additionalCapexNegative: -Math.abs((r.batteryReplacementCapex || 0) + (r.chargerReplacementCapex || 0) + (r.augmentationCapex || 0))
  }));
}

function renderInvestmentDashboard(r) {
  const f = r.financialSummary;
  const rows = r.yearByYear.rows.slice(0, state.inputs.investmentHorizon);
  const sections = [
    { id: "horizon", title: "Investment horizon", html: `<div class="panel investment-horizon-panel"><h3>Model timeline</h3><p>Set the first operating year and the horizon used for ROI, cash flow, replacement events and exports.</p><div class="input-grid"><div class="field"><label>Model start year</label><input data-input="modelStartYear" type="number" min="2020" max="2100" step="1" value="${state.inputs.modelStartYear ?? state.inputs.codYear}" /><small>Defaults to the current calendar year. This replaces the older COD year wording.</small></div><div class="field"><label>Investment horizon: ${state.inputs.investmentHorizon} years</label><input data-input="investmentHorizon" type="range" min="1" max="20" step="1" value="${state.inputs.investmentHorizon}" /><small>Controls all investment totals and charts.</small></div></div></div>` },
    { id: "investmentFunding", title: "Investment & funding", html: kpiWindow("Investment & Funding", "tone-blue", [
      kpi("Initial investment", currency(f.grossInitialInvestmentBeforeGrant,0), "before grant"),
      kpi("Grant support", currency(f.grantSupport,0), "one-off support"),
      kpi("Net initial investment", currency(f.initialInvestment,0), "after grant"),
      kpi("Total capex", currency(f.totalCapex,0), `Years 1–${f.horizon}`),
      kpi("Replacement / augmentation capex", currency(f.totalReplacementCapex,0))
    ]) },
    { id: "trading", title: "Year 1 trading performance", html: kpiWindow("Year 1 Trading Performance", "tone-green", [
      kpi("Delivered energy", kwh(f.year1DeliveredEnergy,0)),
      kpi("Revenue", currency(f.year1Revenue,0)),
      kpi("Gross profit", currency(f.year1GrossProfit,0)),
      kpi("Operating cost", currency(f.year1OperatingCost,0)),
      kpi("Annual cash flow", currency(f.year1AnnualCashFlow,0))
    ]) },
    { id: "returns", title: "Return metrics", html: kpiWindow("Return Metrics", "tone-amber", [
      kpi("Cumulative cash flow", currency(f.cumulativeCashFlow,0), `over ${f.horizon} years`),
      kpi("ROI", safePct(f.roi,1), "over selected horizon"),
      kpi("Break-even year", f.breakEvenYear || "No break-even", "within horizon"),
      kpi("Simple payback", f.simplePayback ? `${f.simplePayback} years` : "No payback"),
      kpi("NPV", currency(f.npv,0), "supporting metric"),
      kpi("IRR", Number.isFinite(f.irr) ? pct(f.irr,1) : "n/a", "supporting metric")
    ]) },
    { id: "lifecycle", title: "Asset lifecycle & deployment", html: kpiWindow("Asset Lifecycle & Deployment", "tone-purple", [
      kpi("First battery replacement", f.firstBatteryReplacementYear || "No replacement"),
      kpi("Battery replacements", number(f.batteryReplacementCount,0)),
      kpi("Charger replacements", number(f.chargerReplacementCount,0)),
      kpi("Lifetime kWh delivered", kwh(f.lifetimeKwhDelivered,0)),
      kpi("Total cost to serve demand", currency(f.totalCostToServeDemand,0))
    ]) },
    { id: "cashflow", title: "Cash flow chart", html: financeComboChart("cashflowBreakEvenChart", rows, { title: "Cash flow and break-even over the selected horizon", xLabel: "Year", yLabel: "€ cash flow", yPrefix: "€", bars: [{ key: "annualCashFlow", label: "Annual cash flow", color: "var(--chart-amber)" }], lines: [{ key: "cumulativeCashFlow", label: "Cumulative cash flow", color: "var(--chart-slate)" }] }) },
    { id: "capex", title: "Capex deployment years", html: `<div class="panel">
      <h3>Capex deployment years</h3>
      ${table(["Year", "Amount", "Reason"], f.capexEvents.map(e => [e.year, currency(e.amount,0), h(e.reason)]))}
    </div>` }
  ];
  return `
    ${sectionTitle("Investment Case", "Review investment return, capex, ROI, break-even and cash generation over the selected horizon.")}
    ${resetControl("investment")}
    ${renderOrderedSections("investment", sections)}`;
}

function annualEventBadge(type) {
  const icons = {
    batteryReplacement: `<span class="event-icon battery-replace" title="Battery replacement"><svg viewBox="0 0 40 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2"></rect><path d="M17 8h2v4h-2z"></path><path d="M29 6a6 6 0 1 1-1 9"></path><path d="M30 5v4h-4"></path></svg></span>`,
    chargerReplacement: `<span class="event-icon charger-replace" title="Charger replacement"><svg viewBox="0 0 40 20" aria-hidden="true"><rect x="5" y="3" width="9" height="13" rx="2"></rect><path d="M9 6v3"></path><path d="M8 9h2"></path><path d="M14 6h3a3 3 0 0 1 3 3v1"></path><path d="M29 6a6 6 0 1 1-1 9"></path><path d="M30 5v4h-4"></path></svg></span>`,
    batteryAugmentation: `<span class="event-icon battery-plus" title="Battery augmentation"><svg viewBox="0 0 40 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2"></rect><path d="M17 8h2v4h-2z"></path><path d="M28 10h8"></path><path d="M32 6v8"></path></svg></span>`
  };
  return icons[type] || "";
}

function renderAnnualFinancials(r) {
  const rows = r.yearByYear.rows.slice(0, state.inputs.investmentHorizon);
  const f = r.financialSummary;
  const chartRows = rows.map(r => ({
    ...r,
    additionalCapex: Math.abs((r.batteryReplacementCapex || 0) + (r.chargerReplacementCapex || 0) + (r.augmentationCapex || 0))
  }));
  const sections = [
    { id: "summary", title: "Annual summary", html: `<div class="grid-4">
      ${kpi("Total sessions served", number(rows.reduce((a,y)=>a+y.sessionsServed,0),0), `Years 1–${state.inputs.investmentHorizon}`)}
      ${kpi("Total delivered energy", kwh(f.lifetimeKwhDelivered,0), "served demand")}
      ${kpi("Total revenue", currency(f.totalRevenue,0), "over selected horizon")}
      ${kpi("Cumulative cash flow", currency(f.cumulativeCashFlow,0), "at horizon end")}
    </div>` },
    { id: "performance", title: "Annual performance trend", cls: "annual-chart-section", html: financeComboChart("annualPerformanceTrend", chartRows, { title: "Annual performance trend", xLabel: "Year", yLabel: "€", yPrefix: "€", bars: [{ key: "annualCashFlow", label: "Annual cash flow", color: "var(--chart-amber)" }], lines: [{ key: "totalRevenue", label: "Revenue", color: "var(--chart-blue)" }, { key: "grossProfit", label: "Gross profit", color: "var(--chart-green)" }, { key: "cumulativeCashFlow", label: "Cumulative cash flow", color: "var(--chart-slate)" }] }) },
    { id: "costs", title: "Annual cost breakdown", cls: "annual-chart-section", html: stackedBarChart("annualCostBreakdown", chartRows, "year", [{ key: "electricityCost", label: "Electricity cost", color: "var(--chart-coral)" }, { key: "totalOperatingCosts", label: "Operating costs", color: "var(--chart-purple)" }, { key: "additionalCapex", label: "Replacement / augmentation capex", color: "var(--chart-orange)" }], { title: "Annual cost breakdown", xLabel: "Year", yLabel: "€ cost", yPrefix: "€" }) },
    { id: "table", title: "Annual table", html: `<div class="panel"><h3>Annual table</h3>${table(["Year", "Sessions served", "Delivered kWh", "Revenue", "Electricity cost", "Gross profit", "Total opex", "Annual cash flow", "Cumulative cash flow"], rows.map(y => [
        y.year,
        number(y.sessionsServed,0),
        number(y.deliveredEnergyServedKwh,0),
        currency(y.totalRevenue,0),
        currency(y.electricityCost,0),
        currency(y.grossProfit,0),
        currency(y.totalOperatingCosts,0),
        currency(y.annualCashFlow,0),
        currency(y.cumulativeCashFlow,0)
      ]))}</div>` },
    { id: "technical", title: "Technical detail", html: `<details><summary>Technical detail</summary><div style="margin-top:12px">${table(["Year", "Required peak kW", "Selected MIC", "Battery SOH", "Battery usable kWh", "Battery replacement", "Charger replacement", "Battery augmentation", "Replacement / augmentation capex"], rows.map(y => [
        y.year,
        number(y.peakDemandRequiredKw,1),
        number(y.selectedMicKva,0),
        pct(y.batterySohEnd,1),
        number(y.batteryUsableEnergyKwh,0),
        y.batteryReplacementTrigger ? annualEventBadge('batteryReplacement') : '',
        y.chargerReplacementTrigger ? annualEventBadge('chargerReplacement') : '',
        y.augmentationFlag ? annualEventBadge('batteryAugmentation') : '',
        currency(y.batteryReplacementCapex + y.chargerReplacementCapex + y.augmentationCapex,0)
      ]))}</div></details>` }
  ];
  return `
    ${sectionTitle("Annual Financials", "Review annual sessions, energy, revenue, costs and cash flow in a readable year-by-year format.")}
    ${renderOrderedSections("annuals", sections)}`;
}

function friendlyScenarioName(s) {
  const platform = s.config?.platform || s.platform || "Scenario";
  const battery = (s.config?.batterySize || s.batterySize || "No battery") === "No battery" ? "Full Grid" : "Grid + Battery";
  return `${platform} — ${battery}`;
}
function architectureName(s) {
  const platform = s.config?.platform || "";
  return platform.includes("Standalone") ? "Standalone Charging Systems" : "Distributed Charging Systems";
}
function scenarioFamilyCell(s) {
  return `<div class="scenario-row-title"><strong>${h(friendlyScenarioName(s))}</strong><span>${h(architectureName(s))}</span></div>`;
}
function scenarioHardwareSummary(s) {
  const cfg = s.config || {};
  const outputs = number(s.derived?.installedOutputs || 0,0);
  if (cfg.platform === "Autel Standalone") return `${cfg.chargerCount} chargers · ${outputs} plugs`;
  return `${cfg.dispenserCount} dispensers · ${outputs} plugs`;
}
function cleanBatteryLabel(value) {
  const raw = String(value || "No battery");
  if (raw === "No battery") return raw;
  return raw
    .replace(/^Autel\s+/i, "")
    .replace(/^Polarium\s+/i, "")
    .replace(/x/g, " × ")
    .replace(/kW\//g, " kW / ")
    .replace(/kWh/g, " kWh")
    .replace(/\s+/g, " ")
    .trim();
}
function cleanChargerLabel(s) {
  const cfg = s.config || {};
  const raw = cfg.platform === "Autel Standalone" ? String(cfg.chargerModel || "") : String(cfg.cabinetType || "");
  return raw
    .replace(/^Autel\s+/i, "")
    .replace(/^Kempower\s+/i, "")
    .replace(/Double Cabinet/g, "Double Cabinet")
    .replace(/DH240\s*—\s*/g, "DH240 · ")
    .replace(/480-960/g, "480–960")
    .trim() || "—";
}
function scenarioMetric(label, value, extra = "") {
  return `<span class="scenario-chip"><small>${h(label)}</small><strong>${value}</strong>${extra ? `<em>${h(extra)}</em>` : ""}</span>`;
}
function scenarioCard(s, tone = "good") {
  const isGood = tone === "good";
  return `<article class="scenario-card ${isGood ? "scenario-card-good" : "scenario-card-bad"}">
    <div class="scenario-card-rank"><span class="rank-pill ${isGood ? "good" : "bad"}">#${s.rank || "—"}</span></div>
    <div class="scenario-card-main">
      <div class="scenario-card-head">
        <div><h4>${h(friendlyScenarioName(s))}</h4><p>${h(architectureName(s))}</p></div>
        <span class="badge ${isGood ? "good" : "bad"}">${isGood ? "Feasible" : h(s.scenarioStatus || "Infeasible")}</span>
      </div>
      ${isGood ? `<div class="scenario-chip-grid">
        ${scenarioMetric("MIC", kva(s.config.selectedMicKva,0))}
        ${scenarioMetric("Battery", h(cleanBatteryLabel(s.config.batterySize)))}
        ${scenarioMetric("Charger/cabinet", h(cleanChargerLabel(s)))}
        ${scenarioMetric("Hardware", h(scenarioHardwareSummary(s)))}
        ${scenarioMetric("Charger output", kw(s.derived?.installedChargerPowerKw || 0,0))}
        ${scenarioMetric("ROI", safePct(s.roi,1))}
        ${scenarioMetric("Cumulative cash flow", currency(s.cumulativeCashFlow,0))}
        ${scenarioMetric("Break-even", s.breakEvenYear || "No break-even")}
      </div>` : `<div class="scenario-fix-layout">
        <div class="scenario-fix-copy"><strong>Failure</strong><span>${h(s.failureReason || s.scenarioStatus || "Technical constraint")}</span></div>
        <div class="scenario-fix-copy"><strong>Suggested fix</strong><span>${h(s.suggestedFix || "Increase MIC, battery support, charger output or installed plugs.")}</span></div>
        <div class="scenario-chip-grid compact">
          ${scenarioMetric("MIC", kva(s.config.selectedMicKva,0))}
          ${scenarioMetric("Battery", h(cleanBatteryLabel(s.config.batterySize)))}
          ${scenarioMetric("Hardware", h(scenarioHardwareSummary(s)))}
          ${scenarioMetric("Charger output", kw(s.derived?.installedChargerPowerKw || 0,0))}
        </div>
      </div>`}
    </div>
  </article>`;
}
function renderScenarioRanking(r) {
  const comp = r.compare;
  const rec = comp.recommended;
  const feasible = (comp.scenarios || []).filter(s => s.technical?.feasible).sort((a,b)=>(a.rank||999)-(b.rank||999));
  const infeasible = (comp.scenarios || []).filter(s => !s.technical?.feasible).sort((a,b)=>(a.rank||999)-(b.rank||999));
  return `
    ${sectionTitle("Scenario Ranking", "Compare scenario families, review feasibility first, and then rank feasible options by ROI.")}
    <div class="scenario-rule-note"><span>ⓘ</span><strong>Scenarios are ranked by technical feasibility first, then ROI within each group.</strong></div>
    ${rec ? `<section class="recommend-card scenario-recommend"><div class="recommend-copy"><span class="eyebrow">Recommended technically feasible configuration</span><h3>${h(friendlyScenarioName(rec))}</h3><p>${h(comp.explanation)}</p></div><div class="recommend-metrics">${kpi("MIC", kva(rec.config.selectedMicKva,0))}${kpi("Battery", h(cleanBatteryLabel(rec.config.batterySize)))}${kpi("Hardware", h(scenarioHardwareSummary(rec)))}${kpi("Charger output", kw(rec.derived?.installedChargerPowerKw || 0,0))}${kpi("ROI", safePct(rec.roi,1))}${kpi("Cumulative CF", currency(rec.cumulativeCashFlow,0))}${kpi("Break-even", rec.breakEvenYear || "No break-even")}${kpi("Status", `<span class='badge good'>Feasible</span>`)}</div></section>` : `<section class="recommend-card no-rec"><div class="recommend-copy"><span class="eyebrow">No feasible configuration in current library</span><h3>No model scenario can be recommended yet</h3><p>The comparison tested auto-sized scenario families, but none passed every technical check. The app will not recommend an infeasible configuration. Review the failed options below and increase MIC, installed plugs, charger output, battery power or battery energy, or reduce demand assumptions.</p></div><div class="recommend-metrics">${kpi("Feasible scenarios", number(comp.technicallyFeasibleCombinations || 0,0))}${kpi("Most common issue", h(comp.commonIssue || "Technical feasibility"))}${kpi("Next action", "Adjust Product Configuration", "then re-run comparison")}</div></section>`}
    <div class="scenario-summary-strip">
      ${kpi("Feasible scenarios", number(feasible.length,0))}
      ${kpi("Infeasible scenarios", number(infeasible.length,0))}
      ${kpi("Ranking rule", "Feasibility first, ROI second")}
    </div>
    <section class="panel scenario-section feasible-section"><h3>✓ Feasible scenarios ranked first</h3><div class="scenario-card-list">${feasible.map(s => scenarioCard(s, "good")).join("") || `<div class="notice">No feasible scenarios under current assumptions.</div>`}</div></section>
    <section class="panel scenario-section infeasible-section"><h3>⚠ Infeasible scenarios</h3><p>These options were reviewed but are not recommendable because they fail one or more technical checks.</p><div class="scenario-card-list">${infeasible.map(s => scenarioCard(s, "bad")).join("") || `<div class="notice good">No infeasible scenarios in this run.</div>`}</div></section>
    <div class="notice scenario-footnote">Ranking is based on technical feasibility first, then ROI among feasible scenarios only. Infeasible scenarios are shown for comparison with recommended fixes.</div>`;
}

const DEVELOPER_GROUPS = [
  {
    title: "Traffic & demand defaults",
    keys: [
      "annualTrafficGrowthRate",
      "siteRelevanceFactor",
      "onRoadBevShareAtCod",
      "bevShareCap",
      "fastChargePropensity",
      "rampUpYear1",
      "rampUpYear2",
      "plugInOverstayOverheadHours",
      "designPeakFloorSessions",
      "annualFailureRateStarting",
      "downtimeImpactFactor"
    ]
  },
  {
    title: "Peak window & power defaults",
    keys: [
      "techUpliftEarlyPhaseRate",
      "techUpliftMiddlePhaseRate",
      "techUpliftCap",
      "durationResponseFactor",
      "peakIntensityFactorCap",
      "powerFactor",
      "operatingHoursPerDay"
    ]
  },
  {
    title: "Grid & connection assumptions",
    keys: [
      "gridThresholdModeling",
      "esbConnectionApplicationFee"
    ]
  },
  {
    title: "Battery technical assumptions",
    keys: [
      "batteryReserve",
      "batteryDispatchFractionUsable",
      "batteryBaseDegradationRate",
      "batteryCyclingDegradationFactor",
      "batteryAugmentationTriggerDeficitKw",
      "overnightRechargeWindowStart",
      "overnightRechargeWindowEnd",
      "overnightRechargeWindowDuration"
    ]
  },
  {
    title: "Commercial, service & warranty assumptions",
    keys: [
      "grossSellingPriceInclVat",
      "annualTariffEscalation",
      "annualElectricityCostEscalation",
      "discountRate",
      "transactionProcessingFeePctRevenue",
      "flatTransactionFeePerSession",
      "managedServiceFeePerChargerAsset",
      "autelChargerWarrantyAnnualRate",
      "kempowerChargerWarrantyAnnualRate",
      "autelBatteryWarrantyAnnualRate",
      "polariumBatteryWarrantyAnnualRate"
    ]
  },
  {
    title: "Lifecycle assumptions",
    keys: [
      "modelHorizon"
    ]
  }
];

const ADVANCED_EXCLUDED_KEYS = new Set([...DEMAND_KEYS, ...SETUP_INPUT_KEYS, "siteAddress", "rawCorridorTrafficAadt", "trafficSourceYear", "investmentHorizon", "modelStartYear", "codYear"]);
const UNIT_MAP = {
  annualTrafficGrowthRate: "%", siteRelevanceFactor: "%", onRoadBevShareAtCod: "%", bevShareCap: "%", fastChargePropensity: "%",
  rampUpYear1: "%", rampUpYear2: "%", annualFailureRateStarting: "%", downtimeImpactFactor: "%",
  grossSellingPriceInclVat: "€/kWh", annualTariffEscalation: "%", annualElectricityCostEscalation: "%", discountRate: "%",
  gridThresholdModeling: "kVA", powerFactor: "%", esbConnectionApplicationFee: "€",
  plugInOverstayOverheadHours: "hours", designPeakFloorSessions: "sessions", techUpliftEarlyPhaseRate: "%", techUpliftMiddlePhaseRate: "%", techUpliftCap: "x", durationResponseFactor: "x", peakIntensityFactorCap: "x",
  batteryReserve: "%", batteryDispatchFractionUsable: "%", batteryBaseDegradationRate: "%", batteryCyclingDegradationFactor: "%", batteryAugmentationTriggerDeficitKw: "kW", overnightRechargeWindowStart: "hour", overnightRechargeWindowEnd: "hour", overnightRechargeWindowDuration: "hours",
  managedServiceFeePerChargerAsset: "€/asset/year", transactionProcessingFeePctRevenue: "%", flatTransactionFeePerSession: "€/session", autelChargerWarrantyAnnualRate: "%", kempowerChargerWarrantyAnnualRate: "%", autelBatteryWarrantyAnnualRate: "%", polariumBatteryWarrantyAnnualRate: "%",
  operatingHoursPerDay: "hours/day", codYear: "year", modelHorizon: "years", modelStartYear: "year"
};
function advancedInputKeys() {
  return [...new Set(DEVELOPER_GROUPS.flatMap(g => g.keys))].filter(k => k in state.inputs && !ADVANCED_EXCLUDED_KEYS.has(k));
}
function significantValue(v, unit) {
  if (!Number.isFinite(Number(v))) return h(v);
  const n = Number(v);
  const display = unit === "%" ? n * 100 : n;
  if (display === 0) return "0";
  return Number(display.toPrecision(3)).toString();
}
function advancedStep(unit) {
  if (unit === "%") return 0.1;
  if (["€/kWh", "x"].includes(unit)) return 0.001;
  if (String(unit || "").startsWith("€")) return 1;
  return "any";
}
const DEVELOPER_NOTES = {
  rawCorridorTrafficAadt: "Raw traffic count used at the start of the model demand chain. It is multiplied by traffic growth and site relevance before BEV share is applied.",
  trafficSourceYear: "Base year of the traffic count. The model grows the AADT from this year to the COD year and then through the model horizon.",
  annualTrafficGrowthRate: "Compounds raw corridor traffic year by year before applying site relevance and BEV share.",
  siteRelevanceFactor: "Converts raw corridor AADT into traffic considered relevant to the site.",
  onRoadBevShareAtCod: "Starting BEV share at commercial operation date. Annual BEV growth compounds from this value.",
  bevShareCap: "Maximum BEV share allowed by the model demand forecast.",
  fastChargePropensity: "Share of BEV traffic that becomes a fast-charge candidate before site capture.",
  rampUpYear1: "Year 1 demand ramp-up factor applied after site capture and limitation factors.",
  rampUpYear2: "Year 2 demand ramp-up factor applied after site capture and limitation factors.",
  plugInOverstayOverheadHours: "Adds plug-in and overstay time to session duration, which affects concurrent sessions and peak kW.",
  designPeakFloorSessions: "Minimum design concurrent session floor used in the model demand logic.",
  peakWindowShare: "Share of daily charging demand in the peak window. This drives peak-window kWh and concurrent session sizing.",
  peakHourShareWithinPeakWindow: "Share of peak-window demand concentrated in the peak hour. This drives max concurrent sessions.",
  baseFleetPlanningPower: "Starting planning power per session used to convert concurrent sessions into peak kW.",
  techUpliftEarlyPhaseRate: "Early-period annual uplift in fleet planning power in the model demand logic.",
  techUpliftMiddlePhaseRate: "Later-period annual uplift in fleet planning power after the early period.",
  techUpliftCap: "Cap applied to technology and duration uplift factors.",
  durationResponseFactor: "Controls how the session duration responds to technology uplift.",
  peakIntensityFactorCap: "Model cap on peak intensity logic where applicable.",
  batteryReserve: "Battery reserve assumption used in available/usable energy logic.",
  batteryDispatchFractionUsable: "Fraction of battery energy treated as dispatchable for peak shaving.",
  batteryReplacementThresholdSoh: "SOH threshold that triggers replacement. This is state of health, not state of charge.",
  batteryBaseDegradationRate: "Base annual battery SOH degradation used in year-by-year battery logic.",
  batteryCyclingDegradationFactor: "Additional battery degradation factor from cycling duty.",
  batteryAugmentationTriggerDeficitKw: "Deficit threshold used by the model augmentation logic.",
  overnightRechargeWindowStart: "Start hour of overnight recharge window.",
  overnightRechargeWindowEnd: "End hour of overnight recharge window.",
  overnightRechargeWindowDuration: "Recharge duration used in overnight recharge checks.",
  gridThresholdModeling: "Grid threshold used for substation / grid treatment in the base model.",
  powerFactor: "Converts between kVA MIC and kW available power.",
  esbConnectionApplicationFee: "ESB connection/application cost input included in capex where applicable.",
  grossSellingPriceInclVat: "Gross selling price including VAT; net price is used for model revenue.",
  discountRate: "Supporting discount rate used for NPV. Hidden from normal users but retained for base model logic.",
  annualTariffEscalation: "Annual escalation applied to selling price in year-by-year revenue.",
  annualElectricityCostEscalation: "Annual escalation applied to electricity purchase cost.",
  managedServiceFeePerChargerAsset: "Fixed managed-service cost component used inside opex.",
  transactionProcessingFeePctRevenue: "Transaction processing cost assumption retained from the base model; hidden from landlord inputs.",
  flatTransactionFeePerSession: "Flat fee per served session retained from the base model; hidden from landlord inputs.",
  autelChargerWarrantyAnnualRate: "Annual charger warranty rate for Autel hardware.",
  kempowerChargerWarrantyAnnualRate: "Annual charger warranty rate for Kempower hardware.",
  autelBatteryWarrantyAnnualRate: "Annual battery warranty rate for Autel batteries.",
  polariumBatteryWarrantyAnnualRate: "Annual battery warranty rate for Polarium batteries.",
  operatingHoursPerDay: "Operating hours assumption retained from the base model.",
  codYear: "Model start year used internally to label the model years.",
  modelHorizon: "Full base model horizon. User-facing investment horizon is selected separately in Investment Case.",
  chargerEquipmentReplacementCycleYears: "Controls the year-by-year charger replacement trigger.",
  siteAddress: "Default address used for the base site screening case.",
  netSellingPriceExVat: "Net selling price excluding VAT used to calculate revenue from served delivered energy.",
  electricityCost: "Electricity purchase cost per delivered kWh.",
  grantSupport: "One-off grant or funding support applied to the initial investment.",
  groundRentPerEvSpace: "Annual fixed rent per EV space used in fixed opex.",
  landlordGpShare: "Share of gross profit paid to the landlord where that commercial structure is used.",
  landlordGrossSalesShare: "Share of gross sales paid to the landlord where that commercial structure is used.",
  averageSessionEnergy: "Average delivered energy per charging session. Default is 30 kWh.",
  annualFailureRateStarting: "Reliability assumption retained from the base Inputs tab.",
  downtimeImpactFactor: "Downtime impact assumption retained from the base Inputs tab.",
  investmentHorizon: "Selected horizon used for investor-facing totals, ROI and scenario ranking."
};
function developerField(key) {
  const dict = ASSUMPTION_DICTIONARY.find(x => x[0] === key);
  const label = dict?.[1] || key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  const note = DEVELOPER_NOTES[key] || dict?.[4] || "This input is retained from the base model and can affect downstream calculations.";
  const unit = UNIT_MAP[key] || dict?.[2] || "";
  const isNumber = typeof DEFAULT_INPUTS[key] === "number";
  const displayValue = isNumber ? significantValue(state.inputs[key], unit) : h(state.inputs[key]);
  return `<div class="field advanced-field"><label for="${key}">${h(label)}${unit ? ` <span class="unit-pill">${h(unit)}</span>` : ""}</label><div class="advanced-input-wrap"><input id="${key}" data-advanced-input="${key}" data-advanced-unit="${h(unit)}" type="${isNumber ? "number" : "text"}" step="${advancedStep(unit)}" value="${displayValue}" /></div><small>${h(note.replace(/Inputs!\w+\d+|Summary!\w+\d+|Demand_Model/gi, "base model"))}</small></div>`;
}
function renderAdvancedSettings() {
  return `
    ${sectionTitle("Advanced Model Settings", "Advanced controls for hidden model inputs that affect the calculations but are not shown in the main investor workflow.")}
    <div class="reset-card" style="border-color:#efd38e;background:linear-gradient(135deg,#fff3d6,#fbfaf7)"><div><strong>Reset all advanced settings to default values</strong><p>Restores the advanced model assumptions to the base default values. Changes here affect demand, feasibility, capex, opex, ROI, cash flow and scenario ranking.</p></div><button class="reset" data-reset="advanced">Reset all</button></div>
    <div class="advanced-groups">
      ${DEVELOPER_GROUPS.map(group => {
        const keys = group.keys.filter(k => advancedInputKeys().includes(k));
        if (!keys.length) return "";
        return `<section class="panel"><h3>${h(group.title)}</h3><p class="advanced-section-note">Only advanced assumptions not already editable in the main workflow are shown here.</p><div class="input-grid three">${keys.map(developerField).join("")}</div></section>`;
      }).join("")}
      <section class="panel"><h3>Approved MIC library</h3><p>The selected MIC must use the model-approved list only. Custom MIC values are not allowed.</p><div class="badges">${MIC_VALUES.map(v => `<span class="badge good">${v} kVA</span>`).join("")}</div></section>
      <section class="panel"><h3>Scenario comparison rule</h3><p>ROI ranking is shown for investor comparison. It does not override the model recommendation rule: recommend the lowest total CAPEX + OPEX technically feasible option over the selected horizon.</p></section>
    </div>`;
}

function guidePanelHtml() {
  const steps = [
    ["site", "Screen the site", "Search the address, confirm AADT source, map location and nearby chargers.", "Open Site Screening", "search"],
    ["demand", "Forecast demand", "Review sessions, annual kWh demand, required plugs and MIC before configuration.", "Open Demand", "trend"],
    ["setup", "Configure the product", "Select platform, MIC, battery, chargers and services. Use the validator for exact fixes.", "Open Configuration", "cube"],
    ["investment", "Review investment case", "Set model start year, horizon and funding assumptions, then review ROI, break-even and cash flow.", "Open Investment Case", "money"],
    ["annuals", "Check annuals", "Review year-by-year revenue, costs, replacements and battery augmentation.", "Open Annuals", "calendar"],
    ["scenario", "Compare scenarios", "Use feasibility-first ranking to compare valid investment options.", "Open Scenarios", "scales"],
    ["advanced", "Fine-tune assumptions", "Review advanced model settings without duplicating normal tab inputs.", "Open Assumptions", "sliders"],
    ["report", "Export investor report", "Generate the final report for sharing with investors or internal review.", "Open Report", "report"]
  ];
  const icon = kind => ({
    search:`<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"></circle><path d="m13 13 4 4"></path></svg>`,
    trend:`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 14 8 9l3 3 6-6"></path><path d="M14 6h3v3"></path></svg>`,
    cube:`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2 17 6v8l-7 4-7-4V6l7-4Z"></path><path d="M3 6l7 4 7-4"></path><path d="M10 10v8"></path></svg>`,
    money:`<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><path d="M10 6v8"></path><path d="M13 7.5c-.5-.8-1.6-1.3-3-1.3-1.8 0-3 .9-3 2.3 0 3.2 6 1.2 6 4 0 1.3-1.2 2.3-3 2.3-1.4 0-2.5-.5-3.1-1.4"></path></svg>`,
    calendar:`<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2"></rect><path d="M6 2.5v4M14 2.5v4M3 8.5h14"></path></svg>`,
    scales:`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M5 17h10M6 5h8"></path><path d="m6 5-3 5h6l-3-5Zm8 0-3 5h6l-3-5Z"></path></svg>`,
    sliders:`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12"></path><circle cx="8" cy="5" r="2"></circle><circle cx="12" cy="10" r="2"></circle><circle cx="6" cy="15" r="2"></circle></svg>`,
    report:`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 2.5h6l4 4V17a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 17V4A1.5 1.5 0 0 1 6.5 2.5Z"></path><path d="M12 2.5V7h4"></path><path d="M8 11h5M8 14h5"></path></svg>`
  }[kind]);
  const cards = steps.map(([tab, title, desc, cta, iconName], index) => `<article class="guide-step-card" data-step="${index+1}"><div class="guide-step-top"><span class="guide-step-number">${index+1}</span><span class="guide-step-chip">Step ${index+1}</span></div><h4>${h(title)}</h4><p>${h(desc)}</p><button type="button" class="guide-step-action" data-guide-tab="${tab}">${icon(iconName)}<span>${h(cta)}</span></button></article>`).join("");
  return `<div class="guide-overlay" id="guideOverlay" hidden></div><aside class="guide-panel" id="guidePanel" aria-hidden="true" hidden><div class="guide-head"><div><span class="eyebrow">Workflow guide</span><h3>How to use this tool</h3><p class="guide-intro">Move through the tabs from left to right, or jump to any step.</p></div><button type="button" id="closeGuide" aria-label="Close guide">×</button></div><div class="guide-flow-grid">${cards}</div><div class="guide-tip"><span>💡</span><p><strong>Tip:</strong> Use the tabs above the workspace to move through the workflow in order.</p></div></aside>`;
}

function firstUseBanner() {
  let dismissed = false;
  try { dismissed = localStorage.getItem("evHub.guide.dismissed") === "true"; } catch (_) {}
  if (dismissed || activeTab !== "site") return "";
  return `<div class="first-use-banner"><div><strong>New to this tool?</strong><p>Start by searching a site address, then follow the progress steps from left to right.</p></div><div><button class="secondary" id="openGuideInline" type="button">Open guide</button><button class="reset" id="dismissGuide" type="button">Dismiss</button></div></div>`;
}

function renderInvestorReport(r) {
  return `
    ${sectionTitle("Investor Report", "Export a clean investor pack and annual financials from the current model selection.")}
    <div class="export-card-grid">
      <section class="export-card primary-export">
        <h3>Investor PDF Pack</h3>
        <p>Exports tabs 1–6 as a polished PDF-ready report: Site Screening, Demand Forecast, Product Configuration, Investment Case, Annual Financials and Scenario Ranking.</p>
        <button class="primary" id="exportInvestorPdf">Export investor PDF</button>
      </section>
      <section class="export-card excel-export">
        <h3>Annual Financials Excel</h3>
        <p>Exports annual sessions, delivered kWh, revenue, electricity cost, gross profit, opex, cash flow and scenario ranking in an Excel-readable workbook.</p>
        <button class="primary" id="exportAnnualExcel">Export annual financials Excel</button>
      </section>
      <section class="export-card technical-export">
        <h3>Supporting CSV files</h3>
        <p>Optional working files for analysts who want the raw demand, annual financials or scenario ranking tables.</p>
        <div class="actions">
          <button class="secondary" id="exportDemand">Demand CSV</button>
          <button class="secondary" id="exportYear">Annual CSV</button>
          <button class="secondary" id="exportScenario">Scenario CSV</button>
        </div>
      </section>
    </div>`;
}

function render() {
  let r;
  const pages = {
    site: () => renderSiteDashboard(),
    demand: () => renderDemandDashboard(r),
    setup: () => renderScenarioSetup(r),
    investment: () => renderInvestmentDashboard(r),
    annuals: () => renderAnnualFinancials(r),
    scenario: () => renderScenarioRanking(r),
    advanced: () => renderAdvancedSettings(r),
    report: () => renderInvestorReport(r)
  };
  try {
    activeTab = VALID_TABS.includes(activeTab) ? activeTab : "site";
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === activeTab));
    updateWorkflowStepper();
    if (activeTab !== "site" && map) {
      resetMapState("leaving site tab");
    }
    r = results();
    el("app").innerHTML = `${firstUseBanner()}${pages[activeTab]()}${guidePanelHtml()}`;
    wirePage(r);
    if (activeTab === "site") setTimeout(() => {
      try { updateMap(); } catch (err) { showMapStatus(`Map could not be rendered: ${err?.message || err}`, true); console.warn("Map could not be rendered", err); }
    }, 100);
  } catch (err) {
    console.error("Dashboard render failed", err);
    el("app").innerHTML = `${sectionTitle("Dashboard render issue", "The tab opened, but a calculation or display component failed.")}
      <div class="notice bad"><strong>${h(activeTab)}</strong> dashboard could not render: ${h(err?.message || err)}</div>
      <div class="panel"><h3>What to do</h3><p>Please send this error back so it can be fixed. Other tabs remain available.</p><pre class="audit-pre">${h(err?.stack || String(err))}</pre></div>`;
  }
}

function wirePage(r) {
  document.querySelectorAll("[data-input]").forEach(node => {
    const eventName = node.type === "range" ? "input" : "change";
    node.addEventListener(eventName, e => {
      const key = e.target.dataset.input;
      const raw = e.target.value;
      const numericKeys = Object.keys(DEFAULT_INPUTS).filter(k => typeof DEFAULT_INPUTS[k] === "number");
      setInput(key, numericKeys.includes(key) ? Number(raw) : raw);
      if (key === "investmentHorizon") setInput(key, Math.max(1, Math.min(20, Number(raw))));
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-advanced-input]").forEach(node => {
    node.addEventListener("change", e => {
      const key = e.target.dataset.advancedInput;
      const unit = e.target.dataset.advancedUnit || "";
      const raw = e.target.value;
      const numericKeys = Object.keys(DEFAULT_INPUTS).filter(k => typeof DEFAULT_INPUTS[k] === "number");
      const value = numericKeys.includes(key) ? (unit === "%" ? Number(raw) / 100 : Number(raw)) : raw;
      setInput(key, value);
      preserveScrollRender();
    });
  });

  document.querySelectorAll("[data-config]").forEach(node => {
    node.addEventListener("change", e => {
      const key = e.target.dataset.config;
      let raw = e.target.value;
      if (["selectedMicKva", "chargerWarrantyYears", "batteryWarrantyYears", "dispenserCount", "chargerCount"].includes(key)) {
        raw = raw === "N/A" ? "N/A" : Number(raw);
      }
      setConfig(key, raw);
      enforceConfigCompatibility();
      preserveScrollRender();
    });
  });

  const searchBtn = el("searchBtn");
  const addressInput = el("addressSearch");
  const searchStatus = el("addressSearchStatus");
  let siteSearchInFlight = false;
  const runSiteSearch = async () => {
    if (siteSearchInFlight) return;
    const address = addressInput?.value?.trim() || "";
    if (!address) {
      if (searchStatus) {
        searchStatus.textContent = "Enter an address or Eircode to start the site search.";
        searchStatus.className = "address-search-status warn";
      }
      return;
    }
    siteSearchInFlight = true;
    mapSearchVersion += 1;
    resetMapState("new address search started");
    if (searchBtn) {
      searchBtn.textContent = "Searching + calculating AADT…";
      searchBtn.disabled = true;
    }
    if (searchStatus) {
      searchStatus.textContent = "Searching address, AADT and nearby chargers. This will time out safely if providers do not respond.";
      searchStatus.className = "address-search-status searching";
    }
    try {
      const ctx = await searchLocation(address, state.filters.radiusKm, { timeoutMs: 18000 });
      setSiteContext(ctx);
      state.inputs.siteAddress = address;
      if (!state.filters.manualAadtOverride && ctx?.traffic?.aadt) {
        state.inputs.rawCorridorTrafficAadt = Number(ctx.traffic.aadt);
        const sourceYear = latestYearFromText(ctx.traffic.aadt_year || ctx.traffic.source || ctx.traffic.reference || "");
        if (sourceYear) state.inputs.trafficSourceYear = sourceYear;
      }
    } catch (err) {
      setSiteContext({
        ok: true,
        site: { name: address, lat: 53.35, lon: -7.70, source: "UI fallback after unexpected search error", confidence: "fallback" },
        traffic: { aadt: 12000, source: "Fallback AADT estimate only — unexpected UI error", confidence: "low / fallback", provider: "UI fallback" },
        chargers: [],
        warning: `Address search failed safely and the button was reset. Detail: ${err?.message || err}`
      });
      state.inputs.siteAddress = address;
    } finally {
      siteSearchInFlight = false;
      if (searchBtn) {
        searchBtn.textContent = "Search";
        searchBtn.disabled = false;
      }
      render();
    }
  };
  if (searchBtn) searchBtn.addEventListener("click", runSiteSearch);
  if (addressInput) addressInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSiteSearch();
    }
  });
  const radius = el("radiusKm");
  if (radius) radius.addEventListener("change", e => { state.filters.radiusKm = Number(e.target.value); render(); });
  const minPower = el("minPower");
  if (minPower) minPower.addEventListener("change", e => { state.filters.minPower = e.target.value; render(); });
  const cat = el("chargerCategory");
  if (cat) cat.addEventListener("change", e => { state.filters.category = e.target.value; render(); });
  const manual = el("manualAadt");
  if (manual) manual.addEventListener("change", e => { state.inputs.rawCorridorTrafficAadt = Number(e.target.value); state.filters.manualAadtOverride = true; render(); });
  const manualFlag = el("manualAadtOverride");
  if (manualFlag) manualFlag.addEventListener("change", e => { state.filters.manualAadtOverride = e.target.value === "true"; render(); });

  const useManualMapPoint = async (lat, lon) => {
    const label = coordinateAddressLabel(lat, lon);
    mapPointSelectMode = false;
    mapSearchVersion += 1;
    resetMapState("manual map point selected");
    if (searchStatus) {
      searchStatus.textContent = `Using selected map point ${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}. Reloading nearby chargers and AADT proxy…`;
      searchStatus.className = "address-search-status searching";
    }
    try {
      const ctx = await searchCoordinates(lat, lon, state.filters.radiusKm, label, { timeoutMs: 18000 });
      setSiteContext(ctx);
      state.inputs.siteAddress = label;
      if (!state.filters.manualAadtOverride && ctx?.traffic?.aadt) {
        state.inputs.rawCorridorTrafficAadt = Number(ctx.traffic.aadt);
        const sourceYear = latestYearFromText(ctx.traffic.aadt_year || ctx.traffic.source || ctx.traffic.reference || "");
        if (sourceYear) state.inputs.trafficSourceYear = sourceYear;
      }
    } catch (err) {
      setSiteContext({
        ok: true,
        site: { name: label, lat: Number(lat), lon: Number(lon), source: "Manual map point", confidence: "manual coordinates" },
        traffic: { aadt: 12000, source: "Fallback AADT estimate only — manual coordinate fallback", confidence: "low / manual coordinate fallback", provider: "Manual coordinate fallback" },
        chargers: [],
        warning: `Manual map point selected, but nearby search failed safely. Detail: ${err?.message || err}`
      });
      state.inputs.siteAddress = label;
    } finally {
      render();
    }
  };

  window.__evHubUseManualMapPoint = useManualMapPoint;

  const selectMapPoint = el("selectMapPoint");
  if (selectMapPoint) selectMapPoint.addEventListener("click", () => {
    mapPointSelectMode = true;
    showMapStatus("Map point selection is active. Click or right-click the exact site location on the map.");
    selectMapPoint.textContent = "Click map to select site";
  });

  const openTiiMap = el("openTiiMap");
  if (openTiiMap) openTiiMap.addEventListener("click", async () => {
    const address = el("addressSearch")?.value?.trim() || state.inputs.siteAddress || "";
    try { if (navigator.clipboard && address) await navigator.clipboard.writeText(address); } catch (_) {}
    window.open("https://trafficdata.tii.ie/publicmultinodemap.asp", "_blank", "noopener");
  });

  const tiiMonthlyFile = el("tiiMonthlyFile");
  if (tiiMonthlyFile) tiiMonthlyFile.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/import-tii-monthly-volume", { method: "POST", body: form });
      const payload = await res.json();
      if (!payload.ok) throw new Error(payload.error || "TII monthly Excel import failed");
      const traffic = payload.traffic;
      state.inputs.rawCorridorTrafficAadt = Number(traffic.aadt);
      const importedYear = latestYearFromText(traffic.aadt_year || traffic.source || traffic.reference || "");
      if (importedYear) state.inputs.trafficSourceYear = importedYear;
      state.filters.manualAadtOverride = false;
      state.siteContext = {
        ...(state.siteContext || {}),
        traffic,
        site: state.siteContext?.site || { name: state.inputs.siteAddress, lat: 51.8879, lon: -8.5920, source: "manual TII report import" },
        chargers: state.siteContext?.chargers || []
      };
      render();
    } catch (err) {
      alert(`Could not import TII Monthly Volume Excel: ${err?.message || err}`);
    }
  });

  document.querySelectorAll("[data-reset]").forEach(button => {
    button.addEventListener("click", e => {
      resetPage(e.currentTarget.dataset.reset);
      render();
    });
  });

  document.querySelectorAll(".section-move").forEach(button => {
    button.addEventListener("click", e => {
      const b = e.currentTarget;
      moveSection(b.dataset.sectionTab, b.dataset.sectionId, Number(b.dataset.direction));
      render();
    });
  });

  const openGuide = () => {
    const panel = el("guidePanel");
    const overlay = el("guideOverlay");
    if (overlay) overlay.hidden = false;
    if (panel) { panel.hidden = false; panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); }
  };
  const closeGuide = () => {
    const panel = el("guidePanel");
    const overlay = el("guideOverlay");
    if (panel) { panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); panel.hidden = true; }
    if (overlay) overlay.hidden = true;
  };
  const guideButton = el("guideButton");
  if (guideButton) guideButton.addEventListener("click", openGuide);
  const openGuideInline = el("openGuideInline");
  if (openGuideInline) openGuideInline.addEventListener("click", openGuide);
  document.querySelectorAll("[data-guide-tab]").forEach(button => {
    button.addEventListener("click", e => {
      activeTab = e.currentTarget.dataset.guideTab || "site";
      closeGuide();
      render();
    });
  });
  const closeGuideBtn = el("closeGuide");
  if (closeGuideBtn) closeGuideBtn.addEventListener("click", closeGuide);
  const guideOverlay = el("guideOverlay");
  if (guideOverlay) guideOverlay.addEventListener("click", closeGuide);
  const dismissGuide = el("dismissGuide");
  if (dismissGuide) dismissGuide.addEventListener("click", () => { try { localStorage.setItem("evHub.guide.dismissed", "true"); } catch (_) {} render(); });


  const exportDemand = el("exportDemand");
  if (exportDemand) exportDemand.addEventListener("click", () => exportDemandCsv(r.demand));
  const exportYear = el("exportYear");
  if (exportYear) exportYear.addEventListener("click", () => exportYearByYearCsv(r.yearByYear));
  const exportScenario = el("exportScenario");
  if (exportScenario) exportScenario.addEventListener("click", () => exportScenarioCsv(r.compare));
  const exportAssumptions = el("exportAssumptions");
  if (exportAssumptions) exportAssumptions.addEventListener("click", () => exportAssumptionsJson(state));
  const exportAudit = el("exportAudit");
  if (exportAudit) exportAudit.addEventListener("click", () => exportAuditJson(state, r));
  const exportInvestorPdfButton = el("exportInvestorPdf");
  if (exportInvestorPdfButton) exportInvestorPdfButton.addEventListener("click", () => exportInvestorPdf(state, r));
  const exportAnnualExcelButton = el("exportAnnualExcel");
  if (exportAnnualExcelButton) exportAnnualExcelButton.addEventListener("click", () => exportAnnualFinancialsExcel(state, r));
}

function enforceConfigCompatibility() {
  if (state.config.platform === "Autel Standalone") {
    state.config.cabinetType = "N/A";
    state.config.dispenserCount = "N/A";
    if (state.config.chargerModel === "N/A") state.config.chargerModel = "Autel DH480 — 320 kW";
    if (state.config.chargerCount === "N/A") state.config.chargerCount = 2;
  } else {
    state.config.chargerModel = "N/A";
    state.config.chargerCount = "N/A";
    const cabinets = cabinetOptions(state.config.platform);
    if (!cabinets.some(x => x.item === state.config.cabinetType)) state.config.cabinetType = cabinets[0]?.item || "N/A";
    if (state.config.dispenserCount === "N/A") state.config.dispenserCount = 2;
  }
  if (state.config.batteryStrategy === "Grid only") state.config.batterySize = "No battery";
  if (state.config.batteryStrategy !== "Grid only" && state.config.batterySize === "No battery") {
    state.config.batterySize = batteryOptionsFor(state.config.platform, state.config.batteryStrategy)[0]?.item || "No battery";
  }
  if (!MIC_VALUES.includes(Number(state.config.selectedMicKva))) state.config.selectedMicKva = 200;
}

function showMapStatus(message, isError = false) {
  const status = el("mapStatus");
  if (status) {
    status.textContent = message;
    status.classList.toggle("bad", Boolean(isError));
  }
}
function mapStyle() {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }]
  };
}
function makeMarker(className, text) {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  return node;
}
function circlePolygon(lon, lat, radiusKm, points = 96) {
  const coords = [];
  const earthRadiusKm = 6371;
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const d = Number(radiusKm) / earthRadiusKm;
  for (let i = 0; i <= points; i++) {
    const brng = 2 * Math.PI * i / points;
    const lat2 = Math.asin(Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(brng));
    const lon2 = lonRad + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(latRad), Math.cos(d) - Math.sin(latRad) * Math.sin(lat2));
    coords.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}
function radiusBounds(lon, lat, radiusKm) {
  const r = Math.max(0.05, Number(radiusKm) || 1);
  const latDelta = r / 111.32;
  const cosLat = Math.max(0.2, Math.abs(Math.cos(lat * Math.PI / 180)));
  const lonDelta = r / (111.32 * cosLat);
  return [[lon - lonDelta, lat - latDelta], [lon + lonDelta, lat + latDelta]];
}
function updateRadiusLayer(lat, lon) {
  if (!map || !mapLoaded || !map.getStyle()) return;
  const data = { type: "FeatureCollection", features: [circlePolygon(lon, lat, state.filters.radiusKm)] };
  if (!map.getSource("radius")) {
    map.addSource("radius", { type: "geojson", data });
    map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "#ef4444", "fill-opacity": 0.08 } });
    map.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": "#ef4444", "line-width": 2 } });
  } else {
    map.getSource("radius").setData(data);
  }
}
function updateMap() {
  const mapDiv = el("map");
  if (!mapDiv) return;
  const ctx = state.siteContext;
  const lat = Number(ctx?.site?.lat ?? 51.8879);
  const lon = Number(ctx?.site?.lon ?? -8.5920);
  if (!window.maplibregl) {
    mapDiv.innerHTML = `<div class="map-fallback">MapLibre did not load. Check internet connection. Site coordinates: ${lat}, ${lon}</div>`;
    return;
  }
  if (map && !map.getContainer().isConnected) {
    resetMapState("map container was replaced during render");
  }
  if (!map) {
    map = new maplibregl.Map({
      container: "map",
      style: mapStyle(),
      center: [lon, lat],
      zoom: 12
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("load", () => { mapLoaded = true; showMapStatus("Map loaded. Radius ring and charger markers update after each search/filter change. Right-click any point to use exact coordinates."); updateMap(); });
    map.on("error", e => { console.warn("MapLibre warning", e); showMapStatus("Map tiles are slow or blocked. The app data still loaded; check internet access if the map remains grey.", true); });
    map.on("contextmenu", e => {
      e.preventDefault();
      const lat = e.lngLat.lat;
      const lon = e.lngLat.lng;
      new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12 })
        .setLngLat([lon, lat])
        .setHTML(`<div class="manual-point-popup"><strong>Use this point as site location?</strong><span>Lat ${number(lat, 6)} · Lon ${number(lon, 6)}</span><button type="button" id="useManualPointPopup">Use this location</button></div>`)
        .addTo(map);
      setTimeout(() => {
        const btn = document.getElementById("useManualPointPopup");
        if (btn) btn.addEventListener("click", () => window.__evHubUseManualMapPoint?.(lat, lon));
      }, 0);
    });
    map.on("click", e => {
      if (!mapPointSelectMode) return;
      e.preventDefault();
      window.__evHubUseManualMapPoint?.(e.lngLat.lat, e.lngLat.lng);
    });
    return;
  }
  map.resize();
  if (!mapLoaded) return;
  const mapKey = currentMapKey(ctx);
  try { map.jumpTo({ center: [lon, lat], zoom: Math.max(map.getZoom() || 12, 11) }); } catch (_) { map.setCenter([lon, lat]); }
  updateRadiusLayer(lat, lon);
  if (siteMarker) siteMarker.remove();
  chargerMarkers.forEach(m => m.remove());
  chargerMarkers = [];
  siteMarker = new maplibregl.Marker({ element: makeMarker("site-marker-el", "⚡") }).setLngLat([lon, lat]).setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(`<strong>${h(ctx?.site?.name || "Selected site")}</strong><br>Selected site`)).addTo(map);
  const chargers = filteredChargers();
  chargers.forEach(charger => {
    const p = maxConnectorPower(charger);
    const marker = new maplibregl.Marker({ element: makeMarker("charger-marker-el", "•") }).setLngLat([charger.lon, charger.lat]).setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<strong>${h(charger.name)}</strong><br>${number(charger.distance_km,2)} km<br>${p == null ? "Power not provided" : kw(p,0)}`)).addTo(map);
    chargerMarkers.push(marker);
  });
  const [sw, ne] = radiusBounds(lon, lat, state.filters.radiusKm);
  const bounds = new maplibregl.LngLatBounds(sw, ne);
  chargers.forEach(charger => bounds.extend([charger.lon, charger.lat]));
  map.fitBounds(bounds, {
    padding: { top: 92, bottom: 74, left: 74, right: 74 },
    maxZoom: 15,
    duration: 450
  });
  lastRenderedMapKey = mapKey;
  const confidence = ctx?.site?.confidence ? ` Location confidence: ${ctx.site.confidence}.` : "";
  showMapStatus(`Map centred on ${h(ctx?.site?.name || "selected site")} at ${number(lat, 5)}, ${number(lon, 5)}. Radius: ${state.filters.radiusKm < 1 ? "500 m" : state.filters.radiusKm + " km"}.${confidence}`);
}

function goTab(tab) {
  tab = TAB_ALIASES[tab] || tab;
  if (!VALID_TABS.includes(tab)) tab = "site";
  activeTab = tab;
  if (window.location.hash !== `#${tab}`) window.location.hash = tab;
  else render();
}

window.__evHubGoTab = goTab;

const stepper = document.getElementById("workflowStepper");
if (stepper) stepper.addEventListener("click", e => {
  const button = e.target.closest("button[data-step-tab]");
  if (button) goTab(button.dataset.stepTab);
});

document.getElementById("tabs").addEventListener("click", e => {
  const button = e.target.closest("button[data-tab]");
  if (button) goTab(button.dataset.tab);
});

window.addEventListener("hashchange", () => {
  activeTab = tabFromHash();
  render();
});

render();
