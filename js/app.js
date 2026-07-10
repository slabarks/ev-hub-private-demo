import { state, setInput, setConfig, setSiteContext, resetState } from "./state.js";
import { MIC_VALUES, DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, ASSUMPTION_DICTIONARY } from "./data/defaultAssumptions.js";
import { PLATFORM_LIBRARY, cabinetOptions, standaloneChargerOptions, effectiveCabinetMaxDualDisp, kempowerTripleCabinetCount } from "./data/platformLibrary.js";
import { batteryOptionsFor } from "./data/batteryLibrary.js";
import { calculateDemand } from "./engines/demandEngine.js";
import { calculateYearByYear, summariseFinancials } from "./engines/financialEngine.js";
import { compareExcelScenarios } from "./engines/optimizerEngine.js";
import { searchLocation, searchCoordinates, filterChargers, maxConnectorPower, totalConnectors, categoryForPower } from "./providers/addressProviders.js";
import { MOCK_LOCATION } from "./providers/mockProviders.js";
import { lineChart, stackedBarChart, financeComboChart } from "./ui/charts.js";
import { currency, number, pct, kw, kwh, kva } from "./utils.js";
import { exportDemandCsv, exportYearByYearCsv, exportScenarioCsv, exportAssumptionsJson, exportAuditJson, exportAnnualFinancialsExcel, exportInvestorPdf, exportPortfolioFinancialsExcel, exportPortfolioFinancialsPdf } from "./engines/exportEngine.js";
import { PORTFOLIO_CALIBRATION_SITES } from "./data/operatingHubCalibrationLibrary.js";
import { actualCapexForSite, capexStatusForSite, capexNoteForSite } from "./data/capexCalibrationLibrary.js";
import { zeviFundingForSite, zeviFundingSuggestionsForSite, zeviFundingShortLabel } from "./data/zeviFundingLibrary.js";

const VALID_TABS = ["site", "demand", "setup", "investment", "annuals", "scenario", "portfolio", "portfolioFinancials", "advanced", "report"];
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
let aadtMarkers = [];
let mapSearchVersion = 0;
let lastRenderedMapKey = null;
let mapPointSelectMode = false;
let pendingPortfolioSiteSearch = null;

function results() {
  const demand = calculateDemand(state.inputs);
  const yearByYear = calculateYearByYear(state.inputs, state.config, demand);
  const financialSummary = summariseFinancials(state.inputs, state.config, demand, yearByYear, state.inputs.investmentHorizon);
  const compare = compareExcelScenarios(state.inputs, demand, state.inputs.investmentHorizon);
  return { demand, yearByYear, financialSummary, compare };
}

function el(id) { return document.getElementById(id); }
function h(v) { return String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }


const GRANT_METADATA_KEYS = [
  "grantSupportSourceLabel",
  "grantSupportScheme",
  "grantSupportMatchConfidence",
  "grantSupportSourceType",
  "grantSupportChargersFunded",
  "grantSupportEvSpacesFunded",
  "grantSupportMatchNotes",
  "grantSupportAutoApplied",
  "grantSupportMatchKey",
  "grantSupportMatchedSiteName",
  "grantSupportReviewRequired"
];
let grantSupportManualOverride = false;

function clearGrantSupportMetadata() {
  GRANT_METADATA_KEYS.forEach(key => { delete state.inputs[key]; });
  delete state.inputs.grantSupportSuggestion;
}

function grantFundingContextFromSite(site = {}) {
  return {
    portfolioSiteId: site.id || site.portfolioSiteId,
    name: site.name || site.siteName,
    siteName: site.liveActuals?.siteName || site.name || site.siteName,
    address: site.address,
    aliases: [site.modelEquivalentSummary, site.aadtCounter, site.liveActuals?.siteName].filter(Boolean),
    site
  };
}

function grantFundingContextFromCurrent(extra = {}) {
  const site = state.siteContext?.site || {};
  return {
    name: site.name || state.inputs.siteAddress,
    siteName: site.name || state.inputs.siteAddress,
    address: site.display_address || state.inputs.siteAddress,
    searchText: state.inputs.siteAddress,
    aliases: [state.inputs.siteAddress, state.siteContext?.traffic?.source, state.siteContext?.traffic?.method_note].filter(Boolean),
    site,
    ...extra
  };
}

function applyZeviFundingMatch(match, options = {}) {
  if (!match) return false;
  const force = !!options.force;
  if (!force && grantSupportManualOverride && Number(state.inputs.grantSupport || 0) !== 0) {
    state.inputs.grantSupportSuggestion = match;
    return false;
  }
  if (!force && match.autoApply === false) {
    state.inputs.grantSupportSuggestion = match;
    return false;
  }
  const amount = Number(match.grantAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  setInput("grantSupport", amount);
  state.inputs.grantSupportSourceLabel = match.sourceLabel || "ZEVI funding database";
  state.inputs.grantSupportScheme = match.scheme || "";
  state.inputs.grantSupportMatchConfidence = match.confidenceLabel || match.confidence || "";
  state.inputs.grantSupportSourceType = match.sourceType || "";
  state.inputs.grantSupportChargersFunded = Number(match.chargersFunded || 0);
  state.inputs.grantSupportEvSpacesFunded = Number(match.evSpacesFunded || 0);
  state.inputs.grantSupportMatchNotes = match.matchNotes || match.matchType || "";
  state.inputs.grantSupportAutoApplied = true;
  state.inputs.grantSupportMatchKey = match.id || match.siteName || "";
  state.inputs.grantSupportMatchedSiteName = match.siteName || "";
  state.inputs.grantSupportReviewRequired = !!match.reviewRequired || match.confidence === "medium";
  delete state.inputs.grantSupportSuggestion;
  grantSupportManualOverride = false;
  return true;
}

function autoApplyZeviFundingForContext(context = {}, options = {}) {
  const match = zeviFundingForSite(context, { allowAllocationExact: true });
  if (match) {
    if (match.autoApply || options.force) return applyZeviFundingMatch(match, options);
    state.inputs.grantSupportSuggestion = match;
    return false;
  }
  const suggestions = zeviFundingSuggestionsForSite(context, { includeAllocation: true });
  if (suggestions.length) state.inputs.grantSupportSuggestion = suggestions[0];
  else if (!options.keepExistingSuggestion) delete state.inputs.grantSupportSuggestion;
  return false;
}

function grantSupportStatusHtml() {
  const amount = Number(state.inputs.grantSupport || 0);
  const applied = amount > 0 && state.inputs.grantSupportAutoApplied;
  const suggestion = state.inputs.grantSupportSuggestion;
  if (applied) {
    const tone = state.inputs.grantSupportReviewRequired ? "warn" : "good";
    const parts = [state.inputs.grantSupportScheme, currency(amount, 0), state.inputs.grantSupportMatchedSiteName].filter(Boolean).join(" · ");
    const funded = `${number(state.inputs.grantSupportChargersFunded || 0,0)} charger${Number(state.inputs.grantSupportChargersFunded) === 1 ? "" : "s"} / ${number(state.inputs.grantSupportEvSpacesFunded || 0,0)} EV spaces funded`;
    return `<div class="grant-support-card ${tone}"><div><strong>ZEVI grant auto-applied</strong><p>${h(parts)}<br><span>${h(funded)} · ${h(state.inputs.grantSupportMatchConfidence || "")}</span></p>${state.inputs.grantSupportMatchNotes ? `<small>${h(state.inputs.grantSupportMatchNotes)}</small>` : ""}</div><button type="button" class="secondary small" id="clearZeviGrant">Clear</button></div>`;
  }
  if (suggestion) {
    const canApply = suggestion.autoApply || suggestion.sourceType === "confirmed-matched";
    return `<div class="grant-support-card warn"><div><strong>Possible ZEVI funding match</strong><p>${h(zeviFundingShortLabel(suggestion))}<br><span>${h(suggestion.siteName || "")} · ${h(suggestion.confidenceLabel || "review required")}</span></p><small>${canApply ? "Click Apply if this is the correct funding record." : "Not auto-applied because this allocation is generic, duplicate or not confirmed."}</small></div>${canApply ? `<button type="button" class="secondary small" id="applyZeviGrantSuggestion">Apply</button>` : ""}</div>`;
  }
  if (amount > 0) return `<div class="grant-support-card neutral"><div><strong>Manual grant support</strong><p>${h(currency(amount, 0))} is applied manually. ZEVI auto-matching will not overwrite this unless a portfolio site is loaded.</p></div><button type="button" class="secondary small" id="clearZeviGrant">Clear</button></div>`;
  return `<small class="grant-support-muted">If this site has a safe ZEVI funding match, the grant is auto-populated here. Fuzzy or generic matches are shown as review suggestions only.</small>`;
}

function grantSupportField() {
  const baseField = inputField("grantSupport", "Grant support", { step: 1000, unit: "€", help: "One-off funding support that reduces the net initial investment. Safe ZEVI funding matches are auto-populated; uncertain matches are shown for review only." });
  return `${baseField}${grantSupportStatusHtml()}`;
}
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

function portfolioSiteTraffic(site, baseTraffic = {}) {
  const portfolioAadt = Number(site?.aadt || 0);
  return {
    ...baseTraffic,
    aadt: Number.isFinite(portfolioAadt) && portfolioAadt > 0 ? portfolioAadt : Number(baseTraffic?.aadt || 0),
    source: site?.aadtCounter || baseTraffic?.source || "Portfolio calibration matched AADT",
    confidence: site?.aadtConfidence || baseTraffic?.confidence || "portfolio matched",
    provider: "Portfolio calibration library",
    counter_id: Array.isArray(site?.aadtCounterIds) ? site.aadtCounterIds.join(", ") : site?.aadtCounterIds,
    sample_mode: site?.aadtAggregationMethod || "curated portfolio mapping",
    method_note: site?.aadtBasisNote || "AADT, MIC and model-equivalent charger configuration are preserved from the operating hub calibration record. Map coordinates and nearby chargers are refreshed through the normal Site Screening search."
  };
}

function portfolioSearchContext(ctx, site) {
  const base = ctx && typeof ctx === "object" ? ctx : {};
  const baseSite = base.site || {};
  const portfolioName = site?.name || baseSite.name || site?.address || "Portfolio site";
  const originalWarning = base.warning ? `${base.warning} ` : "";
  const libLat = Number(site?.lat || 0);
  const libLon = Number(site?.lon || 0);
  const hasLibraryCoords = libLat > 50 && libLat < 56 && libLon > -11 && libLon < -5;
  // If the library has precise curated coordinates, prefer them over the geocoder result
  // to ensure the map pin lands on the exact site rather than a general area.
  const finalLat = hasLibraryCoords ? libLat : (baseSite.lat || libLat);
  const finalLon = hasLibraryCoords ? libLon : (baseSite.lon || libLon);
  return {
    ...base,
    ok: true,
    site: {
      ...baseSite,
      name: portfolioName,
      display_address: site?.address || baseSite.display_address || baseSite.name || portfolioName,
      lat: finalLat,
      lon: finalLon,
      source: hasLibraryCoords ? "Portfolio calibration — precise curated coordinates" : (baseSite.source ? `${baseSite.source} + portfolio calibration load` : "Portfolio calibration load"),
      confidence: hasLibraryCoords ? "portfolio curated" : (baseSite.confidence || "portfolio search")
    },
    traffic: portfolioSiteTraffic(site, base.traffic || {}),
    chargers: Array.isArray(base.chargers) ? base.chargers : [],
    warning: `${originalWarning}Portfolio site loaded through Site Screening. The map and nearby chargers were refreshed; portfolio MIC, matched AADT and product configuration were preserved.`,
    debug: { ...(base.debug || {}), portfolio_site_id: site?.id, portfolio_search_load: true }
  };
}

function nextApprovedMic(required) {
  return MIC_VALUES.find(v => v >= required) || MIC_VALUES[MIC_VALUES.length - 1];
}
function modelMicForPortfolioSite(site) {
  const actualMic = Number(site?.realMicKva || site?.modelConfig?.selectedMicKva || 0);
  if (!Number.isFinite(actualMic) || actualMic <= 0) return state.config.selectedMicKva;
  return nextApprovedMic(actualMic);
}
function applyPortfolioSiteModelConfig(site) {
  if (!portfolioCanLoadSite(site)) return false;
  Object.assign(state.config, site?.modelConfig || {});
  const modelMic = modelMicForPortfolioSite(site);
  if (Number.isFinite(Number(modelMic)) && Number(modelMic) > 0) state.config.selectedMicKva = Number(modelMic);
  enforceConfigCompatibility();
  if (Number.isFinite(Number(modelMic)) && MIC_VALUES.includes(Number(modelMic))) state.config.selectedMicKva = Number(modelMic);
  const actualCapex = Number(site?.actualCapexExVat || actualCapexForSite(site) || 0);
  if (actualCapex > 0) {
    state.config.actualInitialCapexOverride = actualCapex;
    state.config.capexSourceLabel = "Actual project CAPEX loaded from Portfolio Calibration";
  } else {
    delete state.config.actualInitialCapexOverride;
    state.config.capexSourceLabel = "Calibrated/model CAPEX estimate — actual project CAPEX not provided";
  }
  autoApplyZeviFundingForContext(grantFundingContextFromSite(site), { force: true });
  return true;
}
function dualUnitLabel() { return state.config.platform === "Autel Standalone" ? "charger" : "dual dispenser / satellite"; }
function selectedCabinetMaxDualDisp(config = state.config) {
  if (!String(config.platform || "").includes("Distributed")) return null;
  const cabinet = PLATFORM_LIBRARY.find(x => x.item === config.cabinetType && x.type === "Cabinet" && x.platform === config.platform);
  return effectiveCabinetMaxDualDisp(config, cabinet);
}
function dispenserLimitHelp(config = state.config) {
  const max = selectedCabinetMaxDualDisp(config);
  if (max == null) return "Not used for standalone chargers.";
  const countNote = String(config.platform || "") === "Kempower Distributed" && String(config.cabinetType || "") === "Kempower Triple Cabinet" ? ` (${kempowerTripleCabinetCount(config)} triple cabinet${kempowerTripleCabinetCount(config) === 1 ? "" : "s"})` : "";
  return `${config.cabinetType}${countNote} supports up to ${max} dual dispenser${max === 1 ? "" : "s"} / satellite${max === 1 ? "" : "s"}. Values above this are automatically reduced to the cabinet limit.`;
}
function inputField(key, label, opts = {}) {
  const value = state.inputs[key];
  const type = opts.type || "number";
  const unit = opts.unit ? `<span class="input-unit">${h(opts.unit)}</span>` : "";
  return `<div class="field"><label for="${key}">${label}</label><div class="unit-input-wrap"><input id="${key}" data-input="${key}" type="${type}" step="${opts.step ?? "any"}" value="${h(value)}" ${opts.min != null ? `min="${opts.min}"` : ""} ${opts.max != null ? `max="${opts.max}"` : ""}/>${unit}</div><small>${opts.help || ""}</small></div>`;
}
function selectField(key, label, options, opts = {}) {
  return `<div class="field"><label for="${key}">${label}</label><select id="${key}" data-input="${key}">${options.map(o => `<option value="${h(o)}" ${String(state.inputs[key]) === String(o) ? "selected" : ""}>${h(o)}</option>`).join("")}</select><small>${opts.help || ""}</small></div>`;
}
function selectFieldConfig(key, label, options, opts = {}) {
  return `<div class="field"><label for="${key}">${label}</label><select id="${key}" data-config="${key}">${options.map(o => `<option value="${h(o)}" ${String(state.config[key]) === String(o) ? "selected" : ""}>${h(o)}</option>`).join("")}</select><small>${opts.help || ""}</small></div>`;
}
function inputFieldConfig(key, label, opts = {}) {
  const value = state.config[key];
  const unit = opts.unit ? `<span class="input-unit">${h(opts.unit)}</span>` : "";
  return `<div class="field"><label for="${key}">${label}</label><div class="unit-input-wrap"><input id="${key}" data-config="${key}" type="${opts.type || "number"}" step="${opts.step ?? "any"}" value="${h(value)}" ${opts.min != null ? `min="${opts.min}"` : ""} ${opts.max != null ? `max="${opts.max}"` : ""}/>${unit}</div><small>${opts.help || ""}</small></div>`;
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
function aadtHelpText() {
  return "AADT means Annual Average Daily Traffic — the estimated average number of vehicles passing a location per day over a year. The model uses it as the starting point for demand forecasting.";
}

const PORTFOLIO_LIVE_ACTUALS_STORAGE_KEY = "evHub.portfolio.liveActuals.v35_40";
const PORTFOLIO_LIVE_ACTUALS_LEGACY_KEYS = ["evHub.portfolio.liveActuals.v1", "evHub.portfolio.liveActuals.v35_39"];
function portfolioSnapshotLooksSafe(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.siteActuals)) return false;
  const parsed = [...(snapshot.parsedFiles || []), ...(snapshot.siteActuals || []).flatMap(item => [item?.actual?.sourceFile, item?.sourceFile].filter(Boolean))]
    .join(" ")
    .toLowerCase();
  if (/running[_\s-]*total|cumulative/.test(parsed)) return false;
  return true;
}
let portfolioLiveActualsSnapshot = (() => {
  try {
    PORTFOLIO_LIVE_ACTUALS_LEGACY_KEYS.forEach(key => sessionStorage.removeItem(key));
    const raw = sessionStorage.getItem(PORTFOLIO_LIVE_ACTUALS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!portfolioSnapshotLooksSafe(parsed)) {
      sessionStorage.removeItem(PORTFOLIO_LIVE_ACTUALS_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (_) { return null; }
})();
let portfolioLiveUploadError = null;

function normalisePortfolioLiveKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(dc|kw|kwh|epower|everyday|ev|charger|charging)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function portfolioLiveActualIndex(snapshot = portfolioLiveActualsSnapshot) {
  const index = new Map();
  (snapshot?.siteActuals || []).forEach(item => {
    const keys = [item.siteKey, item.siteName, item.name].map(normalisePortfolioLiveKey).filter(Boolean);
    keys.forEach(key => index.set(key, item));
  });
  return index;
}
const PORTFOLIO_LIVE_NUMERIC_ACTUAL_KEYS = ["rolling30Kwh", "rolling30Sessions", "rolling30NetRevenue", "dailyKwh", "dailySessions", "annualKwh", "annualSessions", "annualNetRevenue"];
function positiveLiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function liveActualHasPositiveValue(actual = {}) {
  return PORTFOLIO_LIVE_NUMERIC_ACTUAL_KEYS.some(key => positiveLiveNumber(actual[key]) != null);
}
function portfolioMergeLiveActual(site, liveItem) {
  if (!liveItem?.actual) return site;
  const liveActual = { ...liveItem.actual };
  const mergedActual = { ...(site.actual || {}) };
  let appliedPositiveCount = 0;
  PORTFOLIO_LIVE_NUMERIC_ACTUAL_KEYS.forEach(key => {
    const value = positiveLiveNumber(liveActual[key]);
    if (value != null) {
      mergedActual[key] = value;
      appliedPositiveCount += 1;
    }
  });
  ["asOfDate", "sourceFile", "source", "siteName", "firstActiveDate"].forEach(key => {
    if (liveActual[key]) mergedActual[key] = liveActual[key];
  });
  const capex = Number(site.actualCapexExVat || actualCapexForSite(site) || actualCapexForSite(liveItem.siteName) || 0);
  const applied = appliedPositiveCount > 0;
  const retainedExisting = !applied && liveActualHasPositiveValue(site.actual || {});
  return {
    ...site,
    ...(capex > 0 ? { actualCapexExVat: capex } : {}),
    capexStatus: site.capexStatus || capexStatusForSite(site),
    capexCalibrationNote: site.capexCalibrationNote || capexNoteForSite(site),
    actual: mergedActual,
    maturity: applied ? { ...(site.maturity || {}), ...(liveItem.maturity || {}) } : { ...(site.maturity || {}) },
    liveActuals: {
      source: applied ? "uploaded" : retainedExisting ? "uploaded_zero_retained_existing" : "uploaded_no_positive_actual",
      actualSourceStatus: applied ? "uploaded live actual" : retainedExisting ? "uploaded zero/blank ignored; existing actual retained" : "uploaded zero/blank ignored; no actual available",
      siteName: liveItem.siteName,
      asOfDate: liveActual.asOfDate || portfolioLiveActualsSnapshot?.latestDate,
      sourceFile: liveActual.sourceFile || portfolioLiveActualsSnapshot?.parsedFiles?.join(", "),
      diagnostics: liveItem.diagnostics || {},
      mergeApplied: applied,
      zeroOverwriteBlocked: !applied
    }
  };
}
function portfolioMarkMissingFromLatestUpload(site) {
  if (!portfolioLiveActualsSnapshot) return site;
  return {
    ...site,
    liveActuals: {
      ...(site.liveActuals || {}),
      source: "missing_from_latest_upload",
      actualSourceStatus: liveActualHasPositiveValue(site.actual || {}) ? "missing from latest upload; existing/static actual retained" : "missing from latest upload; no actual available",
      siteName: site.name,
      asOfDate: portfolioLiveActualsSnapshot.latestDate || site.liveActuals?.asOfDate,
      sourceFile: portfolioLiveActualsSnapshot.parsedFiles?.join(", ") || site.liveActuals?.sourceFile,
      mergeApplied: false
    }
  };
}
function portfolioActualSourceLabel(site) {
  const status = site?.liveActuals?.actualSourceStatus;
  if (status) return status;
  if (liveActualHasPositiveValue(site?.actual || {})) return "static baseline actual";
  return "no actual";
}
function portfolioLoadBlockReason(site) {
  if (!site) return "No site selected.";
  if (site.uploadedNeedsSetup) return site.loadBlockReason || "This uploaded live site has actual performance data, but it does not yet have confirmed MIC, AADT and model-equivalent charger configuration in the static calibration library.";
  if (site.loadBlocked) return site.loadBlockReason || "This site is shown for reference but cannot be loaded into the model.";
  return "";
}
function portfolioCanLoadSite(site) {
  return !!site && !portfolioLoadBlockReason(site);
}
function portfolioCapexInfo(site, modelInitialCapex = 0) {
  const actual = Number(site?.actualCapexExVat || actualCapexForSite(site) || 0);
  const model = Number(modelInitialCapex || 0);
  const note = site?.capexCalibrationNote || capexNoteForSite(site);
  return { actual, model, note, variance: actual > 0 && Number.isFinite(model) ? model - actual : null };
}
function portfolioExcludedFromActivePortfolio(site) {
  return !!(site?.retiredFromPortfolio || site?.excludeFromPortfolio || site?.excludeFromLiveUploads);
}
function portfolioMappedSites() {
  const liveIndex = portfolioLiveActualIndex();
  return PORTFOLIO_CALIBRATION_SITES.flatMap(site => {
    const candidateKeys = [site.name, site.id, site.modelEquivalentSummary, site.actualHardwareSummary]
      .map(normalisePortfolioLiveKey)
      .filter(Boolean);
    const liveItem = candidateKeys.map(key => liveIndex.get(key)).find(Boolean);
    if (portfolioExcludedFromActivePortfolio(site)) return [];
    if (site.displayInPortfolio === false && !(site.includeWhenLiveUploaded && liveItem)) return [];
    const merged = liveItem ? portfolioMergeLiveActual(site, liveItem) : portfolioMarkMissingFromLatestUpload(site);
    const zeviFunding = zeviFundingForSite(grantFundingContextFromSite(merged), { allowAllocationExact: true });
    return [zeviFunding ? { ...merged, zeviFunding } : merged];
  });
}
function portfolioAdditionalLiveSites(mappedSites = portfolioMappedSites()) {
  const actuals = portfolioLiveActualsSnapshot?.siteActuals || [];
  if (!actuals.length) return [];
  const matchedKeys = new Set(mappedSites.flatMap(s => [s.name, s.id, s.liveActuals?.siteName, s.modelEquivalentSummary].map(normalisePortfolioLiveKey).filter(Boolean)));
  const retiredKeys = new Set(PORTFOLIO_CALIBRATION_SITES.filter(s => portfolioExcludedFromActivePortfolio(s)).flatMap(s => [s.name, s.id, s.modelEquivalentSummary, s.actualHardwareSummary].map(normalisePortfolioLiveKey).filter(Boolean)));
  return actuals
    .filter(a => !matchedKeys.has(normalisePortfolioLiveKey(a.siteName)))
    .filter(a => !retiredKeys.has(normalisePortfolioLiveKey(a.siteName)))
    .map((a, index) => {
      const actual = a.actual || {};
      const chargerCount = Number(a.diagnostics?.chargerCount || 0);
      const capex = actualCapexForSite(a.siteName);
      return {
        id: `uploaded:${a.siteKey || normalisePortfolioLiveKey(a.siteName) || index}`,
        name: a.siteName || `Uploaded live site ${index + 1}`,
        address: "Uploaded live site — setup required",
        categoryKey: "review",
        aadt: 0,
        aadtConfidence: "setup required",
        aadtCounter: "No matched AADT yet",
        realMicKva: 0,
        modelEquivalentPlugs: chargerCount > 0 ? chargerCount * 2 : 0,
        modelEquivalentSummary: "Uploaded live actuals only — MIC, AADT and charger setup required",
        ...(capex > 0 ? { actualCapexExVat: capex } : {}),
        capexStatus: capexStatusForSite(a.siteName),
        capexCalibrationNote: capexNoteForSite(a.siteName),
        zeviFunding: zeviFundingForSite({ siteName: a.siteName, name: a.siteName }, { allowAllocationExact: true }),
        actual: { ...actual },
        maturity: { ...(a.maturity || {}), tier: a.maturity?.tier || "review" },
        liveActuals: { source: "uploaded", siteName: a.siteName, asOfDate: actual.asOfDate || portfolioLiveActualsSnapshot?.latestDate, diagnostics: a.diagnostics || {} },
        uploadedNeedsSetup: true,
        loadBlockReason: "This site is visible because live data was uploaded, but it cannot be loaded until a supported static setup record confirms MIC, AADT and model-equivalent charger configuration."
      };
    });
}
function portfolioSites(options = {}) {
  const mapped = portfolioMappedSites();
  return options.includeAdditional ? [...mapped, ...portfolioAdditionalLiveSites(mapped)] : mapped;
}
function portfolioLiveActualStatus(sites = portfolioMappedSites()) {
  const liveIndex = portfolioLiveActualIndex();
  const matchedCleanSites = sites.filter(s => s.liveActuals?.source === "uploaded").length;
  const retainedMissing = sites.filter(s => s.liveActuals?.source === "missing_from_latest_upload" || s.liveActuals?.zeroOverwriteBlocked).length;
  const actuals = portfolioLiveActualsSnapshot?.siteActuals || [];
  const matchedKeys = new Set(sites.filter(s => s.liveActuals?.source === "uploaded").map(s => normalisePortfolioLiveKey(s.liveActuals.siteName || s.name)));
  const retiredKeys = new Set(PORTFOLIO_CALIBRATION_SITES.filter(s => portfolioExcludedFromActivePortfolio(s)).flatMap(s => [s.name, s.id, s.modelEquivalentSummary, s.actualHardwareSummary].map(normalisePortfolioLiveKey).filter(Boolean)));
  const additional = actuals.filter(a => !matchedKeys.has(normalisePortfolioLiveKey(a.siteName)) && !retiredKeys.has(normalisePortfolioLiveKey(a.siteName))).length;
  return { matchedCleanSites, retainedMissing, additional, uploadedSiteCount: actuals.length, hasLive: !!portfolioLiveActualsSnapshot, liveIndexSize: liveIndex.size, activeSiteCount: sites.length };
}
function savePortfolioLiveActuals(snapshot) {
  PORTFOLIO_LIVE_ACTUALS_LEGACY_KEYS.forEach(key => { try { sessionStorage.removeItem(key); } catch (_) {} });
  portfolioLiveActualsSnapshot = portfolioSnapshotLooksSafe(snapshot) ? snapshot : null;
  portfolioLiveUploadError = null;
  try {
    if (portfolioLiveActualsSnapshot) sessionStorage.setItem(PORTFOLIO_LIVE_ACTUALS_STORAGE_KEY, JSON.stringify(portfolioLiveActualsSnapshot));
    else sessionStorage.removeItem(PORTFOLIO_LIVE_ACTUALS_STORAGE_KEY);
  } catch (_) {}
}
function clearPortfolioLiveActuals() {
  portfolioLiveActualsSnapshot = null;
  portfolioLiveUploadError = null;
  try {
    sessionStorage.removeItem(PORTFOLIO_LIVE_ACTUALS_STORAGE_KEY);
    PORTFOLIO_LIVE_ACTUALS_LEGACY_KEYS.forEach(key => sessionStorage.removeItem(key));
  } catch (_) {}
}
function portfolioLiveCalibrationCard(sites = portfolioMappedSites()) {
  const status = portfolioLiveActualStatus(sites);
  const hasLive = status.hasLive;
  const latest = portfolioLiveActualsSnapshot?.latestDate || "—";
  const parsedFiles = portfolioLiveActualsSnapshot?.parsedFiles || [];
  const rawWarnings = portfolioLiveActualsSnapshot?.warnings || [];
  const supportingFiles = [...(portfolioLiveActualsSnapshot?.supportingFiles || []), ...rawWarnings.filter(w => String(w).includes("supporting file"))];
  const warnings = rawWarnings.filter(w => !String(w).includes("supporting file"));
  const requiredFiles = ["Daily_Charger_kWh.xlsx"];
  const recommendedFiles = ["Daily_Charger_kWh.xlsx", "Daily_kWh_All_Sites.xlsx", "Daily_Euro_All_Sites.xlsx", "Rolling_30_Day_Total_-_Euro_All_Sites.xlsx", "kWh_-_Per_Socket.xlsx", "ePF_-_Overview_Averages.xlsx"];
  const optionalFiles = ["ePower_Funded_-_Monthly_kWh_Total.xlsx", "kWh_-_Running_Total.xlsx", "ePF_-_Overview_Energy_-_Daily.xlsx", "ePF_-_Overview_Energy_-_Weekly.xlsx", "ePF_-_Overview_Value_-_Daily.xlsx", "ePF_-_Overview_Value_-_Weekly.xlsx"];
  const todo = portfolioLiveUploadError?.what_to_do || portfolioLiveUploadError?.whatToDo || ["Upload Daily_Charger_kWh.xlsx or the full recommended pack.", "Check the file includes Date of start_time, charge_point_name, Total charge_amount and transaction_id Count columns."];
  const errorHtml = portfolioLiveUploadError ? `<div class="notice bad"><strong>Upload could not be used.</strong><br>${h(portfolioLiveUploadError.message || portfolioLiveUploadError.error || "Could not validate uploaded files.")}<br><span class="muted small">The app is still using the stored calibration dataset.</span><ol>${todo.map(item => `<li>${h(item)}</li>`).join("")}</ol></div>` : "";
  return `<section class="panel live-calibration-card ${hasLive ? "active" : "stored"}">
    <div class="live-calibration-head">
      <div><span class="eyebrow">Live calibration data</span><h3>${hasLive ? "Uploaded actuals active" : "Using stored calibration data"}</h3><p>${hasLive ? "Portfolio Calibration is using validated uploaded operating-hub actuals for this browser session." : "Upload the latest dashboard exports to refresh actual kWh, sessions and revenue. Validation runs automatically after file selection."}</p></div>
      <span class="badge ${hasLive ? "good" : "warn"}">${hasLive ? "Live session" : "Stored fallback"}</span>
    </div>
    <div class="portfolio-summary-grid live-calibration-kpis">${kpi("Latest actuals date", h(latest), hasLive ? "from uploaded files" : "stored app library")}${kpi("Matched clean sites", `${number(status.matchedCleanSites,0)} / ${number(status.activeSiteCount || sites.length,0)}`, "used in calibration table")}${kpi("Additional live sites", number(status.additional,0), "shown under uploaded sites")}${kpi("Uploaded site rows", number(status.uploadedSiteCount,0), hasLive ? "validated live sites" : "none uploaded")}${hasLive ? kpi("Actuals retained", number(status.retainedMissing || 0,0), "missing/zero upload did not overwrite") : ""}</div>
    <details class="live-calibration-details"><summary>Which files should I upload?</summary><div class="live-file-guidance"><div><strong>Minimum required</strong><ul>${requiredFiles.map(f => `<li>${h(f)}</li>`).join("")}</ul></div><div><strong>Recommended full pack</strong><ul>${recommendedFiles.map(f => `<li>${h(f)}</li>`).join("")}</ul></div><div><strong>Optional support / trend files</strong><ul>${optionalFiles.map(f => `<li>${h(f)}</li>`).join("")}</ul></div></div></details>
    ${errorHtml}
    ${warnings.length ? `<div class="notice warn"><strong>Upload warnings</strong><br>${warnings.slice(0,4).map(h).join("<br>")}</div>` : ""}
    ${supportingFiles.length ? `<details class="live-calibration-details"><summary>Supporting files detected</summary><p class="muted small">These files were accepted as supporting files. They are not used as the primary charger-level daily actuals source.</p><ul>${supportingFiles.slice(0,12).map(w => `<li>${h(String(w).replace(": not a charger-level daily actuals export; kept as supporting file only", ""))}</li>`).join("")}</ul></details>` : ""}
    <div class="live-calibration-actions">
      <label class="file-button" for="portfolioCalibrationFiles">Choose calibration Excel files</label>
      <input id="portfolioCalibrationFiles" type="file" accept=".xlsx,.xlsm,.csv" multiple style="display:none" />
      ${hasLive ? `<button type="button" class="secondary" id="clearPortfolioCalibrationUpload">Reset to stored app data</button>` : ""}
    </div>
    <div id="portfolioCalibrationUploadStatus" class="muted small">${hasLive ? `Source files: ${h(parsedFiles.join(", ") || "uploaded dashboard export")}` : "Choose one or more calibration Excel files. The app validates them automatically and only uses them if they pass."}</div>
  </section>`;
}

const DEMAND_BENCHMARK_PROFILES = {
  motorway_plaza: {
    label: "Motorway / plaza", shortLabel: "Motorway / plaza", relevance: 0.35, capture: 0.22, targetSessionsPer1000Aadt: 0.32, effectiveAadtCap: 45000,
    basis: "AADT-led planned charging stop", note: "Best for visible motorway, junction, plaza or service-area sites where passing traffic is naturally stopping."
  },
  retail: {
    label: "Retail park / shopping centre", shortLabel: "Retail / shopping", relevance: 0.30, capture: 0.20, targetSessionsPer1000Aadt: 1.20, effectiveAadtCap: 20000,
    basis: "destination plus passing traffic", note: "Best for retail parks and shopping destinations where dwell time supports charging."
  },
  urban_service: {
    label: "Urban service station", shortLabel: "Urban service", relevance: 0.22, capture: 0.16, targetSessionsPer1000Aadt: 0.19, highPlugTargetSessionsPer1000Aadt: 0.36, effectiveAadtCap: 35000,
    basis: "local corridor / fuel-stop behaviour", note: "Best for fuel-stop and local corridor sites where access, signage and local competition matter strongly."
  },
  town_hub_forecourt: {
    label: "Town hub / community forecourt", shortLabel: "Town hub forecourt", relevance: 0.28, capture: 0.18, targetSessionsPer1000Aadt: 0.45, effectiveAadtCap: 20000,
    basis: "catchment-led / uncontested town forecourt", note: "Best for forecourt sites that are the primary fuel/EV stop for a town or area with no other DC charger within 15 km. AADT understates catchment — auto-classified when competition check confirms no nearby DC chargers."
  },
  hotel_destination: {
    label: "Hotel / destination", shortLabel: "Hotel / destination", relevance: 0.12, capture: 0.12, targetSessionsPer1000Aadt: 0.34, effectiveAadtCap: 12000,
    basis: "destination-led demand", note: "Best for hotels, resorts, tourist or dwell-led locations where AADT can understate destination demand."
  },
  local_community: {
    label: "Local / community", shortLabel: "Local / community", relevance: 0.06, capture: 0.08, targetSessionsPer1000Aadt: 0.06, effectiveAadtCap: 120000,
    basis: "local repeat usage", note: "Best for community, sports or local-captive sites where AADT is less predictive."
  },
  review: {
    label: "Review / custom", shortLabel: "Review", relevance: 0.24, capture: 0.16, targetSessionsPer1000Aadt: 0.80, effectiveAadtCap: 20000,
    basis: "manual review required", note: "Use where the address has mixed signals or the AADT counter may not reflect the site entrance."
  }
};
const DEMAND_PROFILE_ORDER = ["motorway_plaza", "retail", "urban_service", "town_hub_forecourt", "hotel_destination", "local_community", "review"];
function demandBenchmarkProfile(key) {
  return DEMAND_BENCHMARK_PROFILES[key] || DEMAND_BENCHMARK_PROFILES.review;
}
function demandProfileLabel(key) {
  return demandBenchmarkProfile(key).label;
}
function demandBenchmarkProfileOptions(selected) {
  const opts = [`<option value="auto" ${selected === "auto" ? "selected" : ""}>Auto-suggest from address</option>`];
  DEMAND_PROFILE_ORDER.forEach(key => opts.push(`<option value="${h(key)}" ${selected === key ? "selected" : ""}>${h(demandProfileLabel(key))}</option>`));
  return opts.join("");
}
function inferDemandBenchmarkProfile() {
  const ctx = state.siteContext || {};
  const text = [state.inputs.siteAddress, ctx?.site?.name, ctx?.site?.display_address, ctx?.site?.source]
    .filter(Boolean).join(" ").toLowerCase();
  const aadt = Number(state.inputs.rawCorridorTrafficAadt || 0);
  const chargers = Array.isArray(ctx?.chargers) ? ctx.chargers : [];
  let key = "review";
  let confidence = "Medium";
  let reason = "Address does not strongly indicate a site type; review the profile manually.";
  if (/\b(m[0-9]{1,2}|n[0-9]{1,2})\b|junction|jct|motorway|plaza|services|service\s+area|rest\s+area/.test(text)) {
    key = "motorway_plaza";
    confidence = aadt >= 10000 ? "Medium-high" : "Medium";
    reason = "Address/nearby text suggests motorway, junction, plaza or planned-stop behaviour.";
  }
  if (/retail\s+park|shopping\s+centre|shopping\s+center|mall|supervalu|tesco|dunnes|lidl|aldi|business\s+park|industrial\s+estate/.test(text)) {
    key = "retail";
    confidence = "Medium-high";
    reason = "Address text suggests a retail, business-park or shopping destination.";
  }
  if (/circle\s*k|corrib\s*oil|centra|service\s+station|filling\s+station|petrol|fuel|garage|forecourt/.test(text)) {
    key = "urban_service";
    confidence = "Medium-high";
    reason = "Address/name suggests service-station or fuel-stop behaviour.";
  }
  if (/hotel|resort|spa|golf|tourist|destination/.test(text)) {
    key = "hotel_destination";
    confidence = "Medium-high";
    reason = "Address/name suggests destination-led charging demand.";
  }
  if (/afc|gaa|club|community|sports|stadium|school|college|university/.test(text)) {
    key = "local_community";
    confidence = "Medium";
    reason = "Address/name suggests local, community or repeat-use demand.";
  }
  if (key === "review" && aadt > 80000) {
    confidence = "Medium-low";
    reason = "AADT is very high but address context is unclear; use Review/custom until access and relevance are checked.";
  } else if (key !== "review" && chargers.length >= 6) {
    reason += " Nearby charger density is material, so capture should be reviewed against competition.";
  }
  return { key, confidence, reason };
}
function activeDemandBenchmarkProfileKey() {
  const selected = state.inputs.benchmarkProfile || "auto";
  return selected === "auto" ? inferDemandBenchmarkProfile().key : selected;
}
function applyDemandBenchmarkProfile(selected = state.inputs.benchmarkProfile || "auto") {
  const suggestion = inferDemandBenchmarkProfile();
  const profileKey = selected === "auto" ? suggestion.key : selected;
  const profile = demandBenchmarkProfile(profileKey);
  setInput("benchmarkProfile", selected);
  setInput("siteRelevanceFactor", profile.relevance);
  setInput("siteCaptureRate", profile.capture);
  setInput("effectiveAadtCap", Number(profile.effectiveAadtCap || 0));
  setInput("benchmarkTargetSessionsPer1000Aadt", Number(profile.targetSessionsPer1000Aadt || 0));
}
function demandBenchmarkProfileCard() {
  const selected = state.inputs.benchmarkProfile || "auto";
  const suggestion = inferDemandBenchmarkProfile();
  const activeKey = activeDemandBenchmarkProfileKey();
  const activeProfile = demandBenchmarkProfile(activeKey);
  const rawAadt = Number(state.inputs.rawCorridorTrafficAadt || 0);
  const selectedCap = Number(activeProfile.effectiveAadtCap || 0);
  const effectiveAadt = selectedCap > 0 ? Math.min(rawAadt, selectedCap) : rawAadt;
  const suggestedProfile = demandBenchmarkProfile(suggestion.key);
  const confidenceClass = String(suggestion.confidence || "medium").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const heading = selected === "auto" ? `Suggested site type: ${suggestedProfile.label}` : `Selected site type: ${activeProfile.label}`;
  const appliedLabel = selected === "auto" ? suggestedProfile.label : activeProfile.label;
  return `<section class="benchmark-profile-card benchmark-profile-${h(confidenceClass)}">
    <div class="benchmark-profile-banner">
      <div class="benchmark-profile-copy">
        <span class="eyebrow">Benchmark profile suggestion</span>
        <div class="benchmark-title-row"><h3>${h(heading)}</h3><span class="benchmark-confidence ${h(confidenceClass)}">${h(suggestion.confidence)}</span></div>
        <p>${h(suggestion.reason)}</p>
      </div>
      <div class="benchmark-profile-control">
        <label for="benchmarkProfileSelect">Choose site type</label>
        <div class="benchmark-control-row">
          <select id="benchmarkProfileSelect">${demandBenchmarkProfileOptions(selected)}</select>
          <button type="button" class="primary" id="applyBenchmarkProfile">Apply benchmark profile</button>
        </div>
        <small>Loads benchmark relevance, capture and AADT settings. You can still edit assumptions manually afterwards.</small>
      </div>
    </div>
    <div class="benchmark-profile-active-note"><strong>Profile basis:</strong> ${h(appliedLabel)} · ${h(activeProfile.note)}</div>
    <div class="benchmark-factor-grid">
      <span><small>Relevance to apply</small><strong>${pct(activeProfile.relevance,0)}</strong></span>
      <span><small>Capture to apply</small><strong>${pct(activeProfile.capture,0)}</strong></span>
      <span><small>Effective AADT cap</small><strong>${number(selectedCap,0)}</strong></span>
      <span><small>Effective AADT after cap</small><strong>${number(effectiveAadt,0)}</strong></span>
      <span><small>Target sessions / 1k AADT</small><strong>${number(activeProfile.targetSessionsPer1000Aadt,2)}</strong></span>
    </div>
  </section>`;
}

function leaseRiskCard(f) {
  const leaseTerm = Number(state.inputs.leaseTerm || 0);
  const horizon = Number(state.inputs.investmentHorizon || f.horizon || 0);
  const startYear = Number(state.inputs.modelStartYear || state.inputs.codYear || new Date().getFullYear());
  const leaseExpiryYear = leaseTerm > 0 ? startYear + leaseTerm - 1 : null;
  const breakEvenYear = f.breakEvenYear ? Number(f.breakEvenYear) : null;
  let status = "good";
  let title = "Lease covers model horizon";
  let message = "Lease term covers the selected investment horizon.";

  if (!leaseTerm || leaseTerm <= 0) {
    status = "warn";
    title = "Lease term not set";
    message = "Set the lease term so the model can compare secured operating rights against the investment horizon.";
  } else if (!breakEvenYear || (leaseExpiryYear && breakEvenYear > leaseExpiryYear)) {
    status = "bad";
    title = !breakEvenYear ? "No payback within secured lease term" : "Break-even after lease expiry";
    message = !breakEvenYear
      ? "No break-even is achieved within the selected investment horizon. Treat returns as high risk until lease, demand or capex assumptions are reviewed."
      : "Break-even occurs after the secured lease term. Returns after lease expiry should be treated as unsecured.";
  } else if (leaseTerm < horizon) {
    status = "warn";
    title = "Model extends beyond lease term";
    message = "The selected investment horizon extends beyond the secured lease term. Later-year returns should be treated as unsecured unless extension rights are confirmed.";
  }

  const badge = status === "good" ? "good" : status === "bad" ? "bad" : "warn";
  return `<section class="panel lease-risk-card ${status}"><div class="lease-risk-head"><span class="badge ${badge}">${status === "good" ? "Lease OK" : status === "bad" ? "Lease risk" : "Lease warning"}</span><h3>${h(title)}</h3></div><p>${h(message)}</p><div class="lease-risk-grid">${kpi("Lease term", leaseTerm ? `${leaseTerm} years` : "Not set")}${kpi("Investment horizon", `${horizon} years`)}${kpi("Lease expiry", leaseExpiryYear || "n/a")}${kpi("Break-even", f.breakEvenYear || "No break-even")}</div></section>`;
}

function plainTableLabel(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function table(headers, rows, cls = "") {
  const labels = headers.map(plainTableLabel);
  const normaliseRow = row => Array.isArray(row) ? { cells: row, className: "" } : { cells: row?.cells || [], className: row?.className || "" };
  const body = rows.length
    ? rows.map(rawRow => {
      const row = normaliseRow(rawRow);
      return `<tr${row.className ? ` class="${h(row.className)}"` : ""}>${row.cells.map((x, i) => `<td data-label="${h(labels[i] || "Value")}">${x}</td>`).join("")}</tr>`;
    }).join("")
    : `<tr><td data-label="Status" colspan="${headers.length}">No rows to display.</td></tr>`;
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

const DEMAND_KEYS = ["benchmarkProfile", "effectiveAadtCap", "benchmarkTargetSessionsPer1000Aadt", "annualBevShareGrowthRate", "siteCaptureRate", "siteLimitationFactor", "peakWindowShare", "peakHourShareWithinPeakWindow", "averageSessionEnergy", "baseFleetPlanningPower"];
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
  if (tab === "demand") assignDefaults([...DEMAND_KEYS, "siteRelevanceFactor"]);
  if (tab === "setup") {
    assignDefaults(SETUP_INPUT_KEYS);
    Object.assign(state.config, DEFAULT_SELECTED_CONFIG);
    clearGrantSupportMetadata();
    grantSupportManualOverride = false;
  }
  if (tab === "investment") assignDefaults(["investmentHorizon", "modelStartYear", "codYear"]);
  if (tab === "advanced") {
    assignDefaults(advancedInputKeys());
  }
  enforceConfigCompatibility();
}

const APP_BUILD_VERSION = "V17.30 map-led AADT counter selection";
const TAB_LABELS = {
  site: "Site Screening",
  demand: "Demand Forecast",
  setup: "Product Configuration",
  investment: "Investment Case",
  annuals: "Annual Financials",
  scenario: "Scenario Ranking",
  portfolio: "Portfolio Calibration",
  portfolioFinancials: "Portfolio Financials",
  advanced: "Advanced Model Settings",
  report: "Investor Report"
};
const ORDERABLE_SECTIONS = {
  demand: ["kpis", "assumptions", "bevTraffic", "sessions", "kwh", "mic", "table"],
  setup: ["overviewValidator", "productConfig", "commercial", "landlord"],
  investment: ["horizon", "leaseRisk", "returns", "investmentFunding", "trading", "lifecycle", "cashflow", "capex"],
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
  if (t.aadt_engine_version) parts.push(`Engine: ${t.aadt_engine_version}`);
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

function aadtEngineMismatchWarning(ctx) {
  const t = ctx?.traffic || {};
  const source = String(t.source || "").toLowerCase();
  const mode = String(t.sample_mode || t.aadt_engine_mode || "").toLowerCase();
  const engineVersion = String(t.aadt_engine_version || "");
  const isOldCoordinateEngine = source.includes("ranked coordinate-enriched lookup") || mode.includes("ranked coordinate-enriched");
  const hasCandidates = Array.isArray(t.candidates) && t.candidates.length > 0;
  if (t.client_side_aadt_recalculated) {
    return "";
  }
  if (isOldCoordinateEngine) {
    return "AADT API version mismatch: the browser is V17.30 but the server returned the older V17.26 coordinate-enriched AADT method. This can select distant county/corridor counters such as N22 for Bandon. The browser will try to recalculate from the local TII counter database, but redeploy/restart the full package including server.py before investor use.";
  }
  if (hasCandidates && !engineVersion && source.includes("tii")) {
    return "AADT API version is not reported by the server. The result may come from an older backend. Redeploy/restart the full package if the candidate list does not show coordinate-first road-aware output.";
  }
  return "";
}

const CLIENT_AADT_ENGINE_VERSION = "V17.30 browser coordinate-first official-location AADT engine";
let clientAadtRecordsPromise = null;
const CLIENT_AADT_COORD_OVERRIDES = {
  "000000001069": { lat: 53.2933, lon: -9.0159, location_source: "built-in browser traffic counter coordinate proxy: Bothar na dTreabh, Galway" },
  "000000001011": { lat: 53.4253, lon: -6.2454, location_source: "built-in browser traffic counter coordinate proxy: Dublin Airport Link" },
  "000000001271": { lat: 51.8479, lon: -8.4860, location_source: "built-in browser traffic counter coordinate proxy: Cork Airport N27" },
  "000000020258": { lat: 51.9057, lon: -8.3663, location_source: "built-in browser traffic counter coordinate proxy: Little Island N25/N28 interchange" },
  "000000001256": { lat: 51.8826, lon: -8.3905, location_source: "built-in browser traffic counter coordinate proxy: Mahon / N40" },
  "000000001228": { lat: 51.8879, lon: -8.5920, location_source: "built-in browser traffic counter coordinate proxy: Ballincollig Bypass / N22" },
  "000000001711": { lat: 51.7930, lon: -8.5840, location_source: "built-in browser traffic counter coordinate proxy: N71 Innishannon-Ballinhassig" },
  "000000001712": { lat: 51.7720, lon: -8.6460, location_source: "built-in browser traffic counter coordinate proxy: N71 Halfway-Inishannon" },
  "000000001713": { lat: 51.6400, lon: -8.8050, location_source: "built-in browser traffic counter coordinate proxy: N71 Clonakilty-Jones Bridge" },
  "000000001715": { lat: 51.7000, lon: -9.5200, location_source: "built-in browser traffic counter coordinate proxy: N71 Bantry-Glengarriff" },
  "000000001716": { lat: 51.8200, lon: -8.5200, location_source: "built-in browser traffic counter coordinate proxy: N71 Ballinhassig-N40" },
  "000000001717": { lat: 51.5400, lon: -9.4200, location_source: "built-in browser traffic counter coordinate proxy: N71 Ballydehob-Aghadown" }
};

function clientAadtCounterId(rec) {
  return String(rec?.site_id || rec?.counter_id || "").trim();
}
function clientAadtRoute(route) {
  return String(route || "").trim().toUpperCase().replace(/\s+/g, "");
}
function clientAadtRouteClass(route) {
  const r = clientAadtRoute(route);
  if (/^M\d/.test(r)) return "M";
  if (/^N\d/.test(r)) return "N";
  if (/^R\d/.test(r)) return "R";
  return "U";
}
function clientAadtSiteFlags(address) {
  const lower = String(address || "").toLowerCase();
  return {
    motorway: /\b(motorway|services?|service area|plaza|junction|j\s*\d+|m\s*\d+)\b/.test(lower),
    retailDestination: ["tesco", "aldi", "lidl", "supervalu", "dunnes", "retail", "shopping", "hotel", "park", "business", "golf", "afc", "community"].some(k => lower.includes(k))
  };
}
function clientAadtDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => Number(d) * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function clientAadtRatioOk(a, b, maxRatio = 3.0) {
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return false;
  return Math.max(x, y) / Math.min(x, y) <= maxRatio;
}

const CLIENT_TII_COUNTER_LOCATION_GEOJSON_URL = "https://data.tii.ie/Datasets/TrafficCounters/tmu-traffic-counters.geojson";
let clientOfficialAadtLocationPromise = null;

function clientPickProp(props, names, fallback = "") {
  const norm = {};
  Object.entries(props || {}).forEach(([k, v]) => { norm[String(k).toLowerCase().replace(/[^a-z0-9]/g, "")] = v; });
  for (const name of names) {
    const key = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
    const value = norm[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}
function clientCounterIdFromText(value) {
  const text = String(value || "");
  const m = text.match(/\b\d{4,12}\b/);
  return m ? m[0].padStart(12, "0") : "";
}
function clientRouteFromText(value) {
  const m = String(value || "").toUpperCase().match(/\b[MN]\s*0*\d{1,3}\b/);
  return m ? m[0].replace(/\s+/g, "").replace(/([MN])0+(\d)/, "$1$2") : "";
}
function clientTextSimilarity(a, b) {
  const aw = new Set(String(a || "").toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length >= 3) || []);
  const bw = new Set(String(b || "").toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length >= 3) || []);
  if (!aw.size || !bw.size) return 0;
  let inter = 0;
  aw.forEach(w => { if (bw.has(w)) inter += 1; });
  return inter / Math.max(1, new Set([...aw, ...bw]).size);
}
function clientOfficialCounterLocationsFromGeoJson(data) {
  const features = Array.isArray(data?.features) ? data.features : [];
  return features.map(feature => {
    const geom = feature?.geometry || {};
    const coords = Array.isArray(geom.coordinates) ? geom.coordinates : [];
    if (geom.type !== "Point" || coords.length < 2) return null;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!(lat >= 49 && lat <= 56.5 && lon >= -11.5 && lon <= -5)) return null;
    const props = feature.properties || {};
    const rawId = clientPickProp(props, ["cosit", "CoSit", "COSIT", "site", "site_id", "SiteID", "id", "ID", "tmuid", "TMU_ID", "site number", "site_no"], "");
    const name = String(clientPickProp(props, ["description", "Description", "name", "Name", "SiteName", "site_name", "Location", "location"], rawId || "TII counter"));
    const route = clientAadtRoute(clientPickProp(props, ["route", "Route", "road", "Road", "road_number", "RoadNumber", "RoadName", "roadName", "RouteName"], clientRouteFromText(`${name} ${rawId}`)));
    const id = clientAadtCounterId({ site_id: rawId }) || clientCounterIdFromText(`${rawId} ${name}`);
    return {
      counter_id: id,
      counter_name: name,
      route,
      lat,
      lon,
      location_source: "Official TII Traffic Counter Locations GeoJSON",
      official_location: true,
      properties: props
    };
  }).filter(Boolean);
}
async function loadClientOfficialAadtLocations() {
  if (!clientOfficialAadtLocationPromise) {
    clientOfficialAadtLocationPromise = fetch(CLIENT_TII_COUNTER_LOCATION_GEOJSON_URL, { cache: "no-store", mode: "cors" })
      .then(r => { if (!r.ok) throw new Error(`Could not load official TII counter location GeoJSON (${r.status})`); return r.json(); })
      .then(clientOfficialCounterLocationsFromGeoJson);
  }
  return clientOfficialAadtLocationPromise;
}
function mergeClientAadtRowsWithOfficialLocations(rows, officialLocations) {
  if (!Array.isArray(officialLocations) || !officialLocations.length) return rows;
  const byId = new Map();
  officialLocations.forEach(loc => { if (loc.counter_id) byId.set(loc.counter_id, loc); });
  return rows.map(row => {
    const rowId = clientAadtCounterId(row);
    let loc = byId.get(rowId);
    if (!loc && rowId) {
      for (const [id, candidate] of byId.entries()) {
        if ((id.endsWith(rowId.slice(-6)) || rowId.endsWith(id.slice(-6))) && id.slice(-6) !== "000000") { loc = candidate; break; }
      }
    }
    if (!loc) {
      const rowText = `${row.site_name || row.counter_name || ""} ${row.description || ""} ${row.route || ""}`;
      let best = null;
      for (const candidate of officialLocations) {
        const routeOk = !row.route || !candidate.route || clientAadtRoute(row.route) === clientAadtRoute(candidate.route);
        if (!routeOk) continue;
        const score = clientTextSimilarity(rowText, `${candidate.counter_name || ""} ${candidate.route || ""}`);
        if (score >= 0.42 && (!best || score > best.score)) best = { score, candidate };
      }
      loc = best?.candidate || null;
    }
    if (!loc) return row;
    return {
      ...row,
      lat: loc.lat,
      lon: loc.lon,
      route: row.route || loc.route,
      official_location: true,
      location_source: loc.location_source,
      official_location_name: loc.counter_name
    };
  });
}
async function loadClientAadtRecords() {
  if (!clientAadtRecordsPromise) {
    clientAadtRecordsPromise = fetch("./data/tii_aadt_counters_2019_2026_geocoded.json?v=17.30", { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error(`Could not load local TII AADT database (${r.status})`); return r.json(); })
      .then(async data => {
        const rows = Array.isArray(data?.records) ? data.records : Array.isArray(data) ? data : [];
        const baseRows = rows.map(r => {
          const override = CLIENT_AADT_COORD_OVERRIDES[clientAadtCounterId(r)] || {};
          return { ...r, ...override };
        });
        try {
          const officialLocations = await loadClientOfficialAadtLocations();
          const officialMerged = mergeClientAadtRowsWithOfficialLocations(baseRows, officialLocations);
          return officialMerged.filter(r => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) && Number(r.latest_aadt || r.aadt) > 0);
        } catch (officialErr) {
          console.warn("Official TII counter location GeoJSON unavailable; using bundled local counter coordinates", officialErr);
          return baseRows.filter(r => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) && Number(r.latest_aadt || r.aadt) > 0);
        }
      });
  }
  return clientAadtRecordsPromise;
}
function clientAadtScore(record, address, distanceKm) {
  const route = clientAadtRoute(record.route);
  const routeClass = clientAadtRouteClass(route);
  const flags = clientAadtSiteFlags(address);
  let score = 140 / (1 + Math.max(0.05, distanceKm));
  if (routeClass === "M" && !flags.motorway) score -= 28;
  if (routeClass === "M" && flags.motorway) score += 10;
  if (routeClass === "N") score += 3;
  if (routeClass === "R") score += 1;
  if (distanceKm > 15) score -= Math.min(30, (distanceKm - 15) * 1.8);
  const loc = String(record.location_source || "").toLowerCase();
  if (loc.includes("official") || loc.includes("tii traffic counter")) score += 4;
  else if (loc.includes("built-in")) score += 1;
  else if (loc.includes("offline description")) score -= 2;
  return score;
}
function clientWeightedAadt(group) {
  const weighted = group.map(c => {
    const v = Number(c.aadt);
    const d = Math.max(0.35, Number(c.distance_km) || 1);
    return Number.isFinite(v) && v > 0 ? [v, 1 / (d ** 1.35)] : null;
  }).filter(Boolean);
  if (!weighted.length) return 0;
  return Math.round(weighted.reduce((a, [v,w]) => a + v*w, 0) / weighted.reduce((a, [,w]) => a + w, 0));
}
function clientSelectedAadtGroup(candidates) {
  const usable = candidates.filter(c => Number(c.aadt) > 0);
  if (!usable.length) return [];
  const selected = usable[0];
  const route = clientAadtRoute(selected.route);
  const group = [selected];
  for (const c of usable.slice(1, 12)) {
    if (!route || clientAadtRoute(c.route) !== route) continue;
    if (Number(c.selection_score) < Number(selected.selection_score) - 18) continue;
    if (Math.abs(Number(c.distance_km) - Number(selected.distance_km)) > 8) continue;
    if (!clientAadtRatioOk(selected.aadt, c.aadt, 3.0)) continue;
    group.push(c);
  }
  return group;
}
async function clientCoordinateFirstTraffic(ctx, address) {
  const site = ctx?.site || {};
  const siteLat = Number(site.lat), siteLon = Number(site.lon);
  if (!Number.isFinite(siteLat) || !Number.isFinite(siteLon)) return null;
  const records = await loadClientAadtRecords();
  const ranked = records.map(r => {
    const d = clientAadtDistanceKm(siteLat, siteLon, Number(r.lat), Number(r.lon));
    const aadt = Number(r.latest_aadt || r.aadt || 0);
    return {
      counter_id: clientAadtCounterId(r),
      counter_name: r.site_name || r.counter_name || "TII counter",
      description: r.description || "",
      route: r.route || "route not provided",
      route_class: clientAadtRouteClass(r.route),
      aadt,
      aadt_year: r.latest_year || r.aadt_year || "latest",
      valid_days: `TII Excel ${r.latest_year || "latest"}`,
      distance_km: d,
      selection_score: clientAadtScore(r, address, d),
      lat: Number(r.lat),
      lon: Number(r.lon),
      location_source: r.location_source || "local TII coordinate database",
      official_location: Boolean(r.official_location),
      confidence: d <= 3 ? "High" : d <= 8 ? "Medium" : d <= 20 ? "Review" : "Low",
      match_basis: r.official_location ? "official TII map coordinate + road-aware ranking" : "browser coordinate-first road-aware TII counter ranking",
      source_record: r
    };
  }).filter(c => Number.isFinite(c.distance_km) && c.distance_km <= 80 && c.aadt > 0)
    .sort((a, b) => Number(b.selection_score) - Number(a.selection_score) || Number(a.distance_km) - Number(b.distance_km));
  if (!ranked.length) return null;
  const group = clientSelectedAadtGroup(ranked);
  const selectedIds = new Set(group.map(c => c.counter_id));
  const selectedAadt = clientWeightedAadt(group.length ? group : [ranked[0]]) || ranked[0].aadt;
  const mapCandidate = (c, idx = 0) => ({
    ...c,
    display_rank: idx + 1,
    selected: selectedIds.has(c.counter_id),
    distance_km: Math.round(c.distance_km * 100) / 100,
    selection_score: Math.round(c.selection_score * 100) / 100,
    why: selectedIds.has(c.counter_id) ? "selected" : "candidate ranked by distance, road class and route relevance",
    source_record: undefined
  });
  const top = ranked.slice(0, 4).map(mapCandidate);
  const nearbyCounters = ranked.slice(0, 40).map(mapCandidate);
  const selected = group[0] || ranked[0];
  const selectedDistance = Number(selected.distance_km);
  const confidence = selectedDistance <= 3 ? "High / browser coordinate-first same-area TII counter" :
    selectedDistance <= 8 ? "Medium-high / browser coordinate-first nearby TII counter" :
    selectedDistance <= 15 ? "Medium / browser coordinate-first corridor proxy" :
    "Review required / browser coordinate-first fallback — verify counter on TII map";
  const groupNote = group.length > 1 ? `distance-weighted same-corridor blend of ${group.length} counters` : "single best counter";
  return {
    aadt: selectedAadt,
    raw_aadt: selectedAadt,
    aadt_engine_version: CLIENT_AADT_ENGINE_VERSION,
    aadt_engine_mode: "browser-coordinate-first-road-aware",
    client_side_aadt_recalculated: true,
    source: `Browser local TII AADT database · coordinate-first road-aware lookup · ${groupNote} · ${group.map(c => c.counter_name).join("; ") || selected.counter_name} · ${selected.aadt_year || "latest"}`,
    confidence,
    provider: "Browser local TII AADT database joined to counter coordinates",
    counter_id: group.map(c => c.counter_id).join(", ") || selected.counter_id,
    counter_name: group.map(c => c.counter_name).join("; ") || selected.counter_name,
    route: [...new Set(group.map(c => c.route).filter(Boolean))].join(", ") || selected.route,
    counter_distance_km: Math.round(selectedDistance * 100) / 100,
    aadt_year: selected.aadt_year,
    sample_days: "published annual AADT value from uploaded Excel",
    sample_mode: "browser coordinate-first road-aware TII Excel lookup",
    aadt_selection_method: group.length > 1 ? "same_corridor_weighted" : "single_counter_coordinate_first",
    candidate_count: top.length,
    candidates: top,
    nearby_counters: nearbyCounters,
    reference: "Browser-loaded official TII Traffic Counter Locations GeoJSON when available, joined to data/tii_aadt_counters_2019_2026_geocoded.json",
    method_note: "Browser-side safety correction: AADT was recalculated from the exact map coordinate using official TII counter locations where available, then ranked by road-aware scoring. The nearby-site radius does not control AADT selection.",
    previous_server_traffic: ctx?.traffic ? { aadt: ctx.traffic.aadt, source: ctx.traffic.source, confidence: ctx.traffic.confidence, counter_name: ctx.traffic.counter_name, counter_distance_km: ctx.traffic.counter_distance_km } : null
  };
}
function shouldUseClientCoordinateAadt(ctx) {
  const t = ctx?.traffic || {};
  const provider = String(t.provider || "").toLowerCase();
  const source = String(t.source || "").toLowerCase();
  if (provider.includes("curated site-to-aadt mapping workbook") || source.includes("curated tii aadt mapping")) return false;
  return Boolean(ctx?.site && Number.isFinite(Number(ctx.site.lat)) && Number.isFinite(Number(ctx.site.lon)));
}
async function ensureClientCoordinateFirstAadt(ctx, address) {
  if (!shouldUseClientCoordinateAadt(ctx)) return ctx;
  try {
    const browserTraffic = await clientCoordinateFirstTraffic(ctx, address);
    if (!browserTraffic?.aadt) return ctx;
    const mergedTraffic = { ...(ctx.traffic || {}), ...browserTraffic };
    return {
      ...ctx,
      traffic: mergedTraffic,
      warning: ctx?.warning || (browserTraffic.previous_server_traffic ? "AADT was recalculated in the browser from the local TII counter database to protect against stale server AADT ranking." : ctx?.warning)
    };
  } catch (err) {
    console.warn("Browser coordinate-first AADT fallback failed", err);
    return ctx;
  }
}


function tiiCandidateCards(ctx) {
  const candidates = (ctx?.traffic?.candidates || []).slice(0, 4);
  if (!candidates.length) return "";
  const showAllChecked = state.filters.showAllAadtCounters ? "checked" : "";
  return `<div class="tii-candidate-list"><div class="tii-candidate-title"><strong>Top 4 recommended TII AADT counters</strong><label class="toggle-inline"><input id="showAllAadtCounters" type="checkbox" ${showAllChecked}> Show diagnostic nearby counters on map</label></div><div class="tii-candidates">${candidates.map((c, idx) => {
    const distance = Number.isFinite(Number(c.distance_km)) ? `${number(Number(c.distance_km), 2)} km from map pin` : h(c.match_basis || "coordinate/text match");
    const selectionScore = Number.isFinite(Number(c.selection_score)) ? ` · score ${number(Number(c.selection_score), 1)}` : "";
    const routeScore = Number.isFinite(Number(c.route_score)) ? ` · route ${number(Number(c.route_score), 1)}` : "";
    const terms = Array.isArray(c.matched_terms) && c.matched_terms.length ? ` · matched ${h(c.matched_terms.slice(0, 4).join(", "))}` : "";
    const official = c.official_location ? " · official TII map coordinate" : "";
    const aadt = Number(c.aadt);
    const usable = Number.isFinite(aadt) && aadt > 0;
    const rank = Number(c.display_rank || idx + 1);
    const label = c.selected ? "Selected" : `Alternative ${rank}`;
    const confidence = c.confidence ? ` · ${h(c.confidence)} confidence` : "";
    const basis = c.match_basis ? ` · ${h(c.match_basis)}${official}` : official;
    return `<div class="tii-candidate ${c.selected ? "selected" : ""}" data-select-tii-candidate="${idx}" role="button" tabindex="0" aria-label="Use ${h(c.counter_name || c.counter_id || "TII counter")} as AADT source"><div class="tii-candidate-main"><span>${label}</span><strong>${h(c.counter_name || c.counter_id || "TII counter")}</strong><small>${h(c.route || "route not provided")} · ${distance} · ${usable ? number(aadt,0) + " AADT" : "no usable data"} · ${h(c.valid_days || "published AADT")}${confidence}${selectionScore}${routeScore}${terms}</small><small>${basis}</small></div><button type="button" class="tii-select-btn ${c.selected ? "selected" : ""}" data-select-tii-candidate="${idx}" ${usable ? "" : "disabled"}>${c.selected ? "Using this counter" : "Use this counter"}</button></div>`;
  }).join("")}</div><p class="muted small">Only the four strongest recommendations are selectable in the list and highlighted on the map. Counters are ranked from the exact map coordinate using road-aware scoring. Hover/click a map marker to inspect the counter and press Use this counter directly from the popup. The nearby-site radius is only used for local charger/site screening and does not control AADT.</p></div>`;
}

function aadtCounterStableId(candidate) {
  return String(candidate?.counter_id || candidate?.counter_name || candidate?.site_id || "").trim();
}
function candidateByStableId(counterId) {
  const id = decodeURIComponent(String(counterId || ""));
  const traffic = state.siteContext?.traffic || {};
  const all = [ ...(Array.isArray(traffic.candidates) ? traffic.candidates : []), ...(Array.isArray(traffic.nearby_counters) ? traffic.nearby_counters : []) ];
  return all.find(c => aadtCounterStableId(c) === id) || null;
}
function applyTiiCandidateObjectSelection(candidate, source = "recommended list") {
  const traffic = state.siteContext?.traffic || {};
  if (!candidate) return;
  const aadt = Number(candidate.aadt);
  if (!Number.isFinite(aadt) || aadt <= 0) {
    alert("This TII counter has no usable AADT value.");
    return;
  }
  const selectedId = aadtCounterStableId(candidate);
  const existingCandidates = Array.isArray(traffic.candidates) ? traffic.candidates : [];
  const selectedInList = existingCandidates.some(c => aadtCounterStableId(c) === selectedId);
  const selectedCandidates = (selectedInList ? existingCandidates : [candidate, ...existingCandidates])
    .filter((c, i, arr) => arr.findIndex(x => aadtCounterStableId(x) === aadtCounterStableId(c)) === i)
    .slice(0, 4)
    .map((c, i) => ({ ...c, display_rank: i + 1, selected: aadtCounterStableId(c) === selectedId, manually_selected: aadtCounterStableId(c) === selectedId }));
  const nearbyCounters = (Array.isArray(traffic.nearby_counters) ? traffic.nearby_counters : selectedCandidates)
    .map(c => ({ ...c, selected: aadtCounterStableId(c) === selectedId, manually_selected: aadtCounterStableId(c) === selectedId }));
  const sourceLabel = candidate.source || candidate.valid_days || traffic.source || "TII AADT counter";
  const counterLabel = candidate.counter_name || candidate.counter_id || "TII counter";
  const selectedTraffic = {
    ...traffic,
    ...candidate,
    aadt,
    source: `Manual map/list selection from TII AADT counters · ${sourceLabel}`,
    provider: source === "map" ? "TII AADT map-selected counter" : "TII AADT recommended counter list",
    counter_name: counterLabel,
    counter_id: candidate.counter_id || candidate.counter_name || traffic.counter_id || counterLabel,
    counter_distance_km: Number.isFinite(Number(candidate.distance_km)) ? Number(candidate.distance_km) : traffic.counter_distance_km,
    confidence: candidate.confidence || "manual selected / review",
    method_note: source === "map"
      ? "User selected this AADT counter directly from the map popup. The nearby-site radius is only used for local charger/site screening and does not control AADT selection."
      : "User selected this AADT counter from the recommended list. The nearby-site radius is only used for local charger/site screening and does not control AADT selection.",
    candidates: selectedCandidates,
    nearby_counters: nearbyCounters
  };
  state.siteContext = {
    ...(state.siteContext || {}),
    traffic: selectedTraffic
  };
  state.inputs.rawCorridorTrafficAadt = aadt;
  state.filters.manualAadtOverride = false;
  const sourceYear = latestYearFromText(candidate.aadt_year || candidate.valid_days || candidate.source || selectedTraffic.source || "");
  if (sourceYear) state.inputs.trafficSourceYear = sourceYear;
  preserveScrollRender();
}
function applyTiiCandidateSelection(candidateIndex) {
  const traffic = state.siteContext?.traffic || {};
  const candidates = Array.isArray(traffic.candidates) ? traffic.candidates : [];
  const idx = Number(candidateIndex);
  applyTiiCandidateObjectSelection(candidates[idx], "recommended list");
}
function applyTiiCounterIdSelection(counterId) {
  applyTiiCandidateObjectSelection(candidateByStableId(counterId), "map");
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
    ${aadtEngineMismatchWarning(ctx) ? `<div class="notice bad"><strong>AADT engine mismatch.</strong> ${h(aadtEngineMismatchWarning(ctx))}</div>` : ""}
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
          <div class="field"><label>AADT used <span class="info-wrap"><button class="info-dot" type="button" data-info-toggle="aadt" aria-label="Explain AADT">i</button><span class="info-popover">${h(aadtHelpText())}</span></span></label><div class="unit-input-wrap"><input id="manualAadt" type="number" step="1" value="${state.inputs.rawCorridorTrafficAadt}" /><span class="input-unit">veh/day</span></div><small>${h(aadtSourceText(ctx))}<br>${h(aadtHelpText())}</small></div>
          <div class="field"><label>Manual override</label><select id="manualAadtOverride"><option value="false" ${!state.filters.manualAadtOverride ? "selected" : ""}>Use provider / base AADT</option><option value="true" ${state.filters.manualAadtOverride ? "selected" : ""}>Use manual AADT</option></select><small>Use this when you have better traffic data.</small></div>
        </div>
      </div>
      <div class="tii-workflow-card">
        <div>
          <strong>AADT source engine</strong>
          <p>Pressing Search automatically runs the coordinate-first TII AADT lookup. AADT means Annual Average Daily Traffic: the estimated average vehicles passing a location per day over a year. The app uses the exact map pin to rank nearby TII counters by distance, road/route relevance and confidence. The radius selector is only for nearby chargers/sites, not AADT calculation.</p>
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
    { id: "assumptions", title: "Editable demand assumptions", html: `<div class="notice aadt-help"><strong>AADT baseline</strong><br>${h(aadtHelpText())}</div>${demandBenchmarkProfileCard()}<div class="panel">
      <h3>Editable demand assumptions</h3>
      <div class="input-grid three">
        ${inputField("annualBevShareGrowthRate", "Annual BEV share growth rate", { step: 0.01, help: "Compounds the starting BEV share each model year, capped by the model BEV share cap." })}
        ${inputField("siteCaptureRate", "Site capture rate", { step: 0.01, help: "What it does: converts relevant fast-charge opportunity into site demand. Basis: calibrated from ePower hubs + matched AADT." })}
        ${inputField("siteLimitationFactor", "Site limitation factor", { step: 0.01, help: "What it does: applies practical site constraints. Basis: retained planning assumption." })}
        ${inputField("peakWindowShare", "Peak-window share", { step: 0.01, help: "What it does: allocates demand into busiest hours. Basis: planning assumption; hourly data not available yet." })}
        ${inputField("peakHourShareWithinPeakWindow", "Peak-hour share within peak window", { step: 0.01, help: "What it does: sizes the single busiest hour. Basis: planning assumption; hourly data not available yet." })}
        ${inputField("averageSessionEnergy", "Average session energy", { step: 1, help: "What it does: sets kWh per charging session. Basis: calibrated from ePower portfolio kWh ÷ sessions." })}
        ${inputField("baseFleetPlanningPower", "Base fleet planning power", { step: 1, help: "What it does: estimates session duration and plug occupancy. Basis: calibrated from observed ePower average kW." })}
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

function showKempowerTripleCabinetCount(config = state.config) {
  return String(config.platform || "") === "Kempower Distributed" && String(config.cabinetType || "") === "Kempower Triple Cabinet";
}

function kempowerTripleCabinetCountField() {
  if (!showKempowerTripleCabinetCount()) return "";
  return selectFieldConfig("kempowerTripleCabinetCount", "Number of triple cabinets", ["1", "2"], { help: "For Kempower Triple Cabinet only. Adds a second triple power cabinet without automatically increasing active satellites/plugs." });
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
        <div class="field"><label for="netSellingPriceExVat">Net selling price excluding VAT</label><div class="unit-input-wrap"><input id="netSellingPriceExVat" data-input="netSellingPriceExVat" type="number" step="0.01" value="${h(priceDisplay)}" /><span class="input-unit">€/kWh</span></div><small>Displayed to two decimals for clarity; used to calculate charging revenue from delivered energy.</small></div>
        ${inputField("electricityCost", "Electricity cost", { step: 0.01, unit: "€/kWh", help: "Applied to delivered energy to calculate energy purchase cost." })}
        ${grantSupportField()}
      </div>
    </div>` },
    { id: "landlord", title: "Landlord inputs", html: `<div class="panel">
      <h3>Landlord inputs</h3>
      <div class="input-grid">
        ${inputField("groundRentPerEvSpace", "Ground rent per EV space", { step: 50, unit: "€/space/year", help: "Fixed annual site rent linked to EV spaces or outputs." })}
        ${inputField("leaseTerm", "Lease term", { step: 1, unit: "years", help: "Lease context used for the investment review." })}
        ${inputField("landlordGpShare", "Gross profit share", { step: 0.01, unit: "rate", help: "Default is 0. Populate only when actual site-level terms exist. Enter as decimal rate, e.g. 0.03 = 3%. Use either this or gross-sales share, not both." })}
        ${inputField("landlordGrossSalesShare", "Gross-sales share", { step: 0.01, unit: "rate", help: "Default is 0. Populate only when actual site-level terms exist. Enter as decimal rate, e.g. 0.10 = 10%. If both fields are filled, gross-sales share takes precedence." })}
      </div>
    </div>` },
    { id: "productConfig", title: "Product configuration", html: `<div class="panel interactive-config-panel">
      <div class="interactive-config-head"><span>STEP 3 · INTERACTIVE CONFIGURATION</span><h3>Configure your site</h3><p>Select the platform, MIC, battery and hardware. The validator updates automatically and shows exactly what needs to be fixed.</p></div>
      <div class="config-subgroups">
        <section class="config-subgroup">
          <h4>Charging Platform</h4>
          <div class="input-grid">
            ${selectFieldConfig("platform", "Charging platform", ["Autel Standalone", "Autel Distributed", "Kempower Distributed"])}
            ${selectFieldConfig("chargerModel", "Charger model", o.chargerModels)}
            ${inputFieldConfig("chargerCount", "Number of chargers", { step: 1, min: 1, unit: "chargers" })}
            ${selectFieldConfig("cabinetType", "Cabinet type", o.cabinets)}
            ${kempowerTripleCabinetCountField()}
            ${inputFieldConfig("dispenserCount", "Dual dispensers / satellites", { step: 1, min: 0, max: selectedCabinetMaxDualDisp(), unit: "dual dispensers", help: dispenserLimitHelp() })}
          </div>
        </section>
        <section class="config-subgroup">
          <h4>Power Strategy</h4>
          <div class="input-grid">
            ${selectFieldConfig("batteryStrategy", "Power strategy", ["Grid only", "Grid + battery"])}
            ${selectFieldConfig("selectedMicKva", "Selected grid MIC (kVA)", MIC_VALUES.map(String), { help: "Approved model values only: 50, 100, 200, 400, 800, 1000, 1500 kVA." })}
            ${selectFieldConfig("batterySize", "Battery size", o.batteries)}
            ${inputField("batteryReplacementThresholdSoh", "Battery SOH replacement threshold", { step: 0.01, unit: "% SOH", help: "Battery replacement is based on state of health, not state of charge." })}
          </div>
        </section>
        <section class="config-subgroup">
          <h4>Services</h4>
          <div class="input-grid">
            ${selectFieldConfig("serviceLevel", "Service level", ["Basic", "Advance", "Premium", "Standard (2yr warranty + remote support)"])}
            ${selectFieldConfig("chargerWarrantyYears", "Extended charger warranty (years)", Array.from({length: 21}, (_, i) => String(i)))}
            ${selectFieldConfig("batteryWarrantyYears", "Extended battery warranty (years)", Array.from({length: 21}, (_, i) => String(i)))}
            ${selectField("chargerEquipmentReplacementCycleYears", "Charger replacement cycle (years)", [7,8,9,10], { help: "Controls scheduled charger replacement years." })}
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
  const tech = r.yearByYear.technical || {};
  const invalidInvestmentNotice = tech.feasible ? "" : `<div class="notice bad"><strong>Technical configuration requires action.</strong> Investment outputs are shown for modelling context only and should not be treated as a recommendable case until the Product Configuration validator passes. Issue: ${h((tech.failures || ["Technical feasibility"]).join(", "))}</div>`;
  const sections = [
    { id: "horizon", title: "Investment horizon", html: `<div class="panel investment-horizon-panel"><h3>Model timeline</h3><p>Set the first operating year and the horizon used for ROI, cash flow, replacement events and exports.</p><div class="input-grid"><div class="field"><label>Model start year</label><input data-input="modelStartYear" type="number" min="2020" max="2100" step="1" value="${state.inputs.modelStartYear ?? state.inputs.codYear}" /><small>Defaults to the current calendar year. This replaces the older COD year wording.</small></div><div class="field"><label>Investment horizon: ${state.inputs.investmentHorizon} years</label><input data-input="investmentHorizon" type="range" min="1" max="20" step="1" value="${state.inputs.investmentHorizon}" /><small>Controls all investment totals and charts.</small></div></div></div>` },
    { id: "leaseRisk", title: "Lease term risk", html: leaseRiskCard(f) },
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
    ${invalidInvestmentNotice}
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
    { id: "technical", title: "Technical detail", html: `<details open><summary>Technical detail</summary><div style="margin-top:12px">${table(["Year", "Required peak kW", "Selected MIC", "Installed battery units", "Battery SOH", "SOH-adjusted kWh", "Power deficit", "Energy deficit", "Battery replacement", "Charger replacement", "Battery deployment", "Replacement / deployment capex"], rows.map(y => [
        y.year,
        number(y.peakDemandRequiredKw,1),
        number(y.selectedMicKva,0),
        number(y.installedBatteryUnits || 0,0),
        y.installedBatteryUnits ? pct(y.batterySohEnd,1) : '—',
        number(y.batteryEnergyAvailableKwhSohAdjusted || 0,0),
        kw(y.batteryPowerDeficitKw || 0,1),
        kwh(y.batteryEnergyDeficitKwh || 0,0),
        y.batteryReplacementTrigger ? annualEventBadge('batteryReplacement') : '',
        y.chargerReplacementTrigger ? annualEventBadge('chargerReplacement') : '',
        y.augmentationFlag ? annualEventBadge('batteryAugmentation') : '',
        currency(y.batteryReplacementCapex + y.chargerReplacementCapex + y.augmentationCapex,0)
      ]), "technical-detail-table")}</div></details>` }
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
  const cabinetCount = showKempowerTripleCabinetCount(cfg) ? `${kempowerTripleCabinetCount(cfg)} × triple cabinet · ` : "";
  return `${cabinetCount}${cfg.dispenserCount} dispensers · ${outputs} plugs`;
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
function scenarioGradientClass(tone = "good", index = 0, total = 0) {
  if (tone !== "good") return "scenario-card-bad";
  const safeIndex = Number.isFinite(index) ? index : 0;
  const safeTotal = Math.max(1, Number(total) || 1);
  if (safeIndex === 0) return "scenario-card-best";
  if (safeIndex <= Math.max(1, Math.floor(safeTotal * 0.30))) return "scenario-card-strong";
  if (safeIndex <= Math.max(2, Math.floor(safeTotal * 0.65))) return "scenario-card-mid";
  return "scenario-card-soft";
}
function scenarioCard(s, tone = "good", index = 0, total = 0) {
  const isGood = tone === "good";
  const toneClass = scenarioGradientClass(tone, index, total);
  return `<article class="scenario-card ${toneClass}">
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
    <div class="scenario-gradient-legend"><span class="legend-chip best">Best ranked</span><span class="legend-chip strong">Strong</span><span class="legend-chip mid">Acceptable</span><span class="legend-chip soft">Weaker feasible</span><span class="legend-chip bad">Infeasible</span></div>
    <section class="panel scenario-section feasible-section"><h3>✓ Feasible scenarios ranked first</h3><div class="scenario-card-list">${feasible.map((s, index) => scenarioCard(s, "good", index, feasible.length)).join("") || `<div class="notice">No feasible scenarios under current assumptions.</div>`}</div></section>
    <section class="panel scenario-section infeasible-section"><h3>⚠ Infeasible scenarios</h3><p>These options were reviewed but are not recommendable because they fail one or more technical checks.</p><div class="scenario-card-list">${infeasible.map((s, index) => scenarioCard(s, "bad", index, infeasible.length)).join("") || `<div class="notice good">No infeasible scenarios in this run.</div>`}</div></section>
    <div class="notice scenario-footnote">Ranking is based on technical feasibility first, then ROI among feasible scenarios only. Infeasible scenarios are shown for comparison with recommended fixes.</div>`;
}


const PORTFOLIO_CATEGORY_FACTORS = {
  motorway_plaza: {
    label: "Motorway / plaza", relevance: 0.35, capture: 0.22, targetSessionsPer1000Aadt: 0.32, effectiveAadtCap: 45000,
    benchmarkWeight: "AADT-led planned charging stop",
    note: "High-visibility planned charging stop; AADT and peak-capacity pressure matter strongly."
  },
  retail: {
    label: "Retail park / shopping centre", relevance: 0.30, capture: 0.20, targetSessionsPer1000Aadt: 1.20, effectiveAadtCap: 20000,
    benchmarkWeight: "destination plus passing traffic",
    note: "Retail destination plus passing traffic; benchmark against capture and plug productivity."
  },
  urban_service: {
    label: "Urban service station", relevance: 0.22, capture: 0.16, targetSessionsPer1000Aadt: 0.19, highPlugTargetSessionsPer1000Aadt: 0.36, effectiveAadtCap: 35000,
    benchmarkWeight: "local corridor / fuel-stop behaviour",
    note: "Fuel-stop/local corridor behaviour; watch visibility, access and local competition before expansion."
  },
  town_hub_forecourt: {
    label: "Town hub / community forecourt", relevance: 0.28, capture: 0.18, targetSessionsPer1000Aadt: 0.45, effectiveAadtCap: 20000,
    benchmarkWeight: "catchment-led / uncontested town forecourt",
    note: "Forecourt serving town catchment with no DC competitor within 15 km. AADT understates real demand — auto-classified by competition check. Empirical basis: Corrib Oil Swinford (0.52), Walsh Centra Roscommon (0.47), Aherns Castlemartyr (0.47)."
  },
  hotel_destination: {
    label: "Hotel / destination", relevance: 0.12, capture: 0.12, targetSessionsPer1000Aadt: 0.34, effectiveAadtCap: 12000, destinationMonthlyFloorKwh: 3000, destinationFloorMaxAadt: 10000,
    benchmarkWeight: "destination-led demand",
    note: "Destination-led demand; AADT can understate tourism, dwell and captive usage."
  },
  local_community: {
    label: "Local / community", relevance: 0.06, capture: 0.08, targetSessionsPer1000Aadt: 0.06, effectiveAadtCap: 120000,
    benchmarkWeight: "local repeat usage",
    note: "Local/captive use dominates; expansion should be conservative unless utilisation is visible."
  },
  review: {
    label: "Review", relevance: 0.24, capture: 0.16, targetSessionsPer1000Aadt: 0.80, effectiveAadtCap: 20000,
    benchmarkWeight: "manual classification required",
    note: "Manual review category; use only as a holding class until the site is classified."
  }
};

const PORTFOLIO_CURATOR_MODIFIER_CAPS = { min: 0.70, max: 1.50 };
const PORTFOLIO_CURATED_SITE_PROFILES = {
  "the_cope_shopping_centre": {
    active: true,
    confidence: "Medium",
    source: "Curated known-site review",
    modifiers: {
      catchment: { value: 1.00, label: "Normal", reason: "Selected AADT is retained as the base traffic input." },
      competition: { value: 1.00, label: "Not yet quantified", reason: "Competition profile has not yet been batch-scanned; no competition uplift is applied." },
      destination: { value: 1.30, label: "Strong retail destination", reason: "Strong retail/shopping destination behaviour is expected to capture more demand than a standard retail car park." },
      access: { value: 1.00, label: "Normal", reason: "No separate access/visibility modifier applied." }
    },
    note: "Reviewed retail destination-strength modifier applied. This is a transparent site-quality adjustment, not a hidden category retune."
  },
  "greenhills_hotel": {
    active: true,
    confidence: "Medium",
    source: "Curated known-site review",
    modifiers: {
      catchment: { value: 1.00, label: "Normal", reason: "AADT/catchment kept at base hotel assumption." },
      competition: { value: 1.00, label: "Not yet quantified", reason: "Competition profile has not yet been batch-scanned; no competition uplift is applied." },
      destination: { value: 1.25, label: "Strong hotel destination", reason: "Hotel/public destination behaviour appears stronger than the base hotel assumption." },
      access: { value: 1.00, label: "Normal", reason: "No separate access/visibility modifier applied." }
    },
    note: "Reviewed hotel destination-strength modifier applied."
  },
  "walsh_s_centra_service_station_roscommon": {
    active: true,
    confidence: "Medium",
    source: "Curated known-site review",
    modifiers: {
      catchment: { value: 1.25, label: "Strong town catchment", reason: "Town forecourt/local catchment appears stronger than a single AADT counter would normally represent." },
      competition: { value: 1.00, label: "Not yet quantified", reason: "Competition profile has not yet been batch-scanned; no competition uplift is applied." },
      destination: { value: 1.00, label: "Normal", reason: "No separate destination modifier applied." },
      access: { value: 1.00, label: "Normal", reason: "No separate access/visibility modifier applied." }
    },
    note: "Reviewed town-catchment modifier applied."
  },
  "corrib_oil_cork_city": {
    active: true,
    confidence: "Medium-low",
    source: "Curated known-site review",
    modifiers: {
      catchment: { value: 1.50, label: "Multi-corridor urban catchment", reason: "Selected AADT is likely to represent only part of the accessible Cork urban/corridor catchment." },
      competition: { value: 1.00, label: "Not yet quantified", reason: "Competition profile has not yet been batch-scanned; no competition uplift is applied." },
      destination: { value: 1.00, label: "Normal", reason: "No separate destination modifier applied." },
      access: { value: 1.00, label: "Normal", reason: "No separate access/visibility modifier applied." }
    },
    note: "Conservative multi-corridor catchment modifier applied and capped. Residual variance should still be treated as AADT/catchment review evidence."
  },
  "corrib_oil_swinford": {
    active: true,
    confidence: "Medium-low",
    source: "Curated known-site review",
    modifiers: {
      catchment: { value: 1.50, label: "Strong town catchment", reason: "Town forecourt catchment appears stronger than the selected approach-counter average." },
      competition: { value: 1.00, label: "Not yet quantified", reason: "Competition profile has not yet been batch-scanned; no competition uplift is applied." },
      destination: { value: 1.00, label: "Normal", reason: "No separate destination modifier applied." },
      access: { value: 1.00, label: "Normal", reason: "No separate access/visibility modifier applied." }
    },
    note: "Conservative strong-town-catchment modifier applied and capped. Residual variance should still be reviewed."
  }
};
function portfolioCuratorSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function portfolioSiteCuratorKey(site) {
  return portfolioCuratorSlug(site?.name || "");
}
function portfolioCategoryCompactLabel(key, label) {
  const map = {
    motorway_plaza: "Motorway",
    retail: "Retail",
    urban_service: "Urban service",
    town_hub_forecourt: "Town forecourt",
    hotel_destination: "Hotel",
    local_community: "Community",
    review: "Review"
  };
  return map[key] || label || "Review";
}
function portfolioCategoryCell(r) {
  const label = r?.category?.label || "Review";
  const compact = portfolioCategoryCompactLabel(r?.categoryKey, label);
  return `<span class="portfolio-category-label" title="${h(label)}">${h(compact)}</span>`;
}
function portfolioCategoryKey(site) {
  const n = String(site?.name || "").toLowerCase();
  if (site?.categoryKey && PORTFOLIO_CATEGORY_FACTORS[site.categoryKey]) return site.categoryKey;
  if (/(mallow plaza|tullamore|athlone|rhu glenn|junction 20)/.test(n)) return "motorway_plaza";
  if (/(retail|shopping|cope|supervalu|southgate|newbridge|leopardstown|axis)/.test(n)) return "retail";
  if (/(hotel|brehon|greenhills|charleville|castletroy|newtown)/.test(n)) return "hotel_destination";
  if (/(corrib|circle k|centra|walsh|dungarvan|fermoy|tralee|roscommon)/.test(n)) return "urban_service";
  if (/(town.hub|community.forecourt)/.test(n)) return "town_hub_forecourt";
  if (/(afc|community|gaa|sports)/.test(n)) return "local_community";
  return "review";
}
function portfolioMaturityLabel(tier) {
  return tier === "mature" ? "Mature" : tier === "near" ? "Near-mature" : tier === "early" ? "Early" : "Review";
}
function portfolioMaturityDescription(tier) {
  const map = {
    mature: {
      label: "Mature",
      title: "Mature site",
      body: "This site has at least 12 months of operating history. Annual kWh is based on trailing 365-day actuals and can be used for headline back-testing.",
      cls: "good"
    },
    near: {
      label: "Near-mature",
      title: "Near-mature site",
      body: "This site has around 10–12 months of operating history. Results are useful for validation, but should not be treated as full-year mature evidence yet.",
      cls: "warn"
    },
    early: {
      label: "Early",
      title: "Early site",
      body: "This site has less than 10 months of operating history. Annual kWh is annualised from recent run-rate and should be treated as directional only.",
      cls: "neutral"
    },
    review: {
      label: "Review",
      title: "Review site",
      body: "This site has incomplete or lower-confidence setup data. It is shown for reference, but should not be used for automatic model conclusions.",
      cls: "neutral"
    }
  };
  return map[tier] || map.review;
}
function portfolioMaturityBadge(tier) {
  const info = portfolioMaturityDescription(tier);
  return `<button type="button" class="portfolio-maturity-trigger" aria-label="Explain ${h(info.label)} maturity" data-portfolio-maturity-trigger="1" data-maturity="${h(tier || "review")}" data-title="${h(info.title)}" data-label="${h(info.label)}" data-description="${h(info.body)}"><span class="badge ${h(info.cls)}">${h(info.label)}</span></button>`;
}
function portfolioMaturityBadgeCompact(tier) {
  const info = portfolioMaturityDescription(tier);
  const compact = tier === "near" ? "Near" : info.label;
  return `<button type="button" class="portfolio-maturity-trigger" aria-label="Explain ${h(info.label)} maturity" data-portfolio-maturity-trigger="1" data-maturity="${h(tier || "review")}" data-title="${h(info.title)}" data-label="${h(info.label)}" data-description="${h(info.body)}"><span class="badge ${h(info.cls)}" title="${h(info.label)}">${h(compact)}</span></button>`;
}
const PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE = 0.15;
const PORTFOLIO_MATERIAL_VARIANCE_TOLERANCE = 0.30;
function portfolioVarianceBadge(v, options = {}) {
  if (!Number.isFinite(v)) return `<span class="badge warn">No actual</span>`;
  const abs = Math.abs(v);
  const cls = abs <= PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE ? "good" : abs <= PORTFOLIO_MATERIAL_VARIANCE_TOLERANCE ? "warn" : "bad";
  const text = `${v >= 0 ? "+" : ""}${pct(v,1)}`;
  const accuracyInfo = portfolioModelAccuracyInfo(v, options);
  const direction = v >= 0
    ? `Model is ${pct(abs,1)} higher than actual.`
    : `Actual is ${pct(abs,1)} higher than model.`;
  const lowDataNote = options.reason === "low_data" || options.lowData
    ? "Actual data exists but is low-volume/early, so treat the variance as directional rather than benchmark-grade."
    : "";
  const title = lowDataNote || `${accuracyInfo.label}: ${direction}`;
  if (options.static) return `<span class="badge ${cls}" title="${h(title)}">${text}</span>`;
  return `<button type="button" class="portfolio-variance-trigger badge ${cls}" aria-label="Explain variance ${h(text)}" data-portfolio-variance-trigger="1" data-variance="${h(text)}" data-accuracy="${h(accuracyInfo.label)}" data-direction="${h(direction)}" data-low-data-note="${h(lowDataNote)}" data-model-basis="${h(options.modelBasis || options.modelComparisonBasis || "Matched model year")}" data-actual="${h(Number.isFinite(options.actualAnnualKwh) ? kwh(options.actualAnnualKwh,0) : "—")}" data-model="${h(Number.isFinite(options.modelledAnnualKwh) ? kwh(options.modelledAnnualKwh,0) : "—")}" data-curator="${h(options.curatorSummary || "Curator framework: neutral 1.00× defaults; no reviewed site-quality modifier applied.")}">${text}</button>`;
}
function portfolioVarianceDisplayOptions(r) {
  return {
    reason: r?.annualVarianceSuppressedReason || null,
    lowData: r?.annualVarianceSuppressedReason === "low_data",
    actualAnnualKwh: Number(r?.actualAnnualKwh),
    modelledAnnualKwh: Number(r?.modelledAnnualKwh),
    modelBasis: r?.modelComparisonBasis || "Matched model year",
    curatorSummary: portfolioCuratorPopoverText(r?.curator)
  };
}
function portfolioModelAccuracyInfo(v, options = {}) {
  if (!Number.isFinite(v)) return { band: "no_actual", label: "No actual", cls: "warn", title: "No usable actual kWh is available for this comparison." };
  const abs = Math.abs(v);
  const lowData = options.reason === "low_data" || options.lowData;
  let info;
  if (abs <= 0.10) info = { band: "excellent", label: "Excellent fit", cls: "good" };
  else if (abs <= PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE) info = { band: "in_benchmark", label: "In benchmark", cls: "good" };
  else if (abs <= 0.25) info = { band: "moderate", label: "Moderate variance", cls: "warn" };
  else if (abs <= 0.50) info = { band: "high", label: "High variance", cls: "warn" };
  else info = { band: "major", label: "Major variance", cls: "bad" };
  info.title = lowData
    ? `${info.label}: actual data exists, but the volume/history is still low, so accuracy is directional.`
    : `${info.label}: model fit based only on matched annual kWh variance.`;
  info.lowData = lowData;
  return info;
}
function portfolioModelAccuracyBadge(v, options = {}) {
  const info = portfolioModelAccuracyInfo(v, options);
  const suffix = info.lowData && !options.compact ? " · low data" : "";
  const compactLabelMap = {
    excellent: "Excellent",
    in_benchmark: "Benchmark",
    moderate: "Moderate",
    high: "High",
    major: "Major",
    no_actual: "No actual"
  };
  const label = options.compact ? (compactLabelMap[info.band] || info.label) : info.label + suffix;
  const title = info.lowData && options.compact ? `${info.title} Low-data note is retained in the detail view, not in the variance column.` : info.title;
  return `<span class="badge ${info.cls}" title="${h(title)}">${h(label)}</span>`;
}
function portfolioModelAccuracySortValue(r) {
  return Number.isFinite(r?.annualKwhVariance) ? Math.abs(Number(r.annualKwhVariance)) : 999;
}
function portfolioIsModelInBenchmark(r) {
  return Number.isFinite(r?.annualKwhVariance) && Math.abs(Number(r.annualKwhVariance)) <= PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE;
}

function portfolioCalibrationFlag(r) {
  if (!Number.isFinite(r?.annualKwhVariance)) return { key: "no_actual", label: "No actual", cls: "neutral", note: "No usable actual kWh exists for calibration comparison." };
  if (r?.site?.benchmarkEligible === false) return { key: "setup", label: "Setup", cls: "warn", note: "Site is excluded or requires setup before being used as a calibration point." };
  if (r?.site?.maturity?.tier === "early") return { key: "ramp_up", label: "Ramp-up", cls: "neutral", note: "Early site: variance is shown, but should not be treated as final calibration evidence." };
  const aadtNeedsReview = ["medium-low", "review", "setup required"].includes(portfolioToken(r?.site?.aadtConfidence));
  if (aadtNeedsReview || r?.site?.categoryKey === "review") return { key: "setup", label: "Setup", cls: "warn", note: "AADT or category confidence requires setup review." };
  if (portfolioIsModelInBenchmark(r)) return { key: "benchmark", label: "Benchmark", cls: "good", note: "Mature/near-mature and matched variance is inside the agreed ±15% benchmark band." };
  return { key: "variance", label: "Variance", cls: "warn", note: "Mature/near-mature and matched variance is outside the agreed ±15% benchmark band." };
}

function portfolioCuratorProfile(site) {
  const categoryLabel = PORTFOLIO_CATEGORY_FACTORS[portfolioCategoryKey(site)]?.label || "Review";
  const defaults = {
    catchment: { value: 1.00, label: "Normal", reason: "No curated catchment/AADT uplift or reduction has been applied." },
    competition: { value: 1.00, label: "Not reviewed", reason: "Competition profile framework is present, but no reviewed competitor modifier is applied yet." },
    destination: { value: 1.00, label: "Normal", reason: "No curated destination-strength modifier has been applied." },
    access: { value: 1.00, label: "Normal", reason: "No curated access/visibility modifier has been applied." }
  };
  const key = portfolioSiteCuratorKey(site);
  const reviewed = site?.curatorProfile || PORTFOLIO_CURATED_SITE_PROFILES[key] || null;
  const modifiers = { ...defaults };
  if (reviewed?.modifiers) {
    Object.entries(reviewed.modifiers).forEach(([name, value]) => {
      modifiers[name] = { ...(defaults[name] || { value: 1, label: "Normal", reason: "" }), ...value };
    });
  }
  const combinedRaw = Object.values(modifiers).reduce((acc, item) => acc * Number(item.value || 1), 1);
  const combined = Math.max(PORTFOLIO_CURATOR_MODIFIER_CAPS.min, Math.min(PORTFOLIO_CURATOR_MODIFIER_CAPS.max, combinedRaw));
  const active = Boolean(reviewed?.active) && Math.abs(combined - 1) > 0.0001;
  return {
    active,
    confidence: reviewed?.confidence || "Neutral",
    source: reviewed?.source || "Curator framework default",
    baseCategory: categoryLabel,
    modifiers,
    combinedRaw,
    combined: active ? combined : 1,
    appliedMultiplier: active ? combined : 1,
    note: reviewed?.note || "Curator framework enabled with neutral 1.00× defaults. No demand output changes until a site has a reviewed, auditable modifier.",
    capped: active && Math.abs(combinedRaw - combined) > 0.0001
  };
}

function portfolioCuratorPopoverText(curator) {
  if (!curator) return "Curator framework not available.";
  const items = curator.modifiers || {};
  const state = curator.active ? `Reviewed modifier active from ${curator.source || "curated review"}` : "Neutral curator default";
  const capNote = curator.capped ? ` Combined raw modifier ${Number(curator.combinedRaw || 1).toFixed(2)}× was capped to ${Number(curator.combined || 1).toFixed(2)}×.` : "";
  return [
    `${state}. Combined modifier: ${Number(curator.appliedMultiplier || curator.combined || 1).toFixed(2)}×.${capNote}`,
    `Catchment: ${Number(items.catchment?.value || 1).toFixed(2)}× (${items.catchment?.label || "Normal"})`,
    `Competition: ${Number(items.competition?.value || 1).toFixed(2)}× (${items.competition?.label || "Not reviewed"})`,
    `Destination: ${Number(items.destination?.value || 1).toFixed(2)}× (${items.destination?.label || "Normal"})`,
    `Access/visibility: ${Number(items.access?.value || 1).toFixed(2)}× (${items.access?.label || "Normal"})`,
    curator.note || "Neutral framework only."
  ].join(" | ");
}

function portfolioVarianceBand(v) {
  if (!Number.isFinite(v)) return "no-data";
  const abs = Math.abs(v);
  if (abs <= 0.10) return "excellent10";
  if (abs <= PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE) return "within15";
  if (abs <= PORTFOLIO_MATERIAL_VARIANCE_TOLERANCE) return "material";
  return v > 0 ? "over" : "under";
}
function portfolioScenario(site, calibrated = false) {
  const key = portfolioCategoryKey(site);
  const factor = PORTFOLIO_CATEGORY_FACTORS[key] || PORTFOLIO_CATEGORY_FACTORS.review;
  return {
    ...DEFAULT_INPUTS,
    modelStartYear: 2025,
    codYear: 2025,
    trafficSourceYear: 2025,
    siteAddress: site.address || site.name,
    rawCorridorTrafficAadt: Number(site.aadt || 0),
    averageSessionEnergy: DEFAULT_INPUTS.averageSessionEnergy,
    netSellingPriceExVat: DEFAULT_INPUTS.netSellingPriceExVat,
    grossSellingPriceInclVat: DEFAULT_INPUTS.grossSellingPriceInclVat,
    baseFleetPlanningPower: DEFAULT_INPUTS.baseFleetPlanningPower,
    plugInOverstayOverheadHours: DEFAULT_INPUTS.plugInOverstayOverheadHours,
    siteRelevanceFactor: calibrated ? factor.relevance : DEFAULT_INPUTS.siteRelevanceFactor,
    siteCaptureRate: calibrated ? factor.capture : DEFAULT_INPUTS.siteCaptureRate,
    siteLimitationFactor: DEFAULT_INPUTS.siteLimitationFactor,
    annualBevShareGrowthRate: DEFAULT_INPUTS.annualBevShareGrowthRate,
    fastChargePropensity: DEFAULT_INPUTS.fastChargePropensity,
    peakWindowShare: DEFAULT_INPUTS.peakWindowShare,
    peakHourShareWithinPeakWindow: DEFAULT_INPUTS.peakHourShareWithinPeakWindow,
    rampUpYear1: DEFAULT_INPUTS.rampUpYear1,
    rampUpYear2: DEFAULT_INPUTS.rampUpYear2
  };
}
function portfolioModelYearRamp(inputs, yearIndex) {
  const y = Math.max(1, Math.round(Number(yearIndex || 1)));
  if (y === 1) return Number(inputs?.rampUpYear1 ?? DEFAULT_INPUTS.rampUpYear1 ?? 0.60);
  if (y === 2) return Number(inputs?.rampUpYear2 ?? DEFAULT_INPUTS.rampUpYear2 ?? 0.80);
  return 1;
}
function portfolioModelGrowthFactor(inputs, yearIndex) {
  // The category capture targets are treated as steady-state Year 3 benchmarks.
  // Year 1/2 are adjusted by ramp-up. Year 4+ grows from that steady-state base.
  const y = Math.max(1, Math.round(Number(yearIndex || 1)));
  const growthYears = Math.max(0, y - 3);
  const trafficGrowth = Number(inputs?.annualTrafficGrowthRate ?? DEFAULT_INPUTS.annualTrafficGrowthRate ?? 0.01);
  const bevGrowth = Number(inputs?.annualBevShareGrowthRate ?? DEFAULT_INPUTS.annualBevShareGrowthRate ?? 0.18);
  const bevStart = Math.max(0.0001, Number(inputs?.onRoadBevShareAtCod ?? DEFAULT_INPUTS.onRoadBevShareAtCod ?? 0.04));
  const bevCap = Math.max(bevStart, Number(inputs?.bevShareCap ?? DEFAULT_INPUTS.bevShareCap ?? 0.25));
  const bevFactor = Math.min(bevCap / bevStart, Math.pow(1 + bevGrowth, growthYears));
  return Math.pow(1 + trafficGrowth, growthYears) * bevFactor;
}
function portfolioCalibrationProfile(site) {
  const categoryKey = portfolioCategoryKey(site);
  const category = PORTFOLIO_CATEGORY_FACTORS[categoryKey] || PORTFOLIO_CATEGORY_FACTORS.review;
  const plugs = Number(site?.modelEquivalentPlugs || 0);
  const targetSessionsPer1000Aadt = categoryKey === "urban_service" && plugs >= 4
    ? Number(category.highPlugTargetSessionsPer1000Aadt || category.targetSessionsPer1000Aadt || 0)
    : Number(category.targetSessionsPer1000Aadt || 0);
  const rawAadt = Number(site?.aadt || 0);
  const effectiveAadtCap = Number(category.effectiveAadtCap || rawAadt || 0);
  const effectiveAadt = effectiveAadtCap > 0 ? Math.min(rawAadt, effectiveAadtCap) : rawAadt;
  return { categoryKey, category, targetSessionsPer1000Aadt, rawAadt, effectiveAadt, effectiveAadtCap };
}
function portfolioCalibratedAnnualEstimate(site, inputs, yearIndex = 1) {
  const profile = portfolioCalibrationProfile(site);
  const sessionEnergy = Number(inputs.averageSessionEnergy || DEFAULT_INPUTS.averageSessionEnergy || 30.4);
  const rampFactor = portfolioModelYearRamp(inputs, yearIndex);
  const growthFactor = portfolioModelGrowthFactor(inputs, yearIndex);
  const targetDailySessions = profile.effectiveAadt > 0
    ? (profile.effectiveAadt / 1000) * profile.targetSessionsPer1000Aadt * rampFactor * growthFactor
    : 0;
  let modelSessions = Math.max(0, targetDailySessions * 365);
  let modelKwh = Math.max(0, modelSessions * sessionEnergy);
  const destinationMonthlyFloorKwh = Number(profile.category.destinationMonthlyFloorKwh || 0);
  const destinationFloorMaxAadt = Number(profile.category.destinationFloorMaxAadt || Infinity);
  const floorAnnualKwh = destinationMonthlyFloorKwh * 12 * rampFactor * growthFactor;
  if (floorAnnualKwh > 0 && profile.rawAadt <= destinationFloorMaxAadt && modelKwh < floorAnnualKwh) {
    modelKwh = floorAnnualKwh;
    modelSessions = sessionEnergy > 0 ? modelKwh / sessionEnergy : modelSessions;
  }
  const baseModelKwh = modelKwh;
  const baseModelSessions = modelSessions;
  const curator = portfolioCuratorProfile(site);
  const curatorMultiplier = Number(curator?.appliedMultiplier || 1);
  if (curator?.active && curatorMultiplier > 0) {
    modelKwh *= curatorMultiplier;
    modelSessions *= curatorMultiplier;
  }
  return {
    ...profile,
    yearIndex: Math.max(1, Math.round(Number(yearIndex || 1))),
    rampFactor,
    growthFactor,
    curator,
    curatorMultiplier,
    baseModelKwh,
    baseModelSessions,
    modelKwh,
    modelSessions,
    modelRevenue: modelKwh * Number(inputs.netSellingPriceExVat || 0)
  };
}
function portfolioCalibratedMonthlyEstimate(site, inputs, yearIndex = site?.maturity?.comparisonYearIndex || 1) {
  const annual = portfolioCalibratedAnnualEstimate(site, inputs, yearIndex);
  return {
    ...annual,
    modelKwh: annual.modelKwh * 30 / 365,
    modelSessions: annual.modelSessions * 30 / 365,
    modelRevenue: annual.modelRevenue * 30 / 365
  };
}
function portfolioRun(site, calibrated = false) {
  const inputs = portfolioScenario(site, calibrated);
  const config = { ...DEFAULT_SELECTED_CONFIG, ...site.modelConfig };
  const demand = calculateDemand(inputs);
  const yearByYear = calculateYearByYear(inputs, config, demand);
  const financialSummary = summariseFinancials(inputs, config, demand, yearByYear, inputs.investmentHorizon);
  const idx = Math.max(0, Math.min((site.maturity?.comparisonYearIndex || 1) - 1, yearByYear.rows.length - 1));
  const row = yearByYear.rows[idx] || yearByYear.rows[0] || {};
  let calibrationProfile = null;
  let modelKwh = Math.max(0, Number(row.deliveredEnergyServedKwh || 0) / 12);
  let modelRevenue = Math.max(0, Number(row.totalRevenue || 0) / 12);
  let modelSessions = Math.max(0, Number(row.sessionsServed || 0) / 12);
  if (calibrated) {
    calibrationProfile = portfolioCalibratedMonthlyEstimate(site, inputs);
    modelKwh = calibrationProfile.modelKwh;
    modelRevenue = calibrationProfile.modelRevenue;
    modelSessions = calibrationProfile.modelSessions;
  }
  return { inputs, config, demand, yearByYear, financialSummary, compareRow: row, modelKwh, modelRevenue, modelSessions, calibrationProfile };
}
function portfolioOperatingMetrics(site) {
  const actual = site?.actual || {};
  const actualKwh = Number(actual.rolling30Kwh || 0);
  const actualSessions = Number(actual.rolling30Sessions || 0);
  const actualRevenue = Number(actual.rolling30NetRevenue || 0);
  const aadt = Number(site?.aadt || 0);
  const plugs = Number(site?.modelEquivalentPlugs || 0);
  const micKva = Number(site?.realMicKva || 0);
  const maturityDays = Number(site?.maturity?.dataDays || 0);
  const maturityTier = site?.maturity?.tier || "early";
  const operationalInfo = portfolioOperationalDaysInfo(site);
  const operationalDays = Number(operationalInfo?.days || 0);
  const cumulative = portfolioCumulativeActualsFromText(site);
  // Investor audit rule: when a daily_cumulative source gives both the total
  // kWh and the days denominator, annualised kWh must be recomputed from those
  // exact two values. Previously the table could show 67 days while still using
  // a stale dailyKwh value from a different denominator, which made the Days and
  // kWh columns internally inconsistent.
  let dailyKwh = 0;
  let dailySessions = 0;
  if (cumulative.kwhTotal > 0 && (operationalDays > 0 || cumulative.days > 0)) {
    const denominator = operationalDays > 0 ? operationalDays : cumulative.days;
    dailyKwh = cumulative.kwhTotal / denominator;
  } else {
    const rollDivisor = (maturityTier === "early" && maturityDays > 0 && maturityDays < 30) ? maturityDays : 30;
    dailyKwh = Number(actual.dailyKwh && rollDivisor === 30
      ? actual.dailyKwh
      : (actualKwh > 0 ? actualKwh / rollDivisor : actual.dailyKwh || 0));
  }
  if (cumulative.sessionsTotal > 0 && (operationalDays > 0 || cumulative.days > 0)) {
    const denominator = operationalDays > 0 ? operationalDays : cumulative.days;
    dailySessions = cumulative.sessionsTotal / denominator;
  } else {
    const rollDivisor = (maturityTier === "early" && maturityDays > 0 && maturityDays < 30) ? maturityDays : 30;
    dailySessions = Number(actual.dailySessions && rollDivisor === 30
      ? actual.dailySessions
      : (actualSessions > 0 ? actualSessions / rollDivisor : actual.dailySessions || 0));
  }
  const avgKwhSession = actualSessions > 0 ? actualKwh / actualSessions : Number(DEFAULT_INPUTS.averageSessionEnergy || 30.4);
  return {
    actualKwh,
    actualSessions,
    actualRevenue,
    dailyKwh,
    dailySessions,
    cumulativeKwhTotal: cumulative.kwhTotal || null,
    cumulativeSourceDays: cumulative.days || null,
    annualisedKwh: dailyKwh * 365,
    annualisedSessions: dailySessions * 365,
    avgKwhSession,
    revenuePerKwh: actualKwh > 0 ? actualRevenue / actualKwh : Number(DEFAULT_INPUTS.netSellingPriceExVat || 0),
    sessionsPer1000Aadt: aadt > 0 ? dailySessions / (aadt / 1000) : null,
    kwhPer1000Aadt: aadt > 0 ? dailyKwh / (aadt / 1000) : null,
    sessionsPerPlugDay: plugs > 0 ? dailySessions / plugs : null,
    kwhPerPlugDay: plugs > 0 ? dailyKwh / plugs : null,
    kwhPerKvaDay: micKva > 0 ? dailyKwh / micKva : null,
    plugs,
    micKva,
    aadt
  };
}
const PORTFOLIO_DAY_MS = 24 * 60 * 60 * 1000;
function portfolioParseDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : null;
}
function portfolioDateAddDays(date, days) {
  return new Date(date.getTime() + Number(days || 0) * PORTFOLIO_DAY_MS);
}
function portfolioDateDiffDays(start, end) {
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / PORTFOLIO_DAY_MS);
}
function portfolioDateLabel(date) {
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}
function portfolioActualDateInfo(site) {
  const diagnostics = site?.liveActuals?.diagnostics || {};
  const actual = site?.actual || {};
  const firstSessionDate = portfolioParseDate(diagnostics.firstCommercialSessionDate || diagnostics.firstSessionDate || actual.firstCommercialSessionDate || actual.firstSessionDate);
  const firstKwhDate = portfolioParseDate(diagnostics.firstCommercialKwhDate || diagnostics.firstKwhDate || actual.firstCommercialKwhDate || actual.firstKwhDate);
  const firstActiveDate = portfolioParseDate(diagnostics.firstActiveDate || actual.firstActiveDate);
  const latestDate = portfolioParseDate(diagnostics.latestDate || actual.asOfDate || site?.liveActuals?.asOfDate);
  return { firstSessionDate, firstKwhDate, firstActiveDate, latestDate };
}
function portfolioActualDataDays(site) {
  const actual = site?.actual || {};
  const liveActuals = site?.liveActuals || {};
  const diagnostics = liveActuals.diagnostics || {};
  // Prefer actual-source operating-day evidence over maturity defaults. The maturity
  // field is a modelling band and can be stale / rounded; using it first caused sites
  // such as Castleknock Hotel to show 180 days despite the actual source saying 67 days.
  const explicitTextDays = portfolioExplicitLiveDaysFromText(site);
  if (explicitTextDays > 0) return explicitTextDays;
  const candidates = [
    actual.dataDays,
    actual.operationalDays,
    actual.daysLive,
    actual.liveDays,
    liveActuals.dataDays,
    liveActuals.operationalDays,
    diagnostics.dataDays,
    diagnostics.operationalDays,
    diagnostics.daysLive,
    site?.maturity?.dataDays
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return 0;
}

function portfolioAnnualOperatingValues(site, metrics = portfolioOperatingMetrics(site)) {
  const actual = site?.actual || {};
  const explicitAnnualKwh = Number(actual.annualKwh || 0);
  const explicitAnnualSessions = Number(actual.annualSessions || 0);
  const explicitAnnualRevenue = Number(actual.annualNetRevenue || 0);
  const hasExplicitAnnual = explicitAnnualKwh > 0;
  const annualKwh = hasExplicitAnnual ? explicitAnnualKwh : Number(metrics.annualisedKwh || 0);
  const annualSessions = explicitAnnualSessions > 0 ? explicitAnnualSessions : Number(metrics.annualisedSessions || 0);
  const annualRevenue = explicitAnnualRevenue > 0 ? explicitAnnualRevenue : annualKwh * Number(metrics.revenuePerKwh || DEFAULT_INPUTS.netSellingPriceExVat || 0);
  const dataDays = portfolioActualDataDays(site);
  const dateInfo = portfolioActualDateInfo(site);
  const uploadedSuffix = site?.liveActuals?.source === "uploaded" ? ` · uploaded actuals${site.liveActuals.asOfDate ? ` as of ${site.liveActuals.asOfDate}` : ""}` : site?.liveActuals?.actualSourceStatus ? ` · ${site.liveActuals.actualSourceStatus}` : "";
  const periodEnd = dateInfo.latestDate;
  const periodStart = hasExplicitAnnual && periodEnd
    ? portfolioDateAddDays(periodEnd, -364)
    : periodEnd ? portfolioDateAddDays(periodEnd, -29) : null;
  const periodDays = hasExplicitAnnual ? 365 : 30;
  const periodLabel = periodStart && periodEnd ? `${portfolioDateLabel(periodStart)} → ${portfolioDateLabel(periodEnd)}` : (hasExplicitAnnual ? "trailing 365-day window" : "latest rolling 30-day window");
  const basis = hasExplicitAnnual
    ? `Trailing 365-day actual (${periodLabel})${uploadedSuffix}`
    : `Rolling 30-day run-rate annualised (${periodLabel})${uploadedSuffix}`;
  return { annualKwh, annualSessions, annualRevenue, hasExplicitAnnual, dataDays, basis, periodDays, periodStart, periodEnd, periodLabel, firstActiveDate: dateInfo.firstActiveDate };
}
function portfolioFallbackComparisonYearIndex(site, annualActual) {
  const explicit = Number(site?.maturity?.comparisonYearIndex || 0);
  if (explicit > 0) return Math.max(1, Math.min(20, Math.round(explicit)));
  const days = Number(annualActual?.dataDays || site?.maturity?.dataDays || 0);
  if (days >= 730) return 3;
  if (days >= 365) return 2;
  return 1;
}
function portfolioModelPeriodWeights(site, annualActual) {
  const fallbackYear = portfolioFallbackComparisonYearIndex(site, annualActual);
  const first = annualActual?.firstActiveDate;
  const start = annualActual?.periodStart;
  const end = annualActual?.periodEnd;
  if (annualActual?.hasExplicitAnnual && first && start && end) {
    const weights = [];
    for (let y = 1; y <= 20; y += 1) {
      const yearStart = portfolioDateAddDays(first, (y - 1) * 365);
      const yearEnd = portfolioDateAddDays(first, y * 365 - 1);
      const overlapStart = start.getTime() > yearStart.getTime() ? start : yearStart;
      const overlapEnd = end.getTime() < yearEnd.getTime() ? end : yearEnd;
      const overlapDays = portfolioDateDiffDays(overlapStart, overlapEnd);
      if (Number.isFinite(overlapDays) && overlapDays >= 0) weights.push({ yearIndex: y, days: overlapDays + 1 });
    }
    const totalDays = weights.reduce((acc, w) => acc + w.days, 0);
    if (totalDays > 0) {
      const weighted = weights.map(w => ({ ...w, weight: w.days / totalDays }));
      const label = weighted.length === 1
        ? `Model Year ${weighted[0].yearIndex}`
        : `Weighted ${weighted.map(w => `Y${w.yearIndex} ${Math.round(w.weight * 100)}%`).join(" / ")}`;
      return { weights: weighted, label, method: "Matched trailing 365-day operating window", comparisonYearIndex: weighted[Math.floor(weighted.length / 2)]?.yearIndex || fallbackYear };
    }
  }
  // For rolling 30-day data where firstActiveDate is known: determine which model year
  // the current 30-day window falls in, and compare the 30-day actual against the
  // model's 30-day equivalent for that year. This avoids the apples-vs-oranges problem
  // of comparing a current run-rate snapshot against a full-year-1 annualised model.
  if (!annualActual?.hasExplicitAnnual && first && end) {
    const daysLive = portfolioDateDiffDays(first, end);
    if (Number.isFinite(daysLive) && daysLive > 0) {
      const yearIndex = daysLive >= 730 ? 3 : daysLive >= 365 ? 2 : 1;
      const dayInYear = daysLive >= 730 ? daysLive - 730 : daysLive >= 365 ? daysLive - 365 : daysLive;
      const yearLabel = `Model Year ${yearIndex} (day ${daysLive} live)`;
      return {
        weights: [{ yearIndex, days: 30, weight: 1 }],
        label: yearLabel,
        method: "Rolling 30-day window matched to operating day via go-live date",
        comparisonYearIndex: yearIndex,
        daysLive,
        dayInYear
      };
    }
  }
  return { weights: [{ yearIndex: fallbackYear, days: 365, weight: 1 }], label: `Model Year ${fallbackYear}`, method: annualActual?.hasExplicitAnnual ? "Configured comparison year" : "Rolling 30-day run-rate matched to configured model year", comparisonYearIndex: fallbackYear };
}
function portfolioMatchedAnnualModel(site, inputs, annualActual) {
  const period = portfolioModelPeriodWeights(site, annualActual);
  const parts = period.weights.map(w => ({ ...w, estimate: portfolioCalibratedAnnualEstimate(site, inputs, w.yearIndex) }));
  const modelKwh = parts.reduce((acc, p) => acc + p.estimate.modelKwh * p.weight, 0);
  const modelSessions = parts.reduce((acc, p) => acc + p.estimate.modelSessions * p.weight, 0);
  const modelRevenue = parts.reduce((acc, p) => acc + p.estimate.modelRevenue * p.weight, 0);
  const profile = parts[0]?.estimate || portfolioCalibratedAnnualEstimate(site, inputs, period.comparisonYearIndex);
  const basis = `${period.label} · ${period.method}`;
  return { modelKwh, modelSessions, modelRevenue, basis, period, profile };
}

function portfolioModelBasisShortLabel(basis = "") {
  const text = String(basis || "Model year");
  const yearMatch = text.match(/Model Year\s*(\d+)/i);
  const weightedMatch = text.match(/Weighted\s+([^·]+)/i);
  const yearPart = weightedMatch ? weightedMatch[1].trim().replace(/\s*\/\s*/g, "/") : yearMatch ? `Y${yearMatch[1]}` : "Model year";
  let periodPart = "basis";
  if (/trailing\s*365/i.test(text) || /trailing/i.test(text)) periodPart = "trailing 365D";
  else if (/rolling\s*30/i.test(text) || /run-rate/i.test(text)) periodPart = "rolling 30D";
  else if (/configured/i.test(text)) periodPart = "configured year";
  return `${yearPart} · ${periodPart}`;
}

function portfolioQuantile(values, q) {
  const vals = values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!vals.length) return null;
  const pos = (vals.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return vals[base + 1] !== undefined ? vals[base] + rest * (vals[base + 1] - vals[base]) : vals[base];
}
function portfolioMetricStats(values) {
  const vals = values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!vals.length) return { count: 0, p25: null, p50: null, p75: null, min: null, max: null };
  return {
    count: vals.length,
    p25: portfolioQuantile(vals, 0.25),
    p50: portfolioQuantile(vals, 0.50),
    p75: portfolioQuantile(vals, 0.75),
    min: vals[0],
    max: vals[vals.length - 1]
  };
}
function portfolioCompareMetric(value, stats, tolerance = 0.10) {
  if (!Number.isFinite(value) || !stats || !Number.isFinite(stats.p25) || !Number.isFinite(stats.p75)) return "review";
  if (value < stats.p25 * (1 - tolerance)) return "below";
  if (value > stats.p75 * (1 + tolerance)) return "above";
  return "within";
}
function portfolioBenchmarksByCategory(sites = portfolioSites()) {
  const benchmarkPool = sites.filter(site => site.benchmarkEligible !== false);
  const benchmarks = {};
  Object.keys(PORTFOLIO_CATEGORY_FACTORS).forEach(categoryKey => {
    const sameCategory = benchmarkPool.filter(site => portfolioCategoryKey(site) === categoryKey);
    let sample = sameCategory.filter(site => ["mature", "near"].includes(site.maturity?.tier));
    let sampleBasis = "mature + near peers";
    if (sample.length < 2) {
      sample = sameCategory;
      sampleBasis = sample.length ? "all available peers" : "portfolio fallback";
    }
    if (sample.length < 2) {
      sample = benchmarkPool.filter(site => ["mature", "near"].includes(site.maturity?.tier));
      sampleBasis = "all mature + near benchmark sites fallback";
    }
    const metrics = sample.map(portfolioOperatingMetrics);
    benchmarks[categoryKey] = {
      categoryKey,
      label: PORTFOLIO_CATEGORY_FACTORS[categoryKey]?.label || "Review",
      sampleCount: sample.length,
      sampleBasis,
      siteNames: sample.map(s => s.name),
      sessionsPer1000Aadt: portfolioMetricStats(metrics.map(m => m.sessionsPer1000Aadt)),
      kwhPer1000Aadt: portfolioMetricStats(metrics.map(m => m.kwhPer1000Aadt)),
      sessionsPerPlugDay: portfolioMetricStats(metrics.map(m => m.sessionsPerPlugDay)),
      kwhPerPlugDay: portfolioMetricStats(metrics.map(m => m.kwhPerPlugDay)),
      kwhPerKvaDay: portfolioMetricStats(metrics.map(m => m.kwhPerKvaDay)),
      avgKwhSession: portfolioMetricStats(metrics.map(m => m.avgKwhSession)),
      revenuePerKwh: portfolioMetricStats(metrics.map(m => m.revenuePerKwh))
    };
  });
  return benchmarks;
}
function portfolioBenchmarkKwhRange(site, benchmark) {
  const profile = portfolioCalibrationProfile(site);
  const sessionStats = benchmark?.sessionsPer1000Aadt || {};
  const avgSession = Number(benchmark?.avgKwhSession?.p50 || DEFAULT_INPUTS.averageSessionEnergy || 30.4);
  const lowCapture = Number.isFinite(sessionStats.p25) ? sessionStats.p25 : profile.targetSessionsPer1000Aadt * 0.75;
  const medCapture = Number.isFinite(sessionStats.p50) ? sessionStats.p50 : profile.targetSessionsPer1000Aadt;
  const highCapture = Number.isFinite(sessionStats.p75) ? sessionStats.p75 : profile.targetSessionsPer1000Aadt * 1.25;
  const effectiveAadt = Number(profile.effectiveAadt || site.aadt || 0);
  // Annual benchmark range. The model is year-based, so the portfolio table compares annual kWh, not 30D/monthly kWh.
  let low = Math.max(0, (effectiveAadt / 1000) * lowCapture * avgSession * 365);
  const median = Math.max(0, (effectiveAadt / 1000) * medCapture * avgSession * 365);
  let high = Math.max(0, (effectiveAadt / 1000) * highCapture * avgSession * 365);
  if (low === high && median > 0) {
    low = median * 0.85;
    high = median * 1.15;
  }
  return { low, median, high, effectiveAadt, avgSession };
}
function portfolioBenchmarkPosition(actualKwh, range) {
  if (!range || !Number.isFinite(range.low) || !Number.isFinite(range.high) || !Number.isFinite(actualKwh)) return "review";
  if (actualKwh < range.low * 0.90) return "below";
  if (actualKwh > range.high * 1.10) return "above";
  return "within";
}
function portfolioFormatRange(low, high, digits = 0, suffix = "") {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "—";
  return `${number(low, digits)}–${number(high, digits)}${suffix}`;
}
function portfolioDoNothingPath(site, metrics, derived, inputs) {
  const startYear = Number(inputs?.modelStartYear || 2025);
  const installedOutputs = Math.max(0, Number(derived?.installedOutputs || site?.modelEquivalentPlugs || 0));
  const installedPowerKw = Math.max(0, Number(derived?.installedChargerPowerKw || 0));
  const micKva = Math.max(0, Number(site?.realMicKva || inputs?.selectedMicKva || 0));
  const gridPowerKw = micKva * Number(inputs?.powerFactor || DEFAULT_INPUTS.powerFactor || 0.98);
  const annualTrafficGrowth = Number(inputs?.annualTrafficGrowthRate ?? DEFAULT_INPUTS.annualTrafficGrowthRate ?? 0.01);
  const annualBevGrowth = Number(inputs?.annualBevShareGrowthRate ?? DEFAULT_INPUTS.annualBevShareGrowthRate ?? 0.18);
  const bevStart = Math.max(0.0001, Number(inputs?.onRoadBevShareAtCod ?? DEFAULT_INPUTS.onRoadBevShareAtCod ?? 0.04));
  const bevCap = Math.max(bevStart, Number(inputs?.bevShareCap ?? DEFAULT_INPUTS.bevShareCap ?? 0.25));
  const baseFleetPower = Number(inputs?.baseFleetPlanningPower || DEFAULT_INPUTS.baseFleetPlanningPower || 60);
  const sessionEnergy = Number(metrics?.avgKwhSession || inputs?.averageSessionEnergy || DEFAULT_INPUTS.averageSessionEnergy || 30.4);
  const overhead = Number(inputs?.plugInOverstayOverheadHours || DEFAULT_INPUTS.plugInOverstayOverheadHours || 0.03);
  const peakShare = Number(inputs?.peakWindowShare || DEFAULT_INPUTS.peakWindowShare || 0.50);
  const peakHourShare = Number(inputs?.peakHourShareWithinPeakWindow || DEFAULT_INPUTS.peakHourShareWithinPeakWindow || 0.25);
  const designFloor = Number(inputs?.designPeakFloorSessions || DEFAULT_INPUTS.designPeakFloorSessions || 1);
  const netPrice = Number(inputs?.netSellingPriceExVat || DEFAULT_INPUTS.netSellingPriceExVat || 0.66);
  const yearRows = [];
  let techUplift = 1;
  let durationUplift = 1;
  let firstPlugYear = null;
  let firstMicYear = null;
  let firstChargerYear = null;
  let firstConstraintYear = null;
  let lostKwh20yr = 0;
  for (let t = 0; t < 20; t += 1) {
    if (t === 0) {
      techUplift = 1;
      durationUplift = 1;
    } else {
      const techRate = t <= 10 ? Number(inputs?.techUpliftEarlyPhaseRate ?? DEFAULT_INPUTS.techUpliftEarlyPhaseRate ?? 0.025) : Number(inputs?.techUpliftMiddlePhaseRate ?? DEFAULT_INPUTS.techUpliftMiddlePhaseRate ?? 0.01);
      const techCap = Number(inputs?.techUpliftCap ?? DEFAULT_INPUTS.techUpliftCap ?? 1.25);
      const durationResponse = Number(inputs?.durationResponseFactor ?? DEFAULT_INPUTS.durationResponseFactor ?? 0.4);
      techUplift = Math.min(techCap, techUplift * (1 + techRate));
      durationUplift = Math.min(techCap, durationUplift * (1 + techRate * durationResponse));
    }
    const bevFuture = Math.min(bevCap, bevStart * Math.pow(1 + annualBevGrowth, t));
    const growthFactor = Math.pow(1 + annualTrafficGrowth, t) * (bevFuture / bevStart);
    const dailySessions = Math.max(0, Number(metrics?.dailySessions || 0) * growthFactor);
    const annualKwhDemand = dailySessions * 365 * sessionEnergy;
    const fleetPowerKw = baseFleetPower * techUplift;
    const sessionDurationHrs = sessionEnergy / Math.max(1, fleetPowerKw / durationUplift) + overhead;
    const peakConcurrentSessions = Math.max(designFloor, dailySessions * peakShare * peakHourShare * sessionDurationHrs);
    const peakDemandKw = peakConcurrentSessions * fleetPowerKw;
    const requiredMicKva = peakDemandKw / Math.max(0.01, Number(inputs?.powerFactor || DEFAULT_INPUTS.powerFactor || 0.98));
    const plugPlanningTrigger = installedOutputs > 0 && peakConcurrentSessions > installedOutputs * 0.80;
    const micPlanningTrigger = gridPowerKw > 0 && peakDemandKw > gridPowerKw * 0.90;
    const chargerPlanningTrigger = installedPowerKw > 0 && peakDemandKw > installedPowerKw * 0.90;
    if (!firstPlugYear && plugPlanningTrigger) firstPlugYear = startYear + t;
    if (!firstMicYear && micPlanningTrigger) firstMicYear = startYear + t;
    if (!firstChargerYear && chargerPlanningTrigger) firstChargerYear = startYear + t;
    const plugRatio = installedOutputs > 0 ? Math.min(1, installedOutputs / Math.max(1, peakConcurrentSessions)) : 0;
    const micRatio = gridPowerKw > 0 ? Math.min(1, gridPowerKw / Math.max(1, peakDemandKw)) : 0;
    const chargerRatio = installedPowerKw > 0 ? Math.min(1, installedPowerKw / Math.max(1, peakDemandKw)) : 0;
    const capacityRatio = Math.min(1, plugRatio, micRatio, chargerRatio);
    const lostKwh = Math.max(0, annualKwhDemand * (1 - capacityRatio));
    if (!firstConstraintYear && (capacityRatio < 0.98 || plugPlanningTrigger || micPlanningTrigger || chargerPlanningTrigger)) firstConstraintYear = startYear + t;
    lostKwh20yr += lostKwh;
    yearRows.push({
      year: startYear + t,
      dailySessions,
      annualKwhDemand,
      peakConcurrentSessions,
      requiredPlugs: Math.ceil(peakConcurrentSessions),
      peakDemandKw,
      requiredMicKva,
      capacityRatio,
      lostKwh,
      plugPlanningTrigger,
      micPlanningTrigger,
      chargerPlanningTrigger
    });
  }
  const firstPlanningYear = [firstPlugYear, firstMicYear, firstChargerYear].filter(Boolean).sort((a,b)=>a-b)[0] || null;
  const firstActionYear = [firstConstraintYear, firstPlanningYear].filter(Boolean).sort((a,b)=>a-b)[0] || null;
  const risk = firstActionYear && firstActionYear <= startYear + 3 ? "high" : firstActionYear && firstActionYear <= startYear + 8 ? "medium" : "low";
  const triggerDrivers = [
    firstPlugYear === firstActionYear ? "plug utilisation" : "",
    firstMicYear === firstActionYear ? "MIC/grid power" : "",
    firstChargerYear === firstActionYear ? "charger output" : ""
  ].filter(Boolean);
  return {
    startYear,
    installedOutputs,
    installedPowerKw,
    micKva,
    firstPlugYear,
    firstMicYear,
    firstChargerYear,
    firstConstraintYear,
    firstActionYear,
    triggerDrivers,
    risk,
    lostKwh20yr,
    lostRevenue20yr: lostKwh20yr * netPrice,
    year20: yearRows[19] || {},
    rows: yearRows
  };
}
function portfolioPerformanceInfo(band, row = null) {
  if (row?.annualVarianceSuppressedReason === "no_actual") return { cls: "neutral", label: "No actual" };
  if (band === "maturity_ramp") return { cls: "neutral", label: "Ramp-up" };
  const map = {
    capacity_pressure: { cls: "bad", label: "Pressure" },
    under_capture: { cls: "warn", label: "Review" },
    outperforming: { cls: "warn", label: "Review" },
    normal: { cls: "good", label: "Monitor" },
    review: { cls: "warn", label: "Review" },
    no_actual: { cls: "neutral", label: "No actual" }
  };
  return map[band] || map.review;
}
function portfolioPerformanceCompactLabel(label, band, row = null) {
  const map = {
    "Ramp-up": "Ramp-up",
    "Pressure": "Pressure",
    "Monitor": "Monitor",
    "Review": "Review",
    "No actual": "No actual"
  };
  return map[label] || label;
}
function portfolioPerformanceBadge(band, row = null, options = {}) {
  const item = portfolioPerformanceInfo(band, row);
  const label = options.compact ? portfolioPerformanceCompactLabel(item.label, band, row) : item.label;
  const title = options.compact ? item.label : "";
  return `<span class="badge ${item.cls}"${title ? ` title="${h(title)}"` : ""}>${h(label)}</span>`;
}
function portfolioRiskBadge(risk) {
  if (risk === "high") return `<span class="badge bad">High</span>`;
  if (risk === "medium") return `<span class="badge warn">Medium</span>`;
  return `<span class="badge good">Low</span>`;
}
function portfolioBenchmarkStatusLabel(status) {
  return status === "below" ? "Below peer range" : status === "above" ? "Above peer range" : status === "within" ? "Within peer range" : "Review";
}
function portfolioTriggerLabel(path) {
  return path?.firstActionYear ? `${path.firstActionYear}${path.triggerDrivers?.length ? ` · ${path.triggerDrivers.join(" + ")}` : ""}` : "No trigger in 20yr";
}

function portfolioPctText(value, digits = 1) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}
function portfolioSiteAssessment(site, metrics, benchmark, benchmarkRange, doNothing, comparison = {}) {
  const captureStatus = portfolioCompareMetric(metrics.sessionsPer1000Aadt, benchmark?.sessionsPer1000Aadt, 0.10);
  const plugStatus = portfolioCompareMetric(metrics.kwhPerPlugDay, benchmark?.kwhPerPlugDay, 0.10);
  const micStatus = portfolioCompareMetric(metrics.kwhPerKvaDay, benchmark?.kwhPerKvaDay, 0.10);
  const benchmarkPosition = portfolioBenchmarkPosition(comparison.actualAnnualKwh ?? metrics.annualisedKwh, benchmarkRange);
  const isEarly = site.maturity?.tier === "early";
  const aadtNeedsReview = ["medium-low", "review", "setup required"].includes(portfolioToken(site.aadtConfidence));
  const nearTermCapacity = doNothing.firstActionYear && doNothing.firstActionYear <= doNothing.startYear + 5;
  const capacityDriver = doNothing.triggerDrivers?.join(" + ") || (plugStatus === "above" ? "plug utilisation" : micStatus === "above" ? "MIC/grid power" : "capacity");
  const variance = Number(comparison.annualVariance);
  const hasVariance = Number.isFinite(variance);
  const withinBenchmarkVariance = hasVariance && Math.abs(variance) <= PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE;
  const materialVariance = hasVariance && Math.abs(variance) > PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE;
  const modelAboveActual = hasVariance && variance > PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE;
  const actualAboveModel = hasVariance && variance < -PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE;
  const capacitySignal = nearTermCapacity || plugStatus === "above" || micStatus === "above";

  let underlyingBand = "normal";
  let underlyingDiagnosis = withinBenchmarkVariance
    ? `Model fit is within ±${Math.round(PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE * 100)}% for the matched comparison basis.`
    : "Peer productivity is broadly in line with the benchmark for this site category.";
  if (modelAboveActual) {
    underlyingBand = "under_capture";
    underlyingDiagnosis = `Matched model is ${portfolioPctText(Math.abs(variance),1)} above actuals, so this is outside the ±${Math.round(PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE * 100)}% benchmark range.`;
  } else if (actualAboveModel) {
    underlyingBand = capacitySignal ? "capacity_pressure" : "outperforming";
    underlyingDiagnosis = `Actuals are ${portfolioPctText(Math.abs(variance),1)} above the matched model. ${capacitySignal ? `Capacity pressure is also visible (${capacityDriver}).` : "The site is outperforming or the model is under-forecasting this site."}`;
  } else if (!hasVariance) {
    if ((captureStatus === "below" || benchmarkPosition === "below") && plugStatus !== "above" && micStatus !== "above" && !nearTermCapacity) {
      underlyingBand = "under_capture";
      underlyingDiagnosis = "Actual data is below comparable sites, while infrastructure productivity is not yet the main constraint.";
    }
    if ((captureStatus === "above" || benchmarkPosition === "above") && !nearTermCapacity && plugStatus !== "below") {
      underlyingBand = "outperforming";
      underlyingDiagnosis = "Actual data is above comparable sites; growth should be monitored before congestion appears.";
    }
  }
  if (capacitySignal && !modelAboveActual) {
    underlyingBand = "capacity_pressure";
    underlyingDiagnosis = `Infrastructure pressure is visible or forecast soon (${capacityDriver}).`;
  }

  let band = "normal";
  let diagnosis = `Matched model variance is within ±${Math.round(PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE * 100)}%, so this site is inside the benchmark range.`;
  let action = "Monitor; no immediate capex. Re-test expansion when utilisation trigger appears.";
  let priority = 4;
  let secondaryBand = null;
  let secondaryDiagnosis = "";

  if (isEarly) {
    if (!hasVariance) {
      band = "no_actual";
      diagnosis = "No usable actual kWh exists for this early site, so live calibration is not yet possible.";
      action = "Wait for live operating data before interpreting variance or status.";
      priority = 5;
    } else if (aadtNeedsReview || site.categoryKey === "review") {
      band = "review";
      diagnosis = "Site is early and has lower AADT/category confidence, so it needs setup review before the model output is relied on.";
      action = "Review AADT relevance, category and live-data mapping. Treat variance as directional until the setup is confirmed.";
      priority = 5;
    } else {
      band = "maturity_ramp";
      const lowDataNote = comparison.actualAnnualKwh > 0 && comparison.actualAnnualKwh < (500 * 365 / 30)
        ? " Actual volume is also low, so the variance is directional only."
        : "";
      diagnosis = `Site is still ramping. Variance is shown, but it should not be treated as final calibration evidence until the site matures.${lowDataNote}`;
      action = "Monitor ramp-up and customer availability for 6–12 months before major expansion unless queueing or a confirmed setup issue is visible.";
      priority = 4;
      secondaryBand = capacitySignal ? "capacity_pressure" : underlyingBand !== "normal" ? underlyingBand : null;
      secondaryDiagnosis = secondaryBand ? underlyingDiagnosis : "Variance remains available in the Variance column; Status is intentionally kept simple during ramp-up.";
    }
    return { band, diagnosis, action, priority, captureStatus, plugStatus, micStatus, benchmarkPosition, secondaryBand, secondaryDiagnosis, withinBenchmarkVariance, annualVariance: variance };
  }

  if (!hasVariance) {
    band = "no_actual";
    diagnosis = "No usable actual kWh exists for this site, so live calibration is not yet possible.";
    action = "Wait for live operating data before interpreting variance or status.";
    priority = 5;
    return { band, diagnosis, action, priority, captureStatus, plugStatus, micStatus, benchmarkPosition, secondaryBand, secondaryDiagnosis, withinBenchmarkVariance, annualVariance: variance };
  }

  if (aadtNeedsReview || site.categoryKey === "review") {
    band = "review";
    diagnosis = "AADT/category confidence is not strong enough for an automatic capex recommendation.";
    action = "Manually review AADT relevance, category and local competitors before changing plugs or MIC.";
    priority = 5;
    return { band, diagnosis, action, priority, captureStatus, plugStatus, micStatus, benchmarkPosition, secondaryBand, secondaryDiagnosis, withinBenchmarkVariance, annualVariance: variance };
  }

  if (capacitySignal && !modelAboveActual) {
    band = "capacity_pressure";
    diagnosis = actualAboveModel
      ? `Actuals are above the matched model and infrastructure pressure is visible or forecast soon (${capacityDriver}).`
      : `Infrastructure pressure is visible or forecast soon (${capacityDriver}), even though the model fit may be acceptable.`;
    action = "Model staged expansion: add plugs where utilisation is high; test MIC uplift versus battery where grid power becomes the bottleneck.";
    priority = 1;
  } else if (modelAboveActual) {
    band = "review";
    diagnosis = `The matched model is ${portfolioPctText(Math.abs(variance),1)} above actuals, outside the ±${Math.round(PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE * 100)}% benchmark range.`;
    action = "Review site capture and model assumptions before capex. Check signage, visibility, parking/access, pricing and local competitor effects.";
    priority = 2;
  } else if (actualAboveModel) {
    band = "review";
    diagnosis = `Actuals are ${portfolioPctText(Math.abs(variance),1)} above the matched model, outside the ±${Math.round(PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE * 100)}% benchmark range.`;
    action = "Review whether the model is under-forecasting demand, or whether the site has a catchment/capacity signal not yet represented in the model.";
    priority = 2;
  } else if (withinBenchmarkVariance) {
    band = "normal";
    diagnosis = `Matched actuals and model are within ±${Math.round(PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE * 100)}%, so the site is in benchmark.`;
    action = "Monitor; no immediate capex. Use this site as a valid calibration point if the setup and AADT confidence remain strong.";
    priority = 4;
  } else if (materialVariance) {
    band = "review";
    diagnosis = `Variance is outside the accepted ±${Math.round(PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE * 100)}% benchmark range.`;
    action = variance > 0 ? "Review site capture and model assumptions before capex." : "Review whether model assumptions are under-forecasting demand before expansion.";
    priority = 2;
  } else if ((captureStatus === "below" || benchmarkPosition === "below") && plugStatus !== "above" && micStatus !== "above" && !nearTermCapacity) {
    band = "review";
    diagnosis = "Demand capture is below comparable sites, while infrastructure productivity is not yet the main constraint.";
    action = "Review site capture first: signage, app visibility, parking/access, pricing and local partnerships. Defer MIC/plugs until utilisation improves.";
    priority = 2;
  } else if ((captureStatus === "above" || benchmarkPosition === "above") && !nearTermCapacity && plugStatus !== "below") {
    band = "review";
    diagnosis = "The site is above its peer benchmark; review whether this is genuine performance, catchment effect or model under-forecast before expansion.";
    action = "Review the demand driver and monitor trigger year; add plugs/MIC only when the utilisation path supports it.";
    priority = 2;
  }
  return { band, diagnosis, action, priority, captureStatus, plugStatus, micStatus, benchmarkPosition, secondaryBand, secondaryDiagnosis, withinBenchmarkVariance, annualVariance: variance };
}
function portfolioSiteResults(site, benchmarks = portfolioBenchmarksByCategory()) {
  const base = portfolioRun(site, false);
  const calibrated = portfolioRun(site, true);
  const actualKwh = Number(site.actual?.rolling30Kwh || 0);
  const actualRevenue = Number(site.actual?.rolling30NetRevenue || 0);
  const actualSessions = Number(site.actual?.rolling30Sessions || 0);
  const variance = (model, actual) => actual > 0 ? (model - actual) / actual : null;
  const categoryKey = portfolioCategoryKey(site);
  const category = PORTFOLIO_CATEGORY_FACTORS[categoryKey] || PORTFOLIO_CATEGORY_FACTORS.review;
  const metrics = portfolioOperatingMetrics(site);
  const annualActual = portfolioAnnualOperatingValues(site, metrics);
  const matchedModel = portfolioMatchedAnnualModel(site, calibrated.inputs, annualActual);
  const benchmark = benchmarks[categoryKey] || benchmarks.review;
  const benchmarkRange = portfolioBenchmarkKwhRange(site, benchmark);
  const doNothing = portfolioDoNothingPath(site, metrics, calibrated.yearByYear?.derived, calibrated.inputs);
  // Always calculate variance where actual annual kWh exists. Low-volume sites remain flagged,
  // but the Variance column must show the mathematical result rather than replacing it with a label.
  const lowDataThresholdAnnualKwh = 500 * 365 / 30;
  const hasAnyActualAnnualKwh = annualActual.annualKwh > 0;
  const annualVarianceSuppressedReason = hasAnyActualAnnualKwh && annualActual.annualKwh < lowDataThresholdAnnualKwh ? "low_data" : !hasAnyActualAnnualKwh ? "no_actual" : null;
  const annualKwhVariance = hasAnyActualAnnualKwh ? variance(matchedModel.modelKwh, annualActual.annualKwh) : null;
  const curator = portfolioCuratorProfile(site);
  const assessment = portfolioSiteAssessment(site, metrics, benchmark, benchmarkRange, doNothing, {
    annualVariance: annualKwhVariance,
    actualAnnualKwh: annualActual.annualKwh,
    modelledAnnualKwh: matchedModel.modelKwh,
    modelBasis: matchedModel.basis
  });
  const observedSessionsPer1000Aadt = Number(site.actual?.sessionsPer1000Aadt || metrics.sessionsPer1000Aadt || 0);
  const baseAnnualKwh = Number(base.compareRow?.deliveredEnergyServedKwh || base.modelKwh * 12 || 0);
  const baseAnnualRevenue = Number(base.compareRow?.totalRevenue || base.modelRevenue * 12 || 0);
  const baseAnnualSessions = Number(base.compareRow?.sessionsServed || base.modelSessions * 12 || 0);
  const matchedModelProfile = matchedModel.profile || calibrated.calibrationProfile || portfolioCalibrationProfile(site);
  return {
    site, categoryKey, category,
    inputs: base.inputs, config: base.config, demand: base.demand, yearByYear: base.yearByYear,
    financialSummary: base.financialSummary, compareRow: base.compareRow,
    actualKwh, actualRevenue, actualSessions,
    actualAnnualKwh: annualActual.annualKwh,
    actualAnnualRevenue: annualActual.annualRevenue,
    actualAnnualSessions: annualActual.annualSessions,
    actualAnnualBasis: annualActual.basis,
    actualPeriodLabel: annualActual.periodLabel,
    actualPeriodDays: annualActual.periodDays,
    metrics,
    benchmark,
    benchmarkRange,
    doNothing,
    curator,
    assessment,
    modelKwh: base.modelKwh, modelRevenue: base.modelRevenue, modelSessions: base.modelSessions,
    calibratedKwh: calibrated.modelKwh, calibratedRevenue: calibrated.modelRevenue, calibratedSessions: calibrated.modelSessions,
    baseAnnualKwh, baseAnnualRevenue, baseAnnualSessions,
    modelledAnnualKwh: matchedModel.modelKwh,
    modelledAnnualRevenue: matchedModel.modelRevenue,
    modelledAnnualSessions: matchedModel.modelSessions,
    modelComparisonBasis: matchedModel.basis,
    modelComparisonPeriod: matchedModel.period,
    calibratedProfile: matchedModelProfile,
    targetSessionsPer1000Aadt: matchedModelProfile?.targetSessionsPer1000Aadt ?? null,
    effectiveAadt: matchedModelProfile?.effectiveAadt ?? Number(site.aadt || 0),
    modelRampFactor: matchedModelProfile?.rampFactor ?? null,
    modelGrowthFactor: matchedModelProfile?.growthFactor ?? null,
    kwhVariance: variance(base.modelKwh, actualKwh), revenueVariance: variance(base.modelRevenue, actualRevenue), sessionsVariance: variance(base.modelSessions, actualSessions),
    calibratedKwhVariance: variance(calibrated.modelKwh, actualKwh), calibratedRevenueVariance: variance(calibrated.modelRevenue, actualRevenue), calibratedSessionsVariance: variance(calibrated.modelSessions, actualSessions),
    annualKwhVariance,
    annualVarianceSuppressedReason,
    baseAnnualKwhVariance: variance(baseAnnualKwh, annualActual.annualKwh),
    observedSessionsPer1000Aadt,
    modelToActualFactor: baseAnnualKwh > 0 ? annualActual.annualKwh / baseAnnualKwh : null,
    varianceBand: portfolioVarianceBand(annualKwhVariance)
  };
}


function medianAbsVariance(rows, field) {
  const vals = rows.map(r => Math.abs(Number(r[field]))).filter(Number.isFinite).sort((a,b)=>a-b);
  return vals.length ? vals[Math.floor(vals.length / 2)] : null;
}
function portfolioAccuracySummary(results, field = "calibratedKwhVariance", matureOnly = true) {
  const mature = results.filter(r => r.site.maturity?.tier === "mature" && Number.isFinite(r[field]));
  const all = results.filter(r => Number.isFinite(r[field]));
  const base = matureOnly ? mature : all;
  const median = medianAbsVariance(base, field);
  const within10 = base.length ? base.filter(r => Math.abs(r[field]) <= 0.10).length / base.length : null;
  const within15 = base.length ? base.filter(r => Math.abs(r[field]) <= PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE).length / base.length : null;
  const within20 = base.length ? base.filter(r => Math.abs(r[field]) <= 0.20).length / base.length : null;
  return { baseCount: base.length, matureCount: mature.length, allCount: all.length, median, within10, within15, within20 };
}
function calibrationInsight(r) {
  return r?.assessment?.diagnosis || "Actual operating data is benchmarked against comparable operating hubs to guide capture and capacity decisions.";
}
function portfolioFilterValue(key, fallback = "all") {
  return localStorage.getItem(`evHub.portfolio.${key}`) || fallback;
}
function portfolioFilterValues(key) {
  const raw = portfolioFilterValue(key);
  if (!raw || raw === "all") return [];
  return raw.split(",").map(v => v.trim()).filter(Boolean);
}
function portfolioFilterMatches(key, value) {
  const selected = portfolioFilterValues(key);
  return !selected.length || selected.includes(String(value));
}
function portfolioFilterSummary(key, options, allLabel) {
  const selected = portfolioFilterValues(key);
  if (!selected.length) return allLabel || "All";
  const labels = selected.map(v => options.find(o => String(o.value) === String(v))?.label || v);
  return labels.length <= 2 ? labels.join(", ") : `${labels.length} selected`;
}
function portfolioToken(value) {
  return String(value || "").trim().toLowerCase();
}
function portfolioSortableNumber(value, missing = Number.POSITIVE_INFINITY) {
  const n = Number(value);
  return Number.isFinite(n) ? n : missing;
}
function portfolioApplyFilters(results) {
  return results.filter(r => {
    if (!portfolioFilterMatches("maturity", r.site.maturity?.tier || "review")) return false;
    if (!portfolioFilterMatches("category", r.categoryKey)) return false;
    if (!portfolioFilterMatches("confidence", portfolioToken(r.site.aadtConfidence))) return false;
    const mic = Number(r.site.realMicKva || 0);
    const micGroup = mic > 0 && mic <= 199 ? "low" : mic >= 200 && mic <= 400 ? "mid" : mic >= 700 ? "high" : "other";
    if (!portfolioFilterMatches("micBand", micGroup)) return false;
    return true;
  });
}

function portfolioSortResults(results) {
  const sortKey = portfolioFilterValue("sortKey", "site");
  const dir = portfolioFilterValue("sortDir", "asc") === "desc" ? -1 : 1;
  const getters = {
    site: r => r.site.name,
    maturity: r => portfolioMaturityLabel(r.site.maturity?.tier),
    category: r => r.category.label,
    performance: r => r.assessment?.band || "review",
    investmentPriority: r => Number(r.assessment?.priority || 9) * 10000 + portfolioSortableNumber(r.doNothing?.firstActionYear, 9999),
    mic: r => Number(r.site.realMicKva || 0),
    aadt: r => Number(r.site.aadt || 0),
    actualAnnualKwh: r => portfolioSortableNumber(r.actualAnnualKwh),
    modelledAnnualKwh: r => portfolioSortableNumber(r.modelledAnnualKwh),
    annualVariance: r => portfolioSortableNumber(r.annualKwhVariance),
    modelAccuracy: r => portfolioModelAccuracySortValue(r),
    absAnnualVariance: r => Math.abs(portfolioSortableNumber(r.annualKwhVariance)),
    firstTriggerYear: r => {
      if (Number.isFinite(Number(r.doNothing?.firstActionYear))) return Number(r.doNothing.firstActionYear);
      const startYear = Number(r.doNothing?.startYear || 2025);
      if (["capacity_pressure", "under_capture"].includes(r.assessment?.band)) return startYear;
      if (r.assessment?.band === "maturity_ramp") return startYear + 1;
      if (r.assessment?.band === "review") return 9998;
      return 9999;
    },
    sessionsPer1000Aadt: r => portfolioSortableNumber(r.metrics?.sessionsPer1000Aadt),
    kwhPerPlugDay: r => portfolioSortableNumber(r.metrics?.kwhPerPlugDay),
    kwhPerKvaDay: r => portfolioSortableNumber(r.metrics?.kwhPerKvaDay),
    baseKwh: r => portfolioSortableNumber(r.modelKwh),
    calibratedKwh: r => portfolioSortableNumber(r.calibratedKwh),
    baseVariance: r => portfolioSortableNumber(r.kwhVariance),
    calibratedVariance: r => portfolioSortableNumber(r.calibratedKwhVariance)
  };
  const get = getters[sortKey] || getters.investmentPriority;
  return [...results].sort((a,b) => {
    const av = get(a), bv = get(b);
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * dir;
    const aMissing = !Number.isFinite(av);
    const bMissing = !Number.isFinite(bv);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return (av - bv) * dir;
  });
}

function portfolioMultiFilter(id, key, options, label, allLabel = "All") {
  const selected = portfolioFilterValues(key);
  const summary = portfolioFilterSummary(key, options, allLabel);
  const clearChecked = selected.length === 0 ? "checked" : "";
  return `<details class="portfolio-multi-filter" name="portfolio-filter" data-filter-menu="${h(key)}"><summary><span>${h(label)}</span><strong>${h(summary)}</strong></summary><div class="portfolio-multi-filter-menu"><label><input type="checkbox" data-portfolio-filter="${h(key)}" value="all" ${clearChecked}> <span>${h(allLabel)}</span></label>${options.map(o => `<label><input type="checkbox" data-portfolio-filter="${h(key)}" value="${h(o.value)}" ${selected.includes(String(o.value)) ? "checked" : ""}> <span>${h(o.label)}</span></label>`).join("")}</div></details>`;
}
function portfolioActionSummary(r) {
  const band = r?.assessment?.band || "review";
  const trigger = r?.doNothing?.firstActionYear;
  if (band === "capacity_pressure") return { year: trigger ? String(trigger) : "Now", action: "Model expansion" };
  if (band === "under_capture") return { year: "Review", action: "Review variance" };
  if (band === "outperforming") return { year: "Review", action: "Review variance" };
  if (band === "maturity_ramp") return { year: "6–12m", action: "Monitor ramp" };
  if (band === "normal") return { year: trigger ? String(trigger) : "Monitor", action: "Monitor" };
  return { year: "Review", action: "Manual review" };
}
function portfolioStatusText(band) {
  const map = {
    capacity_pressure: "Pressure",
    under_capture: "Review",
    outperforming: "Review",
    no_actual: "No actual",
    normal: "Monitor",
    maturity_ramp: "Ramp-up",
    review: "Review"
  };
  return map[band] || map.review;
}
function portfolioStatusButton(r) {
  const band = r?.assessment?.band || "review";
  const action = portfolioActionSummary(r);
  const diagnosis = r?.assessment?.diagnosis || "Review the selected site.";
  const recommendation = r?.assessment?.action || action.action || "Review manually.";
  const trigger = portfolioTriggerLabel(r?.doNothing);
  const drivers = r?.doNothing?.triggerDrivers?.join(" + ") || "No near-term driver";
  const benchmarkPosition = portfolioBenchmarkStatusLabel(r?.assessment?.benchmarkPosition);
  const secondaryBand = r?.assessment?.secondaryBand || null;
  const secondaryText = secondaryBand ? portfolioStatusText(secondaryBand) : "";
  const secondaryDiagnosis = r?.assessment?.secondaryDiagnosis || "";
  const statusInfo = portfolioPerformanceInfo(band, r);
  const varianceText = Number.isFinite(r?.annualKwhVariance) ? h((r.annualKwhVariance >= 0 ? "+" : "") + pct(r.annualKwhVariance,1)) : "—";
  const accuracyInfo = portfolioModelAccuracyInfo(r?.annualKwhVariance, portfolioVarianceDisplayOptions(r));
  const lowDataNote = r?.annualVarianceSuppressedReason === "low_data" ? "Actual exists but volume/history is low; treat variance and accuracy as directional." : "";
  return `<button type="button" class="portfolio-status-trigger" aria-label="Open recommendation for ${h(r?.site?.name || "site")}" data-portfolio-status-trigger="1" data-site="${h(r?.site?.name || "Site")}" data-status="${h(statusInfo.label)}" data-year="${h(action.year)}" data-action="${h(action.action)}" data-recommendation="${h(recommendation)}" data-diagnosis="${h(diagnosis)}" data-secondary-status="${h(secondaryText)}" data-secondary-diagnosis="${h(secondaryDiagnosis)}" data-low-data-note="${h(lowDataNote)}" data-trigger="${h(trigger)}" data-drivers="${h(drivers)}" data-benchmark-position="${h(benchmarkPosition)}" data-model-basis="${h(r?.modelComparisonBasis || "Model year")}" data-variance="${varianceText}" data-accuracy="${h(accuracyInfo.label)}">${portfolioPerformanceBadge(band, r, { compact: true })}</button>`;
}
function closePortfolioStatusPopover() {
  const existing = document.getElementById("portfolioStatusPopover");
  if (existing) existing.remove();
  document.querySelectorAll("[data-portfolio-status-trigger][aria-expanded='true'], [data-portfolio-maturity-trigger][aria-expanded='true'], [data-portfolio-variance-trigger][aria-expanded='true']").forEach(btn => btn.setAttribute("aria-expanded", "false"));
}
function closePortfolioFilterMenus(except = null) {
  document.querySelectorAll(".portfolio-multi-filter[open]").forEach(details => {
    if (details !== except) details.open = false;
  });
}
function showPortfolioStatusPopover(button) {
  if (!button) return;
  const current = document.getElementById("portfolioStatusPopover");
  const sameButton = current?.dataset?.sourceId && current.dataset.sourceId === button.dataset.popoverSourceId;
  closePortfolioStatusPopover();
  if (sameButton) return;
  if (!button.dataset.popoverSourceId) button.dataset.popoverSourceId = `status-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pop = document.createElement("div");
  pop.id = "portfolioStatusPopover";
  pop.className = "portfolio-status-popover";
  pop.dataset.sourceId = button.dataset.popoverSourceId;
  pop.innerHTML = `
    <div class="portfolio-status-popover-head">
      <div><span class="eyebrow">Recommended action</span><strong>${h(button.dataset.status || "Status")}</strong></div>
      <button type="button" class="portfolio-status-popover-close" aria-label="Close recommendation">×</button>
    </div>
    <div class="portfolio-status-popover-body">
      <p><strong>${h(button.dataset.site || "Selected site")}</strong></p>
      <div class="portfolio-status-popover-kpis"><span><small>Action year</small><b>${h(button.dataset.year || "Monitor")}</b></span><span><small>Action</small><b>${h(button.dataset.action || "Review")}</b></span><span><small>Variance</small><b>${h(button.dataset.variance || "—")}</b></span></div>
      <p><strong>Recommendation:</strong> ${h(button.dataset.recommendation || "Review the site manually.")}</p>
      <p><strong>Why:</strong> ${h(button.dataset.diagnosis || "Benchmark diagnostics unavailable.")}</p>
      ${button.dataset.secondaryStatus ? `<p class="notice small"><strong>Secondary signal:</strong> ${h(button.dataset.secondaryStatus)} — ${h(button.dataset.secondaryDiagnosis || "Confirm with more operating history.")}</p>` : ""}${button.dataset.lowDataNote ? `<p class="notice small"><strong>Low-data note:</strong> ${h(button.dataset.lowDataNote)}</p>` : ""}
      <p class="muted small"><strong>Model basis:</strong> ${h(button.dataset.modelBasis || "Model year")} · <strong>Trigger:</strong> ${h(button.dataset.trigger || "No trigger in 20yr")} · <strong>Driver:</strong> ${h(button.dataset.drivers || "No near-term driver")} · ${h(button.dataset.benchmarkPosition || "Review")}</p>
    </div>`;
  document.body.appendChild(pop);
  button.setAttribute("aria-expanded", "true");
  const closeBtn = pop.querySelector(".portfolio-status-popover-close");
  if (closeBtn) closeBtn.addEventListener("click", ev => { ev.stopPropagation(); closePortfolioStatusPopover(); });
  const rect = button.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(360, Math.max(280, window.innerWidth - margin * 2));
  pop.style.width = `${width}px`;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  let top = rect.bottom + 8;
  requestAnimationFrame(() => {
    const popRect = pop.getBoundingClientRect();
    if (top + popRect.height > window.innerHeight - margin) top = Math.max(margin, rect.top - popRect.height - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  });
}

function showPortfolioVariancePopover(button) {
  if (!button) return;
  const current = document.getElementById("portfolioStatusPopover");
  const sameButton = current?.dataset?.sourceId && current.dataset.sourceId === button.dataset.popoverSourceId;
  closePortfolioStatusPopover();
  if (sameButton) return;
  if (!button.dataset.popoverSourceId) button.dataset.popoverSourceId = `variance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pop = document.createElement("div");
  pop.id = "portfolioStatusPopover";
  pop.className = "portfolio-status-popover portfolio-variance-popover";
  pop.dataset.sourceId = button.dataset.popoverSourceId;
  pop.innerHTML = `
    <div class="portfolio-status-popover-head">
      <div><span class="eyebrow">Model fit detail</span><strong>${h(button.dataset.accuracy || "Variance")}</strong></div>
      <button type="button" class="portfolio-status-popover-close" aria-label="Close variance detail">×</button>
    </div>
    <div class="portfolio-status-popover-body">
      <div class="portfolio-status-popover-kpis"><span><small>Variance</small><b>${h(button.dataset.variance || "—")}</b></span><span><small>Actual</small><b>${h(button.dataset.actual || "—")}</b></span><span><small>Model</small><b>${h(button.dataset.model || "—")}</b></span></div>
      <p><strong>Meaning:</strong> ${h(button.dataset.direction || "Matched model annual kWh compared with actual annual kWh.")}</p>
      ${button.dataset.lowDataNote ? `<p class="notice small"><strong>Low-data note:</strong> ${h(button.dataset.lowDataNote)}</p>` : ""}
      <p class="muted small"><strong>Model basis:</strong> ${h(button.dataset.modelBasis || "Matched model year")} · Green means inside the agreed ±15% benchmark range.</p>
      <p class="muted small"><strong>Curator framework:</strong> ${h(button.dataset.curator || "Neutral 1.00× defaults; no reviewed site-quality modifier applied.")}</p>
    </div>`;
  document.body.appendChild(pop);
  button.setAttribute("aria-expanded", "true");
  const closeBtn = pop.querySelector(".portfolio-status-popover-close");
  if (closeBtn) closeBtn.addEventListener("click", ev => { ev.stopPropagation(); closePortfolioStatusPopover(); });
  const rect = button.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(360, Math.max(280, window.innerWidth - margin * 2));
  pop.style.width = `${width}px`;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  let top = rect.bottom + 8;
  requestAnimationFrame(() => {
    const popRect = pop.getBoundingClientRect();
    if (top + popRect.height > window.innerHeight - margin) top = Math.max(margin, rect.top - popRect.height - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  });
}
function showPortfolioMaturityPopover(button) {
  if (!button) return;
  const current = document.getElementById("portfolioStatusPopover");
  const sameButton = current?.dataset?.sourceId && current.dataset.sourceId === button.dataset.popoverSourceId;
  closePortfolioStatusPopover();
  if (sameButton) return;
  if (!button.dataset.popoverSourceId) button.dataset.popoverSourceId = `maturity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pop = document.createElement("div");
  pop.id = "portfolioStatusPopover";
  pop.className = "portfolio-status-popover portfolio-maturity-popover";
  pop.dataset.sourceId = button.dataset.popoverSourceId;
  pop.innerHTML = `
    <div class="portfolio-status-popover-head">
      <div><span class="eyebrow">Maturity definition</span><strong>${h(button.dataset.title || "Maturity")}</strong></div>
      <button type="button" class="portfolio-status-popover-close" aria-label="Close maturity definition">×</button>
    </div>
    <div class="portfolio-status-popover-body">
      <p>${h(button.dataset.description || "Maturity definition unavailable.")}</p>
      <p class="muted small">Maturity affects how strongly the app should rely on the annualised actuals and status recommendation. Early sites should be reviewed as directional ramp-up evidence, not final performance proof.</p>
    </div>`;
  document.body.appendChild(pop);
  button.setAttribute("aria-expanded", "true");
  const closeBtn = pop.querySelector(".portfolio-status-popover-close");
  if (closeBtn) closeBtn.addEventListener("click", ev => { ev.stopPropagation(); closePortfolioStatusPopover(); });
  const rect = button.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(360, Math.max(280, window.innerWidth - margin * 2));
  pop.style.width = `${width}px`;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  let top = rect.bottom + 8;
  requestAnimationFrame(() => {
    const popRect = pop.getBoundingClientRect();
    if (top + popRect.height > window.innerHeight - margin) top = Math.max(margin, rect.top - popRect.height - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  });
}

function portfolioSortHeader(key, label) {
  const currentKey = portfolioFilterValue("sortKey", "site");
  const dir = portfolioFilterValue("sortDir", "asc");
  const arrow = currentKey === key ? (dir === "asc" ? " ↑" : " ↓") : "";
  return `<button type="button" class="sort-header" data-portfolio-sort="${h(key)}">${h(label)}${arrow}</button>`;
}
function portfolioBenchmarkCard(title, value, sub) {
  return `<div class="benchmark-mini-card"><strong>${title}</strong><span>${value}</span><small>${sub || ""}</small></div>`;
}
function portfolioSiteSelectOptions(mappedSites, additionalSites, selectedId) {
  const mappedOptions = mappedSites.map(s => `<option value="${h(s.id)}" ${s.id === selectedId ? "selected" : ""}>${h(s.name)}</option>`).join("");
  const additionalOptions = additionalSites.map(s => `<option value="${h(s.id)}" ${s.id === selectedId ? "selected" : ""}>${h(s.name)} · uploaded / setup required</option>`).join("");
  return `${mappedOptions ? `<optgroup label="Mapped calibration hubs">${mappedOptions}</optgroup>` : ""}${additionalOptions ? `<optgroup label="Uploaded live sites requiring setup">${additionalOptions}</optgroup>` : ""}`;
}
function renderPortfolioCalibration() {
  const mappedPortfolioSiteList = portfolioSites();
  const additionalPortfolioSites = portfolioAdditionalLiveSites(mappedPortfolioSiteList);
  const selectorSiteList = [...mappedPortfolioSiteList, ...additionalPortfolioSites];
  const selectedId = localStorage.getItem("evHub.portfolio.selectedSite") || selectorSiteList[0]?.id;
  const selected = selectorSiteList.find(s => s.id === selectedId) || selectorSiteList[0];
  const benchmarks = portfolioBenchmarksByCategory(mappedPortfolioSiteList);
  const results = mappedPortfolioSiteList.map(site => portfolioSiteResults(site, benchmarks));
  const selectedResult = portfolioSiteResults(selected, benchmarks);
  const selectedProfile = selectedResult.calibratedProfile || portfolioCalibrationProfile(selected);
  const filtered = portfolioApplyFilters(results);
  const sorted = portfolioSortResults(filtered);
  const benchmarkEligibleCount = mappedPortfolioSiteList.filter(site => site.benchmarkEligible !== false).length;
  const mature = results.filter(r => r.site.maturity?.tier === "mature" && r.site.benchmarkEligible !== false);
  const near = results.filter(r => r.site.maturity?.tier === "near" && r.site.benchmarkEligible !== false);
  const capacityCount = filtered.filter(r => r.assessment?.band === "capacity_pressure").length;
  const underCaptureCount = filtered.filter(r => r.assessment?.band === "under_capture").length;
  const normalCount = filtered.filter(r => portfolioIsModelInBenchmark(r)).length;
  const earliestTrigger = filtered.map(r => r.doNothing?.firstActionYear).filter(Boolean).sort((a,b)=>a-b)[0];
  const medianAbsAnnualVariance = medianAbsVariance(filtered, "annualKwhVariance");
  const siteOptions = portfolioSiteSelectOptions(mappedPortfolioSiteList, additionalPortfolioSites, selected?.id);
  const row = r => [
    `<div class="portfolio-site-cell"><strong>${h(r.site.name)}</strong></div>`,
    portfolioMaturityBadgeCompact(r.site.maturity?.tier),
    portfolioCategoryCell(r),
    number(r.site.realMicKva,0) + " kVA",
    number(r.site.aadt,0),
    kwh(r.actualAnnualKwh,0),
    kwh(r.modelledAnnualKwh,0),
    portfolioVarianceBadge(r.annualKwhVariance, portfolioVarianceDisplayOptions(r))
  ];
  const headers = [
    portfolioSortHeader("site", "Site"),
    portfolioSortHeader("maturity", "Maturity"),
    portfolioSortHeader("category", "Category"),
    portfolioSortHeader("mic", "MIC"),
    portfolioSortHeader("aadt", "AADT"),
    portfolioSortHeader("actualAnnualKwh", "Actual / annualised kWh/yr"),
    portfolioSortHeader("modelledAnnualKwh", "Matched model kWh/yr"),
    portfolioSortHeader("annualVariance", "Variance")
  ];
  const maturityOptions = [{value:"mature",label:"Mature"},{value:"near",label:"Near-mature"},{value:"early",label:"Early"},{value:"review",label:"Review"}];
  const categoryOptions = Object.entries(PORTFOLIO_CATEGORY_FACTORS).map(([value, cfg]) => ({ value, label: cfg.label }));
  const confidenceOptions = [{value:"high",label:"High"},{value:"medium-high",label:"Medium-high"},{value:"medium",label:"Medium"},{value:"medium-low",label:"Medium-low"},{value:"review",label:"Review"}];
  const micBandOptions = [{value:"low",label:"≤199 kVA"},{value:"mid",label:"200–400 kVA"},{value:"high",label:"700+ kVA"},{value:"other",label:"Other MIC"}];
  const selectedFilterCard = (title, value, sub) => kpi(title, value || "—", sub || "current filters");
  const sortKey = portfolioFilterValue("sortKey", "site");
  const sortDir = portfolioFilterValue("sortDir", "asc") === "desc" ? "high to low" : "low to high";
  const sortNames = {
    site: "site", maturity: "maturity", category: "category", performance: "status", investmentPriority: "investment priority", mic: "MIC", aadt: "AADT",
    actualAnnualKwh: "actual annual kWh", modelledAnnualKwh: "matched model annual kWh", annualVariance: "annual variance", absAnnualVariance: "absolute annual variance",
    firstTriggerYear: "first trigger year", sessionsPer1000Aadt: "actual sessions per 1k AADT", kwhPerPlugDay: "kWh per plug per day", kwhPerKvaDay: "kWh per kVA per day"
  };
  const selectedBenchmark = selectedResult.benchmark;
  const peerMedianCapture = selectedBenchmark?.sessionsPer1000Aadt?.p50;
  const peerMedianPlug = selectedBenchmark?.kwhPerPlugDay?.p50;
  const peerMedianMic = selectedBenchmark?.kwhPerKvaDay?.p50;
  const selectedMethodCards = [
    portfolioBenchmarkCard("Capture benchmark", `${number(selectedResult.metrics.sessionsPer1000Aadt,2)} vs ${number(peerMedianCapture,2)}`, "actual vs peer median sess/1k AADT"),
    portfolioBenchmarkCard("Plug productivity", `${number(selectedResult.metrics.kwhPerPlugDay,1)} vs ${number(peerMedianPlug,1)}`, "actual vs peer median kWh/plug/day"),
    portfolioBenchmarkCard("MIC productivity", `${number(selectedResult.metrics.kwhPerKvaDay,2)} vs ${number(peerMedianMic,2)}`, "actual vs peer median kWh/kVA/day"),
    portfolioBenchmarkCard("Benchmark basis", `${number(selectedBenchmark.sampleCount,0)} peers`, selectedBenchmark.sampleBasis)
  ].join("");
  const selectedAction = portfolioActionSummary(selectedResult);
  const selectedCapex = portfolioCapexInfo(selected, selectedResult.financialSummary?.initialInvestment || 0);
  const selectedCapexCards = selectedCapex.actual > 0
    ? `${kpi("Actual CAPEX", currency(selectedCapex.actual,0), "provided project cost")}${kpi("Model-equivalent CAPEX", currency(selectedCapex.model,0), "before actual override")}${kpi("CAPEX variance", Number.isFinite(selectedCapex.variance) ? currency(selectedCapex.variance,0) : "—", "model minus actual")}`
    : `${kpi("CAPEX estimate", selected?.uploadedNeedsSetup ? "Setup required" : currency(selectedCapex.model,0), selected?.uploadedNeedsSetup ? "confirm setup first" : "actual CAPEX not provided")}`;
  return `
    ${sectionTitle("Portfolio Calibration", "Compare live actuals against the matched model year using MIC, AADT, maturity and site category.")}
    <section class="portfolio-hero panel"><div><span class="eyebrow">Operating intelligence layer</span><h3>Matched actual vs modelled performance</h3><p>The main table matches actual performance to the relevant model year/basis before calculating variance. Variance is the model-fit signal. The previous Status column has been removed so the calibration view stays focused on model accuracy.</p></div><div class="portfolio-summary-grid mature-only-summary">${kpi("Clean benchmark sites", number(benchmarkEligibleCount,0), `${number(results.length,0)} mapped sites shown`)}${kpi("Benchmark basis", `${number(mature.length + near.length,0)} sites`, "mature + near where possible")}${kpi("In benchmark", number(results.filter(r => portfolioIsModelInBenchmark(r)).length,0), "inside ±15%")}${kpi("Curator active", number(results.filter(r => r.curator?.active).length,0), "reviewed site modifiers")}</div></section>
    <section class="panel portfolio-method-note compact"><h3>How to read this page</h3><p class="muted">AADT shows passing traffic opportunity. MIC shows available grid capacity. Annual kWh and variance compare the live actual period against the matched model year/basis. Variance is always the mathematical model-vs-actual result where actual exists. Click a variance badge to see the accuracy label, model basis and curator audit. Reviewed modifiers are visible and auditable.</p></section>
    ${portfolioLiveCalibrationCard(mappedPortfolioSiteList)}
    <section class="panel portfolio-selector-panel"><div class="field"><label for="portfolioSiteSelect">Select operating hub</label><select id="portfolioSiteSelect">${siteOptions}</select><small>Mapped hubs can load directly into the model. Uploaded-only live sites show actuals but require MIC, AADT and charger setup before model loading.</small></div>${!portfolioCanLoadSite(selected) ? `<button type="button" class="secondary" id="applyPortfolioSite">Cannot load site</button>` : `<button type="button" class="primary" id="applyPortfolioSite">Load site into model + map</button>`}</section>
    <section class="panel selected-backtest-card"><div class="selected-backtest-head"><div><span class="eyebrow">Selected hub</span><h3>${h(selected.name)}</h3><p>${h(selected.address || "Address unavailable")}</p></div>${portfolioMaturityBadge(selected.maturity?.tier)}</div><div class="portfolio-summary-grid selected-hub-overview">${kpi("Actual / annualised kWh/yr", kwh(selectedResult.actualAnnualKwh,0), selectedResult.actualAnnualBasis)}${kpi("Matched model kWh/yr", kwh(selectedResult.modelledAnnualKwh,0), selectedResult.modelComparisonBasis)}${kpi("Variance", portfolioVarianceBadge(selectedResult.annualKwhVariance, portfolioVarianceDisplayOptions(selectedResult)), "matched model vs actual; click for accuracy detail")}${kpi("kWh/plug/day", number(selectedResult.metrics.kwhPerPlugDay,1), "actual productivity")}${kpi("AADT", number(selected.aadt,0), "vehicles/day")}${kpi("MIC", kva(selected.realMicKva,0), "actual connection")}${kpi("Calibration flag", `<span class='badge ${h(portfolioCalibrationFlag(selectedResult).cls)}'>${h(portfolioCalibrationFlag(selectedResult).label)}</span>`, h(portfolioCalibrationFlag(selectedResult).note))}${selectedCapexCards}</div>${!portfolioCanLoadSite(selected) ? `<div class="notice warn"><strong>Site cannot be loaded into the model.</strong> ${h(portfolioLoadBlockReason(selected))}</div>` : ""}${selectedCapex.note ? `<div class="notice"><strong>CAPEX note:</strong> ${h(selectedCapex.note)}</div>` : ""}<div class="notice"><strong>Calibration flag:</strong> ${h(portfolioCalibrationFlag(selectedResult).note)}</div><div class="portfolio-accordion-stack"><details class="portfolio-diagnostic-details"><summary>Traffic and benchmark detail</summary><div class="portfolio-benchmark-grid">${selectedMethodCards}</div><div class="portfolio-config-grid compact"><div><strong>Matched AADT</strong><span>${number(selected.aadt,0)} veh/day · ${h(selected.aadtCounter || "AADT counter")}</span></div><div><strong>AADT method</strong><span>${h(selected.aadtAggregationMethod || "curated / automatic counter selection")}</span></div><div><strong>AADT basis note</strong><span>${h(selected.aadtBasisNote || "AADT mapped from TII counter database")}</span></div><div><strong>Effective benchmark AADT</strong><span>${number(selectedProfile.effectiveAadt,0)} veh/day after site-type cap</span></div><div><strong>Matched model basis</strong><span>${h(selectedResult.modelComparisonBasis || "Model year")}</span></div><div><strong>Model factors applied</strong><span>${h(selectedResult.category.label)} · target ${number(selectedResult.targetSessionsPer1000Aadt,2)} sess/1k AADT · ramp ${pct(selectedResult.modelRampFactor,0)} · growth ${number(selectedResult.modelGrowthFactor,2)}x</span></div><div><strong>Curator framework</strong><span>${h(portfolioCuratorPopoverText(selectedResult.curator))}</span></div><div><strong>Actual sessions / 1k AADT</strong><span>${number(selectedResult.metrics.sessionsPer1000Aadt,2)}</span></div><div><strong>Peer kWh/plug/day median</strong><span>${number(peerMedianPlug,1)}</span></div></div></details><details class="portfolio-diagnostic-details"><summary>MIC / grid capacity detail</summary><div class="portfolio-config-grid compact"><div><strong>Current MIC</strong><span>${kva(selected.realMicKva,0)}</span></div><div><strong>Recommended MIC by Year 20</strong><span>${kva(selectedResult.doNothing.year20?.requiredMicKva,0)}</span></div><div><strong>Year 20 MIC gap</strong><span>${kva(Math.max(0, Number(selectedResult.doNothing.year20?.requiredMicKva || 0) - Number(selected.realMicKva || 0)),0)}</span></div><div><strong>First MIC trigger</strong><span>${selectedResult.doNothing.firstMicYear ? h(String(selectedResult.doNothing.firstMicYear)) : "No MIC trigger in 20yr"}</span></div></div></details><details class="portfolio-diagnostic-details"><summary>Configuration and 20-year do-nothing path</summary><div class="portfolio-config-grid compact"><div><strong>Model-equivalent configuration</strong><span>${h(selected.modelEquivalentSummary)}</span></div><div><strong>20-year do-nothing trigger</strong><span>${h(portfolioTriggerLabel(selectedResult.doNothing))}</span></div><div><strong>Trigger drivers</strong><span>${h(selectedResult.doNothing.triggerDrivers?.join(" + ") || "No near-term driver")}</span></div><div><strong>20-yr lost revenue risk</strong><span>${currency(selectedResult.doNothing.lostRevenue20yr,0)}</span></div></div></details><details class="portfolio-diagnostic-details"><summary>Model QA diagnostics</summary><div class="portfolio-summary-grid">${kpi("Actual source", h(portfolioActualSourceLabel(selected)), selected.liveActuals?.sourceFile ? h(selected.liveActuals.sourceFile) : "portfolio baseline")}${kpi("Actual 30D kWh", kwh(selectedResult.actualKwh,0), "latest rolling operating data")}${kpi("Modelled 30D kWh", kwh(selectedResult.calibratedKwh,0), "site-type target")}${kpi("30D variance", portfolioVarianceBadge(selectedResult.calibratedKwhVariance), "QA comparison")}${kpi("Base annual variance", portfolioVarianceBadge(selectedResult.baseAnnualKwhVariance), "uncalibrated QA")}</div><p class="muted small">Technical diagnostics are retained for audit and investment review. The main comparison is matched to the relevant model year/basis before the ±15% benchmark status is applied.</p></details></div></section>
    <section class="panel portfolio-filter-panel"><h3>Filters and sorting</h3><div class="portfolio-filter-grid">${portfolioMultiFilter("portfolioMaturity", "maturity", maturityOptions, "Maturity", "All maturity")}${portfolioMultiFilter("portfolioCategory", "category", categoryOptions, "Site category", "All categories")}${portfolioMultiFilter("portfolioConfidence", "confidence", confidenceOptions, "AADT confidence", "All AADT confidence")}${portfolioMultiFilter("portfolioMicBand", "micBand", micBandOptions, "MIC band", "All MIC")}</div><p class="muted small">Open a filter and tick one or more options. Click a header to sort. Current sort: ${h(sortNames[sortKey] || "site")} · ${h(sortDir)}.</p></section>
    <section class="panel"><h3>Current filtered view</h3><div class="portfolio-summary-grid">${selectedFilterCard("Sites shown", number(filtered.length,0), `${number(results.length,0)} mapped sites`)}${selectedFilterCard("In benchmark", number(normalCount,0), "model accuracy ±15%")}${selectedFilterCard("Outside ±15%", number(filtered.filter(r => Number.isFinite(r.annualKwhVariance) && Math.abs(r.annualKwhVariance) > PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE && r.site.maturity?.tier !== "early").length,0), "mature/near only")}${selectedFilterCard("Ramp-up", number(filtered.filter(r => r.site.maturity?.tier === "early").length,0), "early sites")}${selectedFilterCard("Earliest trigger", earliestTrigger ? String(earliestTrigger) : "No trigger", "do-nothing path only")}${selectedFilterCard("Median abs variance", Number.isFinite(medianAbsAnnualVariance) ? pct(medianAbsAnnualVariance,1) : "—", "annual model vs actual")}</div></section>
    <section class="panel"><h3>Portfolio comparison table</h3>${table(headers, sorted.map(row), "portfolio-table portfolio-comparison-table portfolio-annual-table")}</section>
  `;
}


function portfolioActualDataDaysText(site) {
  const actual = site?.actual || {};
  const liveActuals = site?.liveActuals || {};
  return [actual.annualisationMethod, actual.annualisationBasis, actual.actualBasis, actual.basis, actual.sourceNote, liveActuals.actualBasis].filter(Boolean).join(" ");
}
function portfolioExplicitLiveDaysFromText(site) {
  const match = String(portfolioActualDataDaysText(site)).match(/(\d+(?:\.\d+)?)\s*(?:calendar\s*)?days?\s*(?:live|operational|of\s*data)?/i);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
function portfolioCumulativeActualsFromText(site) {
  const text = String(portfolioActualDataDaysText(site) || "");
  const result = { days: 0, kwhTotal: 0, sessionsTotal: 0, source: "" };
  const daysA = text.match(/(\d+(?:\.\d+)?)\s*(?:calendar\s*)?days?\s*(?:live|operational|of\s*data)?/i);
  const kwhA = text.match(/([\d,]+(?:\.\d+)?)\s*kwh\s*(?:total|over)/i);
  const kwhB = text.match(/(?:total|cumulative|sum)\s*[:=]?\s*([\d,]+(?:\.\d+)?)\s*kwh/i);
  const sessionsA = text.match(/([\d,]+(?:\.\d+)?)\s*(?:sessions?|txns?|transactions?)\s*(?:total|over)?/i);
  const days = daysA ? Number(String(daysA[1]).replace(/,/g, "")) : 0;
  const kwhTotal = (kwhA || kwhB) ? Number(String((kwhA || kwhB)[1]).replace(/,/g, "")) : 0;
  const sessionsTotal = sessionsA ? Number(String(sessionsA[1]).replace(/,/g, "")) : 0;
  if (Number.isFinite(days) && days > 0) result.days = Math.round(days);
  if (Number.isFinite(kwhTotal) && kwhTotal > 0) result.kwhTotal = kwhTotal;
  if (Number.isFinite(sessionsTotal) && sessionsTotal > 0) result.sessionsTotal = sessionsTotal;
  if (result.days > 0 || result.kwhTotal > 0 || result.sessionsTotal > 0) result.source = text;
  return result;
}
function portfolioEnergyDeliveryDaysInfo(site) {
  const cumulative = portfolioCumulativeActualsFromText(site);
  const actual = site?.actual || {};
  const textDays = Number(cumulative.days || portfolioExplicitLiveDaysFromText(site) || 0);
  const rollingDailyKwh = Number(actual.dailyKwh || (Number(actual.rolling30Kwh || 0) > 0 ? Number(actual.rolling30Kwh || 0) / 30 : 0));
  if (!(Number(cumulative.kwhTotal) > 0) || !(rollingDailyKwh > 0)) return null;
  const implied = Number(cumulative.kwhTotal) / rollingDailyKwh;
  if (!Number.isFinite(implied) || implied <= 0) return null;
  // Use energy-derived commercial days only when the delivered-energy denominator
  // indicates a later real-use start than the reported live/commissioned days.
  // If implied days are greater than reported days, the rolling run-rate is lower
  // than the historic average, so reported days are safer.
  if (textDays > 0 && implied > textDays) return null;
  const days = Math.max(1, Math.round(implied));
  const noteParts = [`Energy-derived days = ${Number(cumulative.kwhTotal).toFixed(1)} kWh cumulative / ${Number(rollingDailyKwh).toFixed(1)} kWh/day run-rate`];
  if (textDays > 0) noteParts.push(`reported live-days was ${Math.round(textDays)}`);
  return {
    days,
    basisKey: "energy-delivery-days",
    basisLabel: "energy-derived days",
    sourceLabel: "Energy delivered / run-rate",
    confidence: textDays > 0 ? "medium" : "lower",
    firstOperationalDate: null,
    latestDate: portfolioActualDateInfo(site).latestDate,
    note: noteParts.join(" · ")
  };
}

function portfolioOperationalDaysInfo(site, annualActual = null) {
  const actual = site?.actual || {};
  const liveActuals = site?.liveActuals || {};
  const diagnostics = liveActuals.diagnostics || {};
  const dateInfo = portfolioActualDateInfo(site);
  const latest = dateInfo.latestDate;
  const fromDate = (date, basisKey, basisLabel, sourceLabel, confidence = "high") => {
    const diff = portfolioDateDiffDays(date, latest);
    if (Number.isFinite(diff) && diff >= 0) {
      return { days: diff + 1, basisKey, basisLabel, sourceLabel, confidence, firstOperationalDate: date, latestDate: latest, note: `${basisLabel}: ${portfolioDateLabel(date)} to ${portfolioDateLabel(latest)}` };
    }
    return null;
  };
  const firstSession = fromDate(dateInfo.firstSessionDate, "first-session", "from first session", "First real session", "high");
  if (firstSession) return firstSession;
  const firstKwh = fromDate(dateInfo.firstKwhDate, "first-kwh", "from first kWh", "First KWh movement", "high");
  if (firstKwh) return firstKwh;
  const energyDays = portfolioEnergyDeliveryDaysInfo(site);
  if (energyDays) return energyDays;
  // Important: do not use generic firstActiveDate before the reported live-days
  // text. In stored/reference actuals, firstActiveDate can represent charger
  // telemetry or commissioning evidence, while the daily_cumulative text already
  // reflects the trusted commercial live-day denominator. Using firstActiveDate
  // here made sites such as Castleknock show 70 days instead of the trusted
  // 67 days live from the actuals source.
  const textDays = portfolioExplicitLiveDaysFromText(site);
  if (textDays > 0) return { days: textDays, basisKey: "reported-live-days", basisLabel: "reported live days", sourceLabel: "Reported live-days text", confidence: "medium", firstOperationalDate: dateInfo.firstActiveDate || null, latestDate: latest, note: `Reported live-days text from actual source: ${Math.round(textDays)} days` };
  const candidates = [
    actual.dataDays,
    actual.operationalDays,
    actual.daysLive,
    actual.liveDays,
    liveActuals.dataDays,
    liveActuals.operationalDays,
    diagnostics.dataDays,
    diagnostics.operationalDays,
    diagnostics.daysLive,
    annualActual?.dataDays,
    site?.maturity?.dataDays
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return { days: Math.round(n), basisKey: "stored-maturity", basisLabel: "stored maturity", sourceLabel: "Stored maturity/data-days field", confidence: "lower", firstOperationalDate: dateInfo.firstActiveDate || null, latestDate: latest, note: `Fallback to stored maturity/data-days field: ${Math.round(n)} days` };
  }
  return { days: null, basisKey: "low-confidence", basisLabel: "not confirmed", sourceLabel: "No reliable days source", confidence: "low", firstOperationalDate: null, latestDate: latest, note: "Operational days could not be confirmed." };
}
function portfolioOperationalDays(site, annualActual = null) {
  return portfolioOperationalDaysInfo(site, annualActual).days;
}
function portfolioOperationalDaysLabel(days, info = null) {
  const main = Number.isFinite(Number(days)) && Number(days) > 0 ? `${number(days, 0)} days` : "Not confirmed";
  if (!info) return main;
  const note = info.basisLabel || info.sourceLabel || "";
  return `<span class="portfolio-days-cell" title="${h(info.note || note)}"><strong>${h(main)}</strong>${note ? `<small>${h(note)}</small>` : ""}</span>`;
}
function portfolioActualRevenueInfo(site, annualActual, metrics) {
  const actual = site?.actual || {};
  const explicitAnnualRevenue = Number(actual.annualNetRevenue || 0);
  const rollingRevenue = Number(actual.rolling30NetRevenue || 0);
  const annualKwh = Number(annualActual?.annualKwh || 0);
  const annualSessions = Number(annualActual?.annualSessions || metrics?.annualisedSessions || 0);
  const price = Number((typeof state !== "undefined" && state.inputs ? state.inputs.netSellingPriceExVat : undefined) ?? DEFAULT_INPUTS.netSellingPriceExVat ?? 0);
  const actualKwh = Number(metrics?.actualKwh || actual.rolling30Kwh || 0);
  const dataDays = Number(annualActual?.dataDays || portfolioActualDataDays(site) || 0);
  const minRevenuePerKwh = 0.2;
  const maxRevenuePerKwh = 2.0;
  const estimatedFromTariff = (source = "Estimated from kWh × net price") => ({
    annualRevenue: annualKwh > 0 && price > 0 ? annualKwh * price : 0,
    annualSessions,
    source,
    estimated: true,
    available: annualKwh > 0 && price > 0
  });
  if (explicitAnnualRevenue > 0) {
    // Only trust an explicit annual revenue when the actual source is really a full-year
    // / trailing annual basis. Otherwise a partial-period revenue can be mistaken for a
    // full year and make EBITDA/payback look artificially poor.
    if (Number(annualActual?.hasExplicitAnnual || false) || dataDays >= 365) {
      const implied = annualKwh > 0 ? explicitAnnualRevenue / annualKwh : null;
      if (!Number.isFinite(implied) || (implied >= minRevenuePerKwh && implied <= maxRevenuePerKwh)) {
        return { annualRevenue: explicitAnnualRevenue, annualSessions, source: "Actual trailing revenue", estimated: false, available: true };
      }
      return estimatedFromTariff(`Estimated from kWh × net price; explicit revenue ignored (${number(implied,2)} €/kWh out of range)`);
    }
    return estimatedFromTariff("Estimated from kWh × net price; partial revenue not treated as annual");
  }
  if (rollingRevenue > 0 && actualKwh > 0) {
    const revenuePerKwh = rollingRevenue / Math.max(1, actualKwh);
    if (revenuePerKwh >= minRevenuePerKwh && revenuePerKwh <= maxRevenuePerKwh) {
      return { annualRevenue: annualKwh * revenuePerKwh, annualSessions, source: "Actual rolling revenue annualised", estimated: false, available: true };
    }
    return estimatedFromTariff(`Estimated from kWh × net price; rolling revenue ignored (${number(revenuePerKwh,2)} €/kWh out of range)`);
  }
  return estimatedFromTariff();
}


function portfolioCommercialTermsKey(siteOrName) {
  const name = typeof siteOrName === "string" ? siteOrName : (siteOrName?.name || siteOrName?.siteName || "site");
  return String(name || "site").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
}
function portfolioCommercialTermsStorageKey(siteOrName) {
  return `${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.commercialTerms.${portfolioCommercialTermsKey(siteOrName)}`;
}
function portfolioCommercialTermsDefault() {
  return { termType: "none", fixedRent: 0, gpSharePct: 0, salesSharePct: 0, confidence: "unknown", notes: "" };
}
function portfolioCommercialTermsSanitise(raw = {}) {
  const base = portfolioCommercialTermsDefault();
  const termType = ["none", "fixed", "gp", "sales", "fixed-gp", "fixed-sales"].includes(String(raw.termType || "").toLowerCase()) ? String(raw.termType).toLowerCase() : base.termType;
  const confidence = ["unknown", "estimate", "actual"].includes(String(raw.confidence || "").toLowerCase()) ? String(raw.confidence).toLowerCase() : base.confidence;
  const fixedRent = Math.max(0, Number(raw.fixedRent ?? raw.fixedRentEurPerYear ?? 0) || 0);
  const gpSharePct = Math.max(0, Number(raw.gpSharePct ?? raw.gpShare ?? 0) || 0);
  const salesSharePct = Math.max(0, Number(raw.salesSharePct ?? raw.salesShare ?? 0) || 0);
  return { termType, fixedRent, gpSharePct, salesSharePct, confidence, notes: String(raw.notes || "").slice(0, 400) };
}
function portfolioCommercialTermsLoad(siteOrName) {
  try {
    const raw = localStorage.getItem(portfolioCommercialTermsStorageKey(siteOrName));
    return raw ? portfolioCommercialTermsSanitise(JSON.parse(raw)) : portfolioCommercialTermsDefault();
  } catch (_) {
    return portfolioCommercialTermsDefault();
  }
}
function portfolioCommercialTermsSave(siteOrName, terms) {
  try { localStorage.setItem(portfolioCommercialTermsStorageKey(siteOrName), JSON.stringify(portfolioCommercialTermsSanitise(terms))); } catch (_) {}
}
function portfolioCommercialTermsClear(siteOrName) {
  try { localStorage.removeItem(portfolioCommercialTermsStorageKey(siteOrName)); } catch (_) {}
}
function portfolioCommercialTermsApplied(terms) {
  const t = portfolioCommercialTermsSanitise(terms);
  if (t.termType === "none") return false;
  if (["fixed", "fixed-gp", "fixed-sales"].includes(t.termType) && t.fixedRent > 0) return true;
  if (["gp", "fixed-gp"].includes(t.termType) && t.gpSharePct > 0) return true;
  if (["sales", "fixed-sales"].includes(t.termType) && t.salesSharePct > 0) return true;
  return false;
}
function portfolioCommercialTermsLabel(siteOrName) {
  const terms = portfolioCommercialTermsLoad(siteOrName);
  const conf = terms.confidence === "actual" ? "Actual" : terms.confidence === "estimate" ? "Estimate" : "Unknown";
  if (!portfolioCommercialTermsApplied(terms)) return { label: "No landlord terms", cls: "neutral", title: "No site-specific landlord rent or share terms are applied." };
  const bits = [];
  if (["fixed", "fixed-gp", "fixed-sales"].includes(terms.termType) && terms.fixedRent > 0) bits.push(`Rent ${currency(terms.fixedRent, 0)}`);
  if (["gp", "fixed-gp"].includes(terms.termType) && terms.gpSharePct > 0) bits.push(`GP ${number(terms.gpSharePct, 1)}%`);
  if (["sales", "fixed-sales"].includes(terms.termType) && terms.salesSharePct > 0) bits.push(`Sales ${number(terms.salesSharePct, 1)}%`);
  return { label: `${bits.join(" + ")} · ${conf}`, cls: terms.confidence === "actual" ? "good" : "warn", title: `${bits.join(" + ")} landlord terms are included in OPEX and EBITDA. Confidence: ${conf}.` };
}
function portfolioCommercialManualTermsForCalculation(site) {
  const terms = portfolioCommercialTermsLoad(site);
  if (!portfolioCommercialTermsApplied(terms)) return null;
  const hasFixed = ["fixed", "fixed-gp", "fixed-sales"].includes(terms.termType);
  const hasGp = ["gp", "fixed-gp"].includes(terms.termType);
  const hasSales = ["sales", "fixed-sales"].includes(terms.termType);
  return {
    source: "manual",
    structure: terms.termType,
    groundRentAnnual: hasFixed ? terms.fixedRent : 0,
    gpShareRate: hasGp ? terms.gpSharePct / 100 : 0,
    grossSalesShareRate: hasSales ? terms.salesSharePct / 100 : 0,
    confidence: terms.confidence,
    notes: terms.notes
  };
}
function portfolioCommercialImpact(site, withTerms = true) {
  const result = portfolioSiteResults(site, portfolioBenchmarksByCategory(portfolioSites({ includeAdditional: false })));
  const capex = portfolioCapexInfo(site, result.financialSummary?.initialInvestment || 0);
  const annualActual = portfolioAnnualOperatingValues(site, result.metrics);
  const revenueInfo = portfolioActualRevenueInfo(site, annualActual, result.metrics);
  const opex = portfolioFinancialOpexFromActuals(result, annualActual.annualKwh, revenueInfo.annualSessions, revenueInfo.annualRevenue, withTerms ? site : { ...site, ignoreManualCommercialTerms: true });
  const payback = Number(capex.actual || 0) > 0 && Number(opex.operatingCashflow || 0) > 0 ? capex.actual / opex.operatingCashflow : null;
  return { capex: capex.actual, opex: opex.opexExElectricity, electricity: opex.electricityCost, ebitda: opex.operatingCashflow, payback };
}

function portfolioActualLandlordTerms(site, annualRevenue, grossProfit, modelGroundRent = 0) {
  const actual = site?.actual || {};
  const manualTerms = site?.ignoreManualCommercialTerms ? null : portfolioCommercialManualTermsForCalculation(site);
  const terms = manualTerms || site?.landlordActuals || actual.landlordTerms || {};
  const structure = String(terms.structure || terms.type || terms.basis || "").toLowerCase();
  const groundRentAnnual = Number(terms.groundRentAnnual ?? terms.annualGroundRent ?? actual.groundRentAnnual ?? site?.groundRentAnnual ?? 0) || 0;
  const gpShareRate = Number(terms.gpShareRate ?? terms.landlordGpShare ?? actual.landlordGpShare ?? NaN);
  const grossSalesShareRate = Number(terms.grossSalesShareRate ?? terms.landlordGrossSalesShare ?? actual.landlordGrossSalesShare ?? NaN);
  const hasGp = Number.isFinite(gpShareRate) && gpShareRate > 0;
  const hasGrossSales = Number.isFinite(grossSalesShareRate) && grossSalesShareRate > 0;
  let landlordGpShare = 0;
  let landlordGrossSalesShare = 0;
  let basis = "not provided";
  let gpSuppressed = false;
  if ((structure.includes("gross") || structure.includes("sales")) && hasGrossSales) {
    landlordGrossSalesShare = Math.max(0, Number(annualRevenue || 0)) * grossSalesShareRate;
    gpSuppressed = hasGp;
    basis = gpSuppressed ? "gross-sales share; GP suppressed" : "gross-sales share";
  } else if ((structure.includes("gp") || structure.includes("profit")) && hasGp && !hasGrossSales) {
    landlordGpShare = Math.max(0, Number(grossProfit || 0)) * gpShareRate;
    basis = "gross-profit share";
  } else if (hasGrossSales) {
    // Gross-sales share takes precedence when both structures are populated.
    landlordGrossSalesShare = Math.max(0, Number(annualRevenue || 0)) * grossSalesShareRate;
    gpSuppressed = hasGp;
    basis = gpSuppressed ? "gross-sales share; GP suppressed" : "gross-sales share";
  } else if (hasGp) {
    landlordGpShare = Math.max(0, Number(grossProfit || 0)) * gpShareRate;
    basis = "gross-profit share";
  }
  const applied = groundRentAnnual > 0 || landlordGpShare > 0 || landlordGrossSalesShare > 0;
  const note = applied
    ? `${manualTerms ? "Manual" : "Actual"} landlord terms included (${basis}${manualTerms?.confidence ? ` · ${manualTerms.confidence}` : ""}).`
    : `Landlord costs excluded: no actual site-level landlord terms provided${Number(modelGroundRent || 0) > 0 ? ` (model rent €${number(modelGroundRent, 0)} not used).` : "."}`;
  return { groundRentAnnual, landlordGpShare, landlordGrossSalesShare, basis, applied, conflict: false, gpSuppressed, note };
}
function portfolioFinancialOpexFromActuals(result, annualKwh, annualSessions, annualRevenue, site = null) {
  const inputs = result?.inputs || DEFAULT_INPUTS;
  const row = result?.compareRow || {};
  const modelGroundRent = Number(row.groundRent || 0);
  const fixedOpex = [
    row.chargerSlaPpmSupport,
    row.managedService,
    row.batteryAnnualService,
    row.duosStandingCharge,
    row.duosCapacityCharge,
    row.extendedChargerWarranty,
    row.extendedBatteryWarranty
  ].map(Number).filter(Number.isFinite).reduce((a, b) => a + b, 0);
  const electricityCost = Number(annualKwh || 0) * Number(inputs.electricityCost || 0);
  const grossProfit = Number(annualRevenue || 0) - electricityCost;
  const transactionProcessingFee = Math.max(0, Number(annualRevenue || 0)) * Number(inputs.transactionProcessingFeePctRevenue || 0);
  const flatTransactionFee = Number(annualSessions || 0) * Number(inputs.flatTransactionFeePerSession || 0);
  const landlord = portfolioActualLandlordTerms(site, annualRevenue, grossProfit, modelGroundRent);
  const landlordGpShare = landlord.landlordGpShare;
  const landlordGrossSalesShare = landlord.landlordGrossSalesShare;
  const groundRent = landlord.groundRentAnnual;
  const variableOpex = transactionProcessingFee + flatTransactionFee + landlordGpShare + landlordGrossSalesShare;
  const opexExElectricity = fixedOpex + variableOpex + groundRent;
  const operatingCashflow = grossProfit - opexExElectricity;
  return { fixedOpex, variableOpex, opexExElectricity, electricityCost, grossProfit, operatingCashflow, transactionProcessingFee, flatTransactionFee, landlordGpShare, landlordGrossSalesShare, groundRent, modelGroundRentExcluded: modelGroundRent, landlordNote: landlord.note, landlordBasis: landlord.basis, landlordApplied: landlord.applied, landlordConflict: landlord.conflict };
}
function portfolioFinancialCompletenessLabel(fin) {
  if (!fin.hasActualKwh) return "Not enough data · no actual kWh";
  if (!fin.hasOperationalDays) return "Not enough data · operational days not confirmed";
  if (Number(fin.operationalDays || 0) < 30) return "Low · <30 operational days";
  if (!fin.hasActualCapex) return "Medium · CAPEX missing";
  if (fin.revenueEstimated) return "Medium · revenue estimated";
  return "High";
}
function portfolioFinancialPaybackState(fin) {
  if (!fin.hasActualKwh) return { label: "No actual kWh", cls: "neutral", sortValue: null, reason: "No actual kWh is available for the site." };
  if (!fin.hasOperationalDays) return { label: "Days missing", cls: "neutral", sortValue: null, reason: "Operational days are not confirmed, so the annualised run-rate is not reliable enough for payback." };
  if (Number(fin.operationalDays || 0) < 30) return { label: "Low history", cls: "warn", sortValue: null, reason: "Less than 30 operational days. Show run-rate metrics, but do not calculate investment payback." };
  if (!fin.hasActualCapex) return { label: "CAPEX missing", cls: "neutral", sortValue: null, reason: "Actual CAPEX is missing, so payback cannot be calculated." };
  if (!(Number(fin.operatingCashflow) > 0)) return { label: "No payback", cls: "bad", sortValue: null, reason: "Current run-rate EBITDA proxy is not positive." };
  return { label: "Payback available", cls: "good", sortValue: Number(fin.paybackYears), reason: fin.landlordApplied ? "Actual CAPEX divided by current annual EBITDA proxy." : "Actual CAPEX divided by current pre-landlord EBITDA proxy." };
}
function portfolioFinancialStatus(fin, r) {
  if (!fin.hasActualKwh || !fin.hasOperationalDays) return { label: "Not enough data", cls: "neutral", note: portfolioFinancialCompletenessLabel(fin) };
  if (Number(fin.operationalDays || 0) < 30) return { label: "Low history", cls: "warn", note: "Actuals exist, but operating history is too short for a reliable financial benchmark." };
  if (!Number.isFinite(Number(r?.annualKwhVariance))) return { label: "Review", cls: "warn", note: "Model variance unavailable." };
  if (r.annualKwhVariance > PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE) return { label: "Underperforming", cls: "bad", note: "Actual kWh is below the matched model benchmark." };
  if (r.annualKwhVariance < -PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE) return { label: "Above benchmark", cls: "good", note: "Actual kWh is above the matched model benchmark." };
  if (fin.hasActualCapex && fin.operatingCashflow <= 0) return { label: "Cashflow pressure", cls: "bad", note: "kWh is in benchmark, but current operating cashflow is not positive." };
  return { label: "In benchmark", cls: "good", note: "Actual kWh is within ±15% of the matched model benchmark." };
}
function portfolioFinancialRow(site, benchmarks) {
  const result = portfolioSiteResults(site, benchmarks);
  const capex = portfolioCapexInfo(site, result.financialSummary?.initialInvestment || 0);
  const annualActual = portfolioAnnualOperatingValues(site, result.metrics);
  const operationalDaysInfo = portfolioOperationalDaysInfo(site, annualActual);
  const operationalDays = operationalDaysInfo.days;
  const revenueInfo = portfolioActualRevenueInfo(site, annualActual, result.metrics);
  const opex = portfolioFinancialOpexFromActuals(result, annualActual.annualKwh, revenueInfo.annualSessions, revenueInfo.annualRevenue, site);
  const hasActualKwh = Number(annualActual.annualKwh || 0) > 0;
  const hasActualCapex = Number(capex.actual || 0) > 0;
  const hasOperationalDays = Number.isFinite(Number(operationalDays)) && Number(operationalDays) > 0;
  const operatingCashflow = hasActualKwh ? opex.operatingCashflow : 0;
  const paybackYears = hasActualCapex && hasActualKwh && hasOperationalDays && Number(operationalDays || 0) >= 30 && operatingCashflow > 0 ? capex.actual / operatingCashflow : null;
  const fin = {
    result,
    site,
    actualCapex: capex.actual,
    modelCapex: capex.model,
    capexDelta: Number.isFinite(capex.variance) ? capex.variance : null,
    capexNote: capex.note,
    annualKwh: annualActual.annualKwh,
    annualSessions: revenueInfo.annualSessions,
    annualRevenue: revenueInfo.annualRevenue,
    revenueSource: revenueInfo.source,
    revenueEstimated: revenueInfo.estimated,
    operationalDays,
    operationalDaysInfo,
    daysBasisKey: operationalDaysInfo.basisKey,
    daysBasisLabel: operationalDaysInfo.basisLabel,
    daysBasisNote: operationalDaysInfo.note,
    hasActualKwh,
    hasActualCapex,
    hasOperationalDays,
    opexExElectricity: opex.opexExElectricity,
    electricityCost: opex.electricityCost,
    grossProfit: opex.grossProfit,
    operatingCashflow,
    paybackYears,
    landlordNote: opex.landlordNote,
    landlordBasis: opex.landlordBasis,
    landlordApplied: opex.landlordApplied,
    modelGroundRentExcluded: opex.modelGroundRentExcluded,
    dataQuality: "",
    muted: false,
    partial: false
  };
  fin.dataQuality = portfolioFinancialCompletenessLabel(fin);
  fin.status = portfolioFinancialStatus(fin, result);
  fin.enoughForPayback = hasActualKwh && hasActualCapex && hasOperationalDays && Number(operationalDays || 0) >= 30 && operatingCashflow > 0;
  fin.paybackState = portfolioFinancialPaybackState(fin);
  fin.muted = !hasActualKwh || !hasOperationalDays || Number(operationalDays || 0) < 30;
  fin.partial = !fin.muted && (!hasActualCapex || fin.revenueEstimated || operatingCashflow <= 0);
  return fin;
}
function portfolioFinancialRows() {
  const sites = portfolioSites({ includeAdditional: false });
  const benchmarks = portfolioBenchmarksByCategory(sites);
  return sites.map(site => portfolioFinancialRow(site, benchmarks));
}

const PORTFOLIO_FINANCIAL_PROJECTION_HORIZONS = [5, 10, 15, 20];
const PORTFOLIO_FINANCIAL_FILTERS = ["status", "quality", "history", "daysBasis", "capex", "revenue", "payback"];
const PORTFOLIO_FINANCIAL_STORAGE_PREFIX = "evHub.portfolioFinancials.v17_24";
function portfolioFinancialHorizon() {
  const raw = Number(localStorage.getItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.horizon`) || 5);
  return PORTFOLIO_FINANCIAL_PROJECTION_HORIZONS.includes(raw) ? raw : 5;
}
function portfolioFinancialFilterValues(key) {
  const raw = localStorage.getItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.filter.${key}`) || "all";
  if (!raw || raw === "all") return ["all"];
  const values = raw.split(",").map(v => String(v || "").trim()).filter(Boolean);
  return values.length ? [...new Set(values)] : ["all"];
}
function portfolioFinancialFilterValue(key) {
  const values = portfolioFinancialFilterValues(key);
  return values.includes("all") ? "all" : values[0];
}
function portfolioFinancialFilterStorageValue(values) {
  const clean = [...new Set((values || []).map(v => String(v || "").trim()).filter(Boolean).filter(v => v !== "all"))];
  return clean.length ? clean.join(",") : "all";
}
function portfolioFinancialFilterHasValue(key, value) {
  const values = portfolioFinancialFilterValues(key);
  return values.includes("all") ? value === "all" : values.includes(value);
}
function portfolioFinancialStatusKey(label = "") {
  return String(label || "review").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "review";
}
function portfolioFinancialQualityKey(fin) {
  return portfolioFinancialStatusKey(portfolioFinancialDataQualityShort(fin?.dataQuality));
}
function portfolioFinancialHistoryKey(fin) {
  const days = Number(fin?.operationalDays || 0);
  if (!fin?.hasOperationalDays || days < 30) return "low-history";
  if (days < 180) return "early-30-179";
  if (days < 365) return "ramping-180-364";
  return "full-year-365-plus";
}
function portfolioFinancialHasActualT12mRevenue(fin) {
  return !fin?.revenueEstimated && String(fin?.revenueSource || "") === "Actual trailing revenue" && Number(fin?.operationalDays || 0) >= 365;
}
function portfolioFinancialHasEstimatedT12mRevenue(fin) {
  return !!fin?.revenueEstimated && String(fin?.revenueSource || "").includes("explicit") && Number(fin?.operationalDays || 0) >= 365;
}
function portfolioFinancialRevenueKey(fin) {
  if (portfolioFinancialHasActualT12mRevenue(fin)) return "actual-t12m";
  if (portfolioFinancialHasEstimatedT12mRevenue(fin)) return "est-t12m";
  return fin?.revenueEstimated ? "projected-est" : "projected";
}
function portfolioFinancialPaybackKey(fin) {
  const state = fin?.paybackState?.state || "notCalculated";
  if (state === "positive") return "positive";
  if (state === "negativeCashflow") return "no-payback";
  if (state === "capexMissing") return "capex-missing";
  if (state === "lowHistory") return "low-history";
  return "not-calculated";
}
function portfolioFinancialCapexKey(fin) {
  return fin?.hasActualCapex ? "capex-tracked" : "capex-missing";
}
function portfolioFinancialFilterDefinitions() {
  return [
    { key: "status", label: "Status", options: [
      ["all", "All statuses"], ["above-benchmark", "Above benchmark"], ["in-benchmark", "In benchmark"], ["underperforming", "Underperforming"], ["cashflow-pressure", "Cashflow pressure"], ["low-history", "Low history"], ["not-enough-data", "Not enough data"]
    ]},
    { key: "quality", label: "Data quality", options: [
      ["all", "All quality"], ["high", "High"], ["medium", "Medium"], ["revenue-est", "Revenue estimated"], ["capex-missing", "CAPEX missing"], ["low-days", "Low days"], ["days-missing", "Days missing"], ["no-actual-kwh", "No actual kWh"]
    ]},
    { key: "history", label: "Operational days", options: [
      ["all", "All days"], ["low-history", "<30 days"], ["early-30-179", "30–179 days"], ["ramping-180-364", "180–364 days"], ["full-year-365-plus", "365+ days"]
    ]},
    { key: "daysBasis", label: "Days basis", options: [
      ["all", "All days basis"], ["first-session", "First session"], ["first-kwh", "First kWh"], ["energy-delivery-days", "Energy delivered"], ["reported-live-days", "Reported live days"], ["stored-maturity", "Stored maturity"], ["low-confidence", "Low confidence"]
    ]},
    { key: "capex", label: "CAPEX", options: [
      ["all", "All CAPEX"], ["capex-tracked", "CAPEX tracked"], ["capex-missing", "CAPEX missing"]
    ]},
    { key: "revenue", label: "Revenue basis", options: [
      ["all", "All revenue"], ["actual-t12m", "Actual T12M"], ["est-t12m", "Estimated T12M"], ["projected", "Projected"], ["projected-est", "Projected est."]
    ]},
    { key: "payback", label: "Payback", options: [
      ["all", "All payback"], ["positive", "Payback shown"], ["no-payback", "No payback"], ["capex-missing", "CAPEX missing"], ["low-history", "Low history"], ["not-calculated", "Not calculated"]
    ]}
  ];
}
function portfolioFinancialRowFilterValue(fin, key) {
  if (key === "status") return portfolioFinancialStatusKey(fin?.status?.label);
  if (key === "quality") return portfolioFinancialQualityKey(fin);
  if (key === "history") return portfolioFinancialHistoryKey(fin);
  if (key === "daysBasis") return fin?.daysBasisKey || "low-confidence";
  if (key === "capex") return portfolioFinancialCapexKey(fin);
  if (key === "revenue") return portfolioFinancialRevenueKey(fin);
  if (key === "payback") return portfolioFinancialPaybackKey(fin);
  return "all";
}
function portfolioFinancialPassesFilters(fin) {
  return PORTFOLIO_FINANCIAL_FILTERS.every(key => {
    const selected = portfolioFinancialFilterValues(key);
    if (!selected.length || selected.includes("all")) return true;
    return selected.includes(portfolioFinancialRowFilterValue(fin, key));
  });
}
function portfolioFinancialFilteredRows(rows) {
  return rows.filter(portfolioFinancialPassesFilters);
}
function portfolioFinancialFilterSelect(def, rows) {
  const selectedValues = portfolioFinancialFilterValues(def.key);
  const counts = new Map();
  rows.forEach(r => counts.set(portfolioFinancialRowFilterValue(r, def.key), (counts.get(portfolioFinancialRowFilterValue(r, def.key)) || 0) + 1));
  const total = rows.length;
  const allActive = selectedValues.includes("all");
  const options = def.options.filter(([value]) => value !== "all").map(([value, label]) => {
    const count = counts.get(value) || 0;
    const disabled = count === 0 ? "disabled" : "";
    const checked = !allActive && selectedValues.includes(value) ? "checked" : "";
    return `<label class="portfolio-financial-filter-option ${disabled ? "disabled" : ""}"><input type="checkbox" data-portfolio-financial-filter-checkbox="${h(def.key)}" value="${h(value)}" ${checked} ${disabled}><span>${h(label)}</span><small>${number(count,0)}</small></label>`;
  }).join("");
  return `<section class="portfolio-financial-filter"><div class="portfolio-financial-filter-head"><span>${h(def.label)}</span><button type="button" class="portfolio-financial-filter-all ${allActive ? "active" : ""}" data-portfolio-financial-filter-all="${h(def.key)}">All <em>${number(total,0)}</em></button></div><div class="portfolio-financial-filter-options">${options}</div></section>`;
}
function portfolioFinancialActiveFilterCount() {
  return PORTFOLIO_FINANCIAL_FILTERS.filter(key => !portfolioFinancialFilterValues(key).includes("all")).length;
}
function portfolioFinancialFilterPanel(rows, filteredRows) {
  const defs = portfolioFinancialFilterDefinitions();
  const activeCount = portfolioFinancialActiveFilterCount();
  return `<section class="panel portfolio-financial-filter-panel portfolio-financial-filter-panel-open"><div class="portfolio-financial-filter-toolbar"><span><strong>Filters & commercial terms</strong><small>${number(filteredRows.length,0)} of ${number(rows.length,0)} active sites selected${activeCount ? ` · ${number(activeCount,0)} filter${activeCount === 1 ? "" : "s"} active` : " · all sites"}</small></span><div class="portfolio-financial-toolbar-actions">${portfolioCommercialTermsManagerButton(rows)}<button type="button" class="secondary mini" data-portfolio-financial-reset-filters="1" ${activeCount ? "" : "disabled"}>Reset filters</button></div></div><p class="muted small">Filters are always visible. You can select multiple values inside each filter group. Use commercial terms only when actual or estimated landlord terms exist.</p><div class="portfolio-financial-filter-grid">${defs.map(def => portfolioFinancialFilterSelect(def, rows)).join("")}</div></section>`;
}

function portfolioCommercialTermTypeOptions(selected) {
  const options = [
    ["none", "None"], ["fixed", "Fixed rent"], ["gp", "GP share"], ["sales", "Sales share"], ["fixed-gp", "Fixed rent + GP share"], ["fixed-sales", "Fixed rent + sales share"]
  ];
  return options.map(([value, label]) => `<option value="${h(value)}" ${selected === value ? "selected" : ""}>${h(label)}</option>`).join("");
}
function portfolioCommercialConfidenceOptions(selected) {
  return [["unknown", "Unknown"], ["estimate", "Estimate"], ["actual", "Actual"]].map(([value, label]) => `<option value="${h(value)}" ${selected === value ? "selected" : ""}>${h(label)}</option>`).join("");
}
function portfolioCommercialFormFields(terms, prefix = "commercial") {
  const t = portfolioCommercialTermsSanitise(terms);
  const fixedEnabled = ["fixed", "fixed-gp", "fixed-sales"].includes(t.termType);
  const gpEnabled = ["gp", "fixed-gp"].includes(t.termType);
  const salesEnabled = ["sales", "fixed-sales"].includes(t.termType);
  return `<div class="commercial-form-grid" data-commercial-form="${h(prefix)}">
    <label class="field"><span>Term type</span><select data-commercial-term="termType">${portfolioCommercialTermTypeOptions(t.termType)}</select><small>GP share and sales share are mutually exclusive. Fixed rent can combine with either.</small></label>
    <label class="field"><span>Fixed rent €/yr</span><input type="number" min="0" step="1" value="${h(t.fixedRent)}" data-commercial-term="fixedRent" ${fixedEnabled ? "" : "disabled"}></label>
    <label class="field"><span>GP share %</span><input type="number" min="0" step="0.1" value="${h(t.gpSharePct)}" data-commercial-term="gpSharePct" ${gpEnabled ? "" : "disabled"}></label>
    <label class="field"><span>Sales share %</span><input type="number" min="0" step="0.1" value="${h(t.salesSharePct)}" data-commercial-term="salesSharePct" ${salesEnabled ? "" : "disabled"}></label>
    <label class="field"><span>Confidence</span><select data-commercial-term="confidence">${portfolioCommercialConfidenceOptions(t.confidence)}</select></label>
    <label class="field commercial-notes"><span>Notes</span><textarea rows="3" data-commercial-term="notes">${h(t.notes)}</textarea></label>
  </div>`;
}
function portfolioCommercialModalKpis(base, after) {
  return `<div class="commercial-impact-grid">
    <div><span>OPEX / yr before</span><strong>${currency(base.opex,0)}</strong></div>
    <div><span>OPEX / yr after</span><strong>${currency(after.opex,0)}</strong></div>
    <div><span>EBITDA before</span><strong>${currency(base.ebitda,0)}</strong></div>
    <div><span>EBITDA after</span><strong>${currency(after.ebitda,0)}</strong></div>
    <div><span>Payback before</span><strong>${base.payback ? `${number(base.payback,1)} yrs` : "—"}</strong></div>
    <div><span>Payback after</span><strong>${after.payback ? `${number(after.payback,1)} yrs` : "—"}</strong></div>
  </div>`;
}
function portfolioCommercialSiteModal(row) {
  const site = row?.site;
  if (!site) return "";
  const terms = portfolioCommercialTermsLoad(site);
  const base = portfolioCommercialImpact(site, false);
  const after = portfolioCommercialImpact(site, true);
  const termsLabel = portfolioCommercialTermsLabel(site);
  return `<div class="commercial-modal-backdrop" data-commercial-modal-backdrop="1"><section class="commercial-modal" role="dialog" aria-modal="true" aria-label="Commercial terms for ${h(site.name)}">
    <div class="commercial-modal-head"><div><span class="eyebrow">Commercial terms</span><h3>${h(site.name)}</h3><p>Keep the investor table clean while adding site-specific landlord rent/share terms when they are known.</p></div><button type="button" class="commercial-modal-close" data-commercial-terms-close="1" aria-label="Close">×</button></div>
    <div class="commercial-current-status"><span class="badge ${h(termsLabel.cls)}">${h(termsLabel.label)}</span><small>${h(termsLabel.title)}</small></div>
    <h4>Financial impact</h4>${portfolioCommercialModalKpis(base, after)}
    <h4>Landlord terms</h4><form data-commercial-site-form="${h(portfolioCommercialTermsKey(site))}">${portfolioCommercialFormFields(terms, "site")}<div class="commercial-modal-actions"><button type="button" class="secondary" data-commercial-terms-clear="${h(portfolioCommercialTermsKey(site))}">Clear terms</button><button type="button" class="secondary" data-commercial-terms-close="1">Cancel</button><button type="submit" class="primary commercial-save-button">Save terms</button></div></form>
  </section></div>`;
}
function portfolioCommercialBulkModal(rows) {
  const allSites = rows.map(r => r.site).filter(Boolean);
  const checkboxes = allSites.map(site => `<label><input type="checkbox" data-commercial-bulk-site value="${h(portfolioCommercialTermsKey(site))}"><span>${h(site.name)}</span></label>`).join("");
  return `<div class="commercial-modal-backdrop" data-commercial-modal-backdrop="1"><section class="commercial-modal commercial-bulk-modal" role="dialog" aria-modal="true" aria-label="Bulk commercial terms manager">
    <div class="commercial-modal-head"><div><span class="eyebrow">Bulk manager</span><h3>Manage commercial terms</h3><p>Apply the same landlord terms to multiple sites, or clear terms in bulk. Defaults remain zero unless you save terms.</p></div><button type="button" class="commercial-modal-close" data-commercial-terms-close="1" aria-label="Close">×</button></div>
    <form data-commercial-bulk-form="1"><div class="commercial-bulk-layout"><div><div class="commercial-bulk-tools"><button type="button" class="secondary mini" data-commercial-bulk-select="all">Select all</button><button type="button" class="secondary mini" data-commercial-bulk-select="none">Select none</button></div><div class="commercial-bulk-sites">${checkboxes}</div></div><div>${portfolioCommercialFormFields(portfolioCommercialTermsDefault(), "bulk")}</div></div><div class="commercial-modal-actions"><button type="button" class="secondary" data-commercial-bulk-clear="1">Clear selected terms</button><button type="button" class="secondary" data-commercial-terms-close="1">Cancel</button><button type="submit" class="primary commercial-save-button">Apply to selected</button></div></form>
  </section></div>`;
}
function portfolioCommercialTermsModal(rows) {
  const active = localStorage.getItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.commercialModal`) || "";
  if (!active) return "";
  if (active === "bulk") return portfolioCommercialBulkModal(rows);
  const row = rows.find(r => portfolioCommercialTermsKey(r.site) === active);
  return row ? portfolioCommercialSiteModal(row) : "";
}
function portfolioCommercialTermsManagerButton(rows) {
  return `<button type="button" class="secondary" data-commercial-terms-open="bulk">Manage commercial terms</button>`;
}
function portfolioCommercialReadForm(form) {
  const get = key => form?.querySelector(`[data-commercial-term="${key}"]`)?.value ?? "";
  return portfolioCommercialTermsSanitise({
    termType: get("termType"),
    fixedRent: Math.round(Number(String(get("fixedRent") || 0).replace(/,/g, "")) || 0),
    gpSharePct: Number(get("gpSharePct") || 0),
    salesSharePct: Number(get("salesSharePct") || 0),
    confidence: get("confidence"),
    notes: get("notes")
  });
}

function portfolioFinancialDashboardMetric(label, value, note = "", cls = "") {
  return `<div class="portfolio-financial-dashboard-metric ${h(cls)}"><span>${h(label)}</span><strong>${value}</strong>${note ? `<small>${h(note)}</small>` : ""}</div>`;
}
function portfolioFinancialDashboardWindow(title, subtitle, metrics, cls = "") {
  return `<section class="portfolio-financial-dashboard-window ${h(cls)}"><div class="portfolio-financial-window-head"><h4>${h(title)}</h4>${subtitle ? `<p>${h(subtitle)}</p>` : ""}</div><div class="portfolio-financial-window-grid">${metrics.join("")}</div></section>`;
}
function portfolioFinancialStatusPill(label, value, note = "") {
  return `<div class="portfolio-financial-status-pill"><span>${h(label)}</span><strong>${value}</strong>${note ? `<small>${h(note)}</small>` : ""}</div>`;
}
function portfolioFinancialDashboardWindows(rows, filteredRows, summary, projection, horizon) {
  const selectedText = `${number(filteredRows.length,0)} of ${number(rows.length,0)} active sites`;
  const capexDeltaPct = summary.modelCapexForCapexRows > 0 ? summary.capexDelta / summary.modelCapexForCapexRows : null;
  const capexDeltaNote = summary.capexDelta < 0 ? "overspend vs model" : summary.capexDelta > 0 ? "underspend vs model" : "in line with model";
  const investment = portfolioFinancialDashboardWindow("Investment position", "Actual investment against modelled CAPEX for the selected sites.", [
    portfolioFinancialDashboardMetric("Selected sites", number(filteredRows.length,0), selectedText),
    portfolioFinancialDashboardMetric("Actual CAPEX tracked", currency(summary.actualCapex,0), `${number(summary.rowsWithCapex,0)} of ${number(summary.totalSites,0)} selected sites`),
    portfolioFinancialDashboardMetric("Model CAPEX", currency(summary.modelCapexForCapexRows,0), "same sites with actual CAPEX"),
    portfolioFinancialDashboardMetric("CAPEX Δ", currency(summary.capexDelta,0), `model minus actual · ${capexDeltaNote}`, summary.capexDelta < 0 ? "bad" : "good"),
    portfolioFinancialDashboardMetric("CAPEX Δ %", capexDeltaPct === null ? "—" : pct(capexDeltaPct,1), "model minus actual / model"),
    portfolioFinancialDashboardMetric("CAPEX missing", number(summary.capexMissing,0), "payback blocked only")
  ], "investment");
  const operating = portfolioFinancialDashboardWindow("Current operating performance", "Annualised run-rate from available actual operating data.", [
    portfolioFinancialDashboardMetric("This-year revenue", currency(projection.thisYearRevenue,0), "current annual run-rate"),
    portfolioFinancialDashboardMetric("Next-year revenue", currency(projection.nextYearRevenue,0), "projected next year"),
    portfolioFinancialDashboardMetric("Annualised kWh", kwh(summary.annualKwh,0), `${number(summary.rowsWithActuals,0)} selected sites with usable actuals`),
    portfolioFinancialDashboardMetric("OPEX / yr", currency(summary.annualOpex,0), "excludes electricity + landlord"),
    portfolioFinancialDashboardMetric("EBITDA proxy / yr", currency(summary.operatingCashflow,0), "pre-landlord unless actual terms provided"),
    portfolioFinancialDashboardMetric("Portfolio payback", portfolioPaybackLabel(summary.paybackYears), `${number(summary.paybackEligible,0)} positive-cashflow sites`)
  ], "operating");
  const projectionWindow = portfolioFinancialDashboardWindow("Projection & profitability", `Selected ${number(horizon,0)}-year projection.`, [
    `<div class="portfolio-financial-dashboard-metric horizon-control"><span>Projection horizon</span>${portfolioFinancialHorizonSelector(horizon)}</div>`,
    portfolioFinancialDashboardMetric(`${number(horizon,0)}yr revenue`, currency(projection.horizonRevenue,0), "cumulative projection"),
    portfolioFinancialDashboardMetric(`${number(horizon,0)}yr EBITDA`, currency(projection.horizonEbitda,0), "cumulative pre-landlord"),
    portfolioFinancialDashboardMetric(`${number(horizon,0)}yr net after CAPEX`, currency(projection.netAfterCapex,0), "EBITDA minus tracked CAPEX", projection.netAfterCapex < 0 ? "bad" : "good"),
    portfolioFinancialDashboardMetric("Profitability margin", projection.profitabilityMargin === null ? "—" : pct(projection.profitabilityMargin,1), `${number(horizon,0)}yr EBITDA / revenue`)
  ], "projection");
  return `<div class="portfolio-financial-dashboard-grid">${investment}${operating}${projectionWindow}</div>`;
}
function portfolioFinancialPerformanceCards(summary) {
  return `<div class="portfolio-summary-grid portfolio-financial-performance-grid">${kpi("In benchmark", number(summary.inBenchmark,0), "actual kWh within ±15%")}${kpi("Underperforming", number(summary.underperforming,0), "actual kWh below model")}${kpi("Above benchmark", number(summary.outperforming,0), "actual kWh above model")}${kpi("Low / missing history", number(summary.notEnoughData,0), "greyed out in table")}${kpi("CAPEX missing", number(summary.capexMissing,0), "payback blocked only")}${kpi("No payback", number(summary.noPayback,0), "negative run-rate cashflow")}</div>`;
}
function portfolioFinancialProjectionGrowthRate() {
  const trafficGrowth = Number(state.inputs.annualTrafficGrowthRate ?? DEFAULT_INPUTS.annualTrafficGrowthRate ?? 0.01);
  const tariffGrowth = Number(state.inputs.annualTariffEscalation ?? DEFAULT_INPUTS.annualTariffEscalation ?? 0);
  const raw = trafficGrowth + tariffGrowth;
  if (!Number.isFinite(raw)) return 0.01;
  return Math.max(-0.2, Math.min(raw, 0.25));
}
function portfolioFinancialCompoundTotal(base, growth, years, startIndex = 0) {
  const b = Number(base || 0);
  const g = Number(growth || 0);
  const n = Math.max(0, Math.round(Number(years || 0)));
  let total = 0;
  for (let i = 0; i < n; i += 1) total += b * Math.pow(1 + g, i + startIndex);
  return total;
}
function portfolioFinancialProjectionSummary(rows, horizon) {
  const usable = rows.filter(r => r.hasActualKwh && r.hasOperationalDays);
  const sum = (key, items = usable) => items.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
  const growth = portfolioFinancialProjectionGrowthRate();
  const revenueBase = sum("annualRevenue");
  const ebitdaBase = sum("operatingCashflow");
  const capexBase = rows.filter(r => r.hasActualCapex).reduce((acc, r) => acc + (Number(r.actualCapex) || 0), 0);
  const hYears = PORTFOLIO_FINANCIAL_PROJECTION_HORIZONS.includes(Number(horizon)) ? Number(horizon) : 5;
  const thisYearRevenue = revenueBase;
  const nextYearRevenue = revenueBase * (1 + growth);
  const horizonRevenue = portfolioFinancialCompoundTotal(revenueBase, growth, hYears);
  const horizonEbitda = portfolioFinancialCompoundTotal(ebitdaBase, growth, hYears);
  const netAfterCapex = horizonEbitda - capexBase;
  const profitabilityMargin = horizonRevenue > 0 ? horizonEbitda / horizonRevenue : null;
  return { usableSites: usable.length, growth, thisYearRevenue, nextYearRevenue, horizonRevenue, horizonEbitda, netAfterCapex, profitabilityMargin, capexBase, horizon: hYears };
}
function portfolioFinancialHorizonSelector(horizon) {
  return `<div class="portfolio-financial-horizon" role="group" aria-label="Projection horizon"><span>Projection horizon</span>${PORTFOLIO_FINANCIAL_PROJECTION_HORIZONS.map(y => `<button type="button" data-portfolio-financial-horizon="${y}" class="${Number(horizon) === y ? "active" : ""}">${y} yrs</button>`).join("")}</div>`;
}
function portfolioFinancialSummary(rows) {
  const rowsWithCapex = rows.filter(r => r.hasActualCapex);
  const rowsWithActuals = rows.filter(r => r.hasActualKwh && r.hasOperationalDays);
  const paybackEligible = rows.filter(r => r.enoughForPayback && Number(r.operationalDays || 0) >= 30);
  const sumField = (items, key) => items.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
  const actualCapex = sumField(rowsWithCapex, "actualCapex");
  const modelCapexForCapexRows = sumField(rowsWithCapex, "modelCapex");
  const annualKwh = sumField(rowsWithActuals, "annualKwh");
  const annualRevenue = sumField(rowsWithActuals, "annualRevenue");
  const annualOpex = sumField(rowsWithActuals, "opexExElectricity");
  const electricityCost = sumField(rowsWithActuals, "electricityCost");
  const operatingCashflow = sumField(rowsWithActuals, "operatingCashflow");
  const eligibleCapex = sumField(paybackEligible, "actualCapex");
  const eligibleCashflow = sumField(paybackEligible, "operatingCashflow");
  const paybackYears = eligibleCapex > 0 && eligibleCashflow > 0 ? eligibleCapex / eligibleCashflow : null;
  const benchmarkRows = rows.filter(r => r.hasActualKwh && r.hasOperationalDays && Number(r.operationalDays || 0) >= 30 && Number.isFinite(Number(r.result?.annualKwhVariance)));
  const noPayback = rows.filter(r => r.hasActualKwh && r.hasOperationalDays && r.hasActualCapex && Number(r.operationalDays || 0) >= 30 && r.operatingCashflow <= 0).length;
  return {
    totalSites: rows.length,
    rowsWithCapex: rowsWithCapex.length,
    rowsWithActuals: rowsWithActuals.length,
    paybackEligible: paybackEligible.length,
    capexMissing: rows.filter(r => !r.hasActualCapex).length,
    lowHistory: rows.filter(r => r.hasActualKwh && (!r.hasOperationalDays || Number(r.operationalDays || 0) < 30)).length,
    notEnoughData: rows.filter(r => r.status?.label === "Not enough data" || r.status?.label === "Low history").length,
    noPayback,
    actualCapex,
    modelCapexForCapexRows,
    capexDelta: modelCapexForCapexRows - actualCapex,
    annualKwh,
    annualRevenue,
    annualOpex,
    electricityCost,
    operatingCashflow,
    paybackYears,
    underperforming: benchmarkRows.filter(r => r.result.annualKwhVariance > PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE).length,
    outperforming: benchmarkRows.filter(r => r.result.annualKwhVariance < -PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE).length,
    inBenchmark: benchmarkRows.filter(r => Math.abs(r.result.annualKwhVariance) <= PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE).length
  };
}

function portfolioFinancialExportNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}
function portfolioFinancialActiveFilterText() {
  const defs = portfolioFinancialFilterDefinitions();
  const parts = [];
  defs.forEach(def => {
    const selected = portfolioFinancialFilterValues(def.key).filter(v => v !== "all");
    if (!selected.length) return;
    const labels = selected.map(v => def.options.find(o => o[0] === v)?.[1] || v);
    parts.push(`${def.label}: ${labels.join(" + ")}`);
  });
  return parts.length ? parts.join("; ") : "All sites";
}
function portfolioFinancialExportRevenueSub(fin) {
  const revenueKey = portfolioFinancialRevenueKey(fin);
  if (revenueKey === "actual-t12m") return "actual T12M";
  if (revenueKey === "est-t12m") return "est. T12M";
  return fin.revenueEstimated ? "projected est." : "projected";
}
function portfolioFinancialExportDisplayRow(fin) {
  const r = fin.result || {};
  const commercial = portfolioCommercialTermsLabel(fin.site);
  const modelKwh = Number(r.modelledAnnualKwh || 0);
  const actualCapex = Number(fin.actualCapex || 0);
  const modelCapex = Number(fin.modelCapex || 0);
  const capexDelta = Number(fin.capexDelta || 0);
  const paybackLabel = portfolioPaybackLabel(fin.paybackYears, fin.paybackState);
  const paybackNote = fin.paybackState?.state === "positive"
    ? (fin.landlordApplied ? "actual CAPEX / EBITDA" : "actual CAPEX / pre-landlord EBITDA")
    : (fin.paybackState?.reason || portfolioPaybackSubtext(fin.paybackYears, fin.paybackState));
  return {
    site: fin.site?.name || "",
    configuration: fin.site?.modelEquivalentSummary || "",
    commercialTerms: commercial.label,
    status: fin.status?.label || "Review",
    dataQuality: portfolioFinancialDataQualityShort(fin.dataQuality),
    days: Number.isFinite(Number(fin.operationalDays)) ? Number(fin.operationalDays) : null,
    daysLabel: Number.isFinite(Number(fin.operationalDays)) ? `${number(fin.operationalDays,0)} days` : "Not confirmed",
    daysBasis: fin.daysBasisLabel || "",
    actualCapex: Number.isFinite(actualCapex) ? actualCapex : null,
    capexNote: fin.hasActualCapex ? `${modelCapex > 0 ? `model ${currency(modelCapex, 0)} · ` : ""}Δ ${currency(capexDelta, 0)}` : "CAPEX missing · payback blocked",
    annualKwh: Number(fin.annualKwh || 0),
    kwhNote: modelKwh > 0 ? `model ${kwh(modelKwh, 0)} · ${portfolioFinancialVarianceLabel(r.annualKwhVariance)}` : "",
    annualRevenue: Number(fin.annualRevenue || 0),
    revenueBasis: portfolioFinancialExportRevenueSub(fin),
    opexExElectricity: Number(fin.opexExElectricity || 0),
    opexNote: fin.landlordApplied ? "excl. electricity" : "excl. electricity & landlord",
    ebitda: Number(fin.operatingCashflow || 0),
    ebitdaNote: fin.landlordApplied ? "run-rate" : "pre-landlord",
    paybackYears: Number.isFinite(Number(fin.paybackYears)) ? Number(fin.paybackYears) : null,
    paybackLabel,
    paybackNote
  };
}
function portfolioFinancialExportMatrixRows(rows) {
  const display = rows.map(portfolioFinancialExportDisplayRow);
  return [[
    "Site", "Site detail", "Commercial terms",
    "Days", "Days basis",
    "CAPEX EUR", "CAPEX note",
    "kWh / yr", "kWh note",
    "Revenue / yr EUR", "Revenue basis",
    "OPEX / yr EUR", "OPEX basis",
    "EBITDA / yr EUR", "EBITDA basis",
    "Payback", "Payback note",
    "Status", "Quality"
  ], ...display.map(r => [
    r.site, r.configuration, r.commercialTerms,
    portfolioFinancialExportNumber(r.days), r.daysBasis,
    portfolioFinancialExportNumber(r.actualCapex), r.capexNote,
    portfolioFinancialExportNumber(r.annualKwh), r.kwhNote,
    portfolioFinancialExportNumber(r.annualRevenue), r.revenueBasis,
    portfolioFinancialExportNumber(r.opexExElectricity), r.opexNote,
    portfolioFinancialExportNumber(r.ebitda), r.ebitdaNote,
    r.paybackLabel, r.paybackNote,
    r.status, r.dataQuality
  ])];
}
function portfolioFinancialExportPayload() {
  const rows = portfolioFinancialRows();
  const filteredRows = portfolioFinancialSortRows(portfolioFinancialFilteredRows(rows));
  const summary = portfolioFinancialSummary(filteredRows);
  const horizon = portfolioFinancialHorizon();
  const projection = portfolioFinancialProjectionSummary(filteredRows, horizon);
  const capexDeltaPct = summary.modelCapexForCapexRows > 0 ? summary.capexDelta / summary.modelCapexForCapexRows : null;
  const filterGroups = portfolioFinancialFilterDefinitions().map(def => {
    const selected = portfolioFinancialFilterValues(def.key);
    const allActive = !selected.length || selected.includes("all");
    const counts = new Map();
    rows.forEach(r => {
      const value = portfolioFinancialRowFilterValue(r, def.key);
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return {
      key: def.key,
      label: def.label,
      total: rows.length,
      allActive,
      options: def.options.filter(([value]) => value !== "all").map(([value, label]) => ({
        value,
        label,
        count: counts.get(value) || 0,
        selected: !allActive && selected.includes(value)
      }))
    };
  });
  const summaryObject = {
    selectedSites: filteredRows.length,
    totalSites: rows.length,
    rowsWithCapex: summary.rowsWithCapex,
    rowsWithActuals: summary.rowsWithActuals,
    paybackEligible: summary.paybackEligible,
    capexMissing: summary.capexMissing,
    noPayback: summary.noPayback,
    notEnoughData: summary.notEnoughData,
    inBenchmark: summary.inBenchmark,
    underperforming: summary.underperforming,
    outperforming: summary.outperforming,
    actualCapex: summary.actualCapex,
    modelCapex: summary.modelCapexForCapexRows,
    capexDelta: summary.capexDelta,
    capexDeltaPct,
    annualKwh: summary.annualKwh,
    thisYearRevenue: projection.thisYearRevenue,
    nextYearRevenue: projection.nextYearRevenue,
    annualOpex: summary.annualOpex,
    annualElectricity: summary.electricityCost,
    annualEbitda: summary.operatingCashflow,
    paybackYears: summary.paybackYears,
    horizonRevenue: projection.horizonRevenue,
    horizonEbitda: projection.horizonEbitda,
    netAfterCapex: projection.netAfterCapex,
    profitabilityMargin: projection.profitabilityMargin
  };
  const summaryRows = [["Metric", "Value", "Note"],
    ["Exported at", new Date().toISOString(), "Browser local time shown in PDF export"],
    ["Active filters", portfolioFinancialActiveFilterText(), "Reset filters to export all active sites"],
    ["Selected sites", summaryObject.selectedSites, `${summaryObject.totalSites} active Portfolio Financial sites available`],
    ["Actual CAPEX tracked EUR", summaryObject.actualCapex, `${summary.rowsWithCapex} selected sites with actual CAPEX`],
    ["Model CAPEX same sites EUR", summaryObject.modelCapex, "Modelled CAPEX for sites with actual CAPEX"],
    ["CAPEX delta EUR", summaryObject.capexDelta, "Model minus actual"],
    ["CAPEX delta %", summaryObject.capexDeltaPct ?? "", "Model minus actual / model"],
    ["Annualised kWh", summaryObject.annualKwh, "Current run-rate based on Portfolio Financials commercial-days basis"],
    ["This-year revenue EUR", summaryObject.thisYearRevenue, "Current annual run-rate"],
    ["Next-year revenue EUR", summaryObject.nextYearRevenue, "Run-rate grown by model growth/tariff assumption"],
    ["OPEX per year EUR", summaryObject.annualOpex, "Excludes electricity; landlord terms only when manually/actually provided"],
    ["Electricity per year EUR", summaryObject.annualElectricity, "Annualised kWh × electricity cost"],
    ["EBITDA proxy EUR", summaryObject.annualEbitda, "Revenue minus electricity minus OPEX"],
    ["Portfolio payback years", summaryObject.paybackYears ?? "", "Run-rate proxy; only positive-cashflow/payback-eligible sites"],
    [`${horizon} year revenue EUR`, summaryObject.horizonRevenue, "Cumulative projection"],
    [`${horizon} year EBITDA EUR`, summaryObject.horizonEbitda, "Cumulative EBITDA proxy"],
    [`${horizon} year net after CAPEX EUR`, summaryObject.netAfterCapex, "EBITDA minus tracked CAPEX"],
    ["Profitability margin", summaryObject.profitabilityMargin ?? "", "Horizon EBITDA / horizon revenue"]
  ];
  const dictionaryRows = [["Column", "Meaning"],
    ["Operational days", "Commercial operational days; first session / first kWh / energy-delivered inference / reported or stored fallback."],
    ["Revenue per year", "Projected annual run-rate unless a trusted trailing-12-month revenue field exists."],
    ["OPEX per year", "Charger support, managed service, DUoS, warranties, transaction fees, and landlord terms only if provided. Excludes electricity."],
    ["EBITDA proxy", "Revenue minus electricity cost minus OPEX."],
    ["Payback years", "Actual CAPEX divided by current annual EBITDA proxy where payback is allowed."],
    ["Commercial terms", "Manual landlord rent/share terms saved in the Portfolio Financials modal; defaults to no landlord terms."],
    ["CAPEX delta", "Model CAPEX minus actual CAPEX. Positive means actual spend is below model; negative means overspend."],
    ["kWh variance", "Matched model variance. Positive means under model; negative means above benchmark in the app's status logic."]
  ];
  return { summary: summaryObject, horizon, filtersText: portfolioFinancialActiveFilterText(), filterGroups, matrixRows: portfolioFinancialExportMatrixRows(filteredRows), displayRows: filteredRows.map(portfolioFinancialExportDisplayRow) };
}

function portfolioPaybackLabel(years, state = null) {
  if (state?.label && state.label !== "Payback available") return state.label;
  const n = Number(years);
  if (!Number.isFinite(n) || n <= 0) return "Not calculated";
  if (n > 50) return ">50 yrs";
  return `${number(n, 1)} yrs`;
}
function portfolioPaybackSubtext(years, state = null) {
  if (state?.label && state.label !== "Payback available") return state.reason || "Not calculated";
  const n = Number(years);
  if (Number.isFinite(n) && n > 50) return "marginal cashflow";
  if (Number.isFinite(n) && n > 0) return state?.reason?.includes("pre-landlord") ? "actual CAPEX / pre-landlord EBITDA" : "actual CAPEX / EBITDA";
  return "not calculated";
}
function portfolioFinancialVarianceLabel(v) {
  return Number.isFinite(Number(v)) ? `${v >= 0 ? "+" : ""}${pct(v, 1)}` : "—";
}
function portfolioFinancialDataQualityShort(label) {
  const text = String(label || "");
  if (text.includes("operational days")) return "Days missing";
  if (text.includes("no actual kWh")) return "No actual kWh";
  if (text.includes("CAPEX missing")) return "CAPEX missing";
  if (text.includes("revenue estimated")) return "Revenue est.";
  if (text.startsWith("Low")) return "Low days";
  if (text.startsWith("Medium")) return "Medium";
  if (text.startsWith("High")) return "High";
  return text || "Review";
}
function portfolioFinancialMetric(value, sub = "", cls = "", title = "") {
  const titleAttr = title ? ` title="${h(title)}"` : "";
  return `<div class="portfolio-financial-metric ${h(cls)}"${titleAttr}><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ""}</div>`;
}
function portfolioFinancialSortKey() {
  return localStorage.getItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.sortKey`) || "site";
}
function portfolioFinancialSortDir() {
  return localStorage.getItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.sortDir`) === "desc" ? "desc" : "asc";
}
function portfolioFinancialSortHeader(key, label) {
  const currentKey = portfolioFinancialSortKey();
  const dir = portfolioFinancialSortDir();
  const isActive = currentKey === key;
  const arrow = isActive ? (dir === "asc" ? "↑" : "↓") : "↕";
  const title = isActive
    ? `Sorted by ${label} ${dir === "asc" ? "ascending" : "descending"}. Click to reverse.`
    : `Sort by ${label}`;
  return `<button type="button" class="sort-header portfolio-financial-sort-header${isActive ? " active" : ""}" data-portfolio-financial-sort="${h(key)}" aria-label="${h(title)}" title="${h(title)}"><span>${h(label)}</span><span class="sort-arrow" aria-hidden="true">${arrow}</span></button>`;
}
function portfolioFinancialSortValue(fin, key) {
  const statusRank = {
    "Cashflow pressure": 1,
    "Underperforming": 2,
    "Low history": 3,
    "In benchmark": 4,
    "Above benchmark": 5,
    "Review": 6,
    "Not enough data": 9
  };
  const qualityRank = { High: 1, Medium: 2, "Revenue est.": 2, "CAPEX missing": 3, "Low days": 4, "Days missing": 5, "No actual kWh": 6 };
  switch (key) {
    case "site": return { type: "text", value: fin.site?.name || "" };
    case "days": return { type: "number", value: Number(fin.operationalDays), missing: !fin.hasOperationalDays };
    case "capex": return { type: "number", value: Number(fin.actualCapex), missing: !fin.hasActualCapex };
    case "kwh": return { type: "number", value: Number(fin.annualKwh), missing: !fin.hasActualKwh };
    case "revenue": return { type: "number", value: Number(fin.annualRevenue), missing: !(Number(fin.annualRevenue) > 0) };
    case "opex": return { type: "number", value: Number(fin.opexExElectricity), missing: !fin.hasActualKwh };
    case "ebitda": return { type: "number", value: Number(fin.operatingCashflow), missing: !fin.hasActualKwh };
    case "payback": return { type: "number", value: Number.isFinite(Number(fin.paybackYears)) ? Number(fin.paybackYears) : Number.POSITIVE_INFINITY, missing: false };
    case "status": return { type: "number", value: statusRank[fin.status?.label] || 8, missing: false };
    case "quality": return { type: "number", value: qualityRank[portfolioFinancialDataQualityShort(fin.dataQuality)] || 5, missing: false };
    default: return { type: "text", value: fin.site?.name || "" };
  }
}
function portfolioFinancialSortRows(rows) {
  const key = portfolioFinancialSortKey();
  const dir = portfolioFinancialSortDir() === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = portfolioFinancialSortValue(a, key);
    const bv = portfolioFinancialSortValue(b, key);
    if (av.missing !== bv.missing) return av.missing ? 1 : -1;
    if (av.type === "text" || bv.type === "text") {
      const textCompare = String(av.value || "").localeCompare(String(bv.value || ""));
      if (textCompare !== 0) return textCompare * dir;
    } else {
      const an = Number(av.value);
      const bn = Number(bv.value);
      const aFinite = Number.isFinite(an);
      const bFinite = Number.isFinite(bn);
      if (aFinite !== bFinite) return aFinite ? -1 : 1;
      if (aFinite && bFinite && an !== bn) return (an - bn) * dir;
    }
    return String(a.site?.name || "").localeCompare(String(b.site?.name || ""));
  });
}
function portfolioFinancialTableRow(fin) {
  const r = fin.result;
  const status = fin.status || { label: "Review", cls: "warn", note: "Review manually." };
  const revenueKey = portfolioFinancialRevenueKey(fin);
  const revenueSub = revenueKey === "actual-t12m"
    ? "actual T12M"
    : revenueKey === "est-t12m"
      ? "est. T12M"
      : fin.revenueEstimated ? "projected est." : "projected";
  const revenueTitle = revenueKey === "actual-t12m"
    ? "Actual trailing-12-month revenue from a trusted annual revenue field."
    : revenueKey === "est-t12m"
      ? "Estimated trailing-12-month revenue from annual kWh because actual T12M revenue is not available."
      : `${fin.revenueEstimated ? "Estimated" : "Projected"} annual run-rate based on ${Number(fin.operationalDays || 0).toFixed(0)} operational days / latest actual performance. Not a full-year actual T12M revenue figure.`;
  const modelKwh = Number(r.modelledAnnualKwh || 0);
  const capexDeltaLabel = Number.isFinite(Number(fin.capexDelta)) ? `Δ ${currency(fin.capexDelta, 0)}` : "Δ n/a";
  const actualCapexCell = fin.hasActualCapex
    ? portfolioFinancialMetric(currency(fin.actualCapex, 0), `${Number(fin.modelCapex) > 0 ? `model ${currency(fin.modelCapex, 0)} · ` : ""}${capexDeltaLabel}`)
    : `<span class="badge neutral">CAPEX missing</span><small class="portfolio-financial-cell-note">payback blocked</small>`;
  const kwhCell = fin.hasActualKwh
    ? portfolioFinancialMetric(kwh(fin.annualKwh, 0), `${modelKwh > 0 ? `model ${kwh(modelKwh, 0)} · ` : ""}${portfolioFinancialVarianceLabel(r.annualKwhVariance)}`)
    : "—";
  const paybackReason = fin.paybackState?.reason || portfolioPaybackSubtext(fin.paybackYears, fin.paybackState);
  const paybackShort = fin.paybackState?.state === "positive"
    ? "simple"
    : fin.paybackState?.state === "capexMissing"
      ? "CAPEX req."
      : fin.paybackState?.state === "lowHistory"
        ? "low history"
        : fin.paybackState?.state === "negativeCashflow"
          ? "neg. EBITDA"
          : portfolioPaybackSubtext(fin.paybackYears, fin.paybackState);
  const paybackCell = `<span class="badge ${h(fin.paybackState?.cls || "neutral")}" title="${h(paybackReason)}">${h(portfolioPaybackLabel(fin.paybackYears, fin.paybackState))}</span><small class="portfolio-financial-cell-note" title="${h(paybackReason)}">${h(paybackShort)}</small>`;
  const statusCell = `<span class="badge ${h(status.cls)}">${h(status.label)}</span><small class="portfolio-financial-cell-note" title="${h(status.note || fin.dataQuality)}">${h(portfolioFinancialDataQualityShort(fin.dataQuality))}</small>`;
  const rowClass = fin.muted ? "portfolio-financial-muted" : fin.partial ? "portfolio-financial-partial" : "";
  const opexTitle = fin.landlordApplied
    ? `OPEX excludes electricity. Electricity used in EBITDA: ${currency(fin.electricityCost,0)}. ${fin.landlordNote || "Actual landlord terms applied."}`
    : `OPEX excludes electricity and excludes landlord terms. Electricity used in EBITDA: ${currency(fin.electricityCost,0)}. ${fin.landlordNote || "No actual landlord terms provided."}`;
  const opexSub = fin.landlordApplied ? `excl. elec` : `excl. elec & landlord`;
  const ebitdaTitle = fin.landlordApplied
    ? "EBITDA proxy after electricity and OPEX, including actual landlord terms where provided."
    : "EBITDA proxy after electricity and OPEX, before landlord costs unless actual terms are provided.";
  const termsLabel = portfolioCommercialTermsLabel(fin.site);
  const siteKey = portfolioCommercialTermsKey(fin.site);
  const siteCell = `<div class="portfolio-financial-site"><button type="button" class="portfolio-financial-site-link" data-commercial-terms-open="${h(siteKey)}" title="Edit commercial terms for ${h(fin.site.name)}"><strong>${h(fin.site.name)}</strong></button><small title="${h(fin.site.modelEquivalentSummary || "")}">${h(fin.site.modelEquivalentSummary || "")}</small><button type="button" class="portfolio-commercial-chip ${h(termsLabel.cls)}" data-commercial-terms-open="${h(siteKey)}" title="${h(termsLabel.title)}">${h(termsLabel.label)} · Edit</button></div>`;
  return {
    className: rowClass,
    cells: [
      siteCell,
      portfolioOperationalDaysLabel(fin.operationalDays, fin.operationalDaysInfo),
      actualCapexCell,
      kwhCell,
      fin.annualRevenue > 0 ? portfolioFinancialMetric(currency(fin.annualRevenue, 0), revenueSub, "", revenueTitle) : "—",
      fin.hasActualKwh ? portfolioFinancialMetric(currency(fin.opexExElectricity, 0), opexSub, "", opexTitle) : "—",
      fin.hasActualKwh ? portfolioFinancialMetric(currency(fin.operatingCashflow, 0), fin.landlordApplied ? "run-rate" : "pre-landlord", "", ebitdaTitle) : "—",
      paybackCell,
      statusCell
    ]
  };
}
function renderPortfolioFinancialPerformance() {
  const rows = portfolioFinancialRows();
  const filteredRows = portfolioFinancialFilteredRows(rows);
  const summary = portfolioFinancialSummary(filteredRows);
  const horizon = portfolioFinancialHorizon();
  const projection = portfolioFinancialProjectionSummary(filteredRows, horizon);
  const headers = [
    portfolioFinancialSortHeader("site", "Site"),
    portfolioFinancialSortHeader("days", "Days"),
    portfolioFinancialSortHeader("capex", "CAPEX"),
    portfolioFinancialSortHeader("kwh", "kWh / yr"),
    portfolioFinancialSortHeader("revenue", "Revenue / yr"),
    portfolioFinancialSortHeader("opex", "OPEX / yr"),
    portfolioFinancialSortHeader("ebitda", "EBITDA / yr"),
    portfolioFinancialSortHeader("payback", "Payback"),
    portfolioFinancialSortHeader("status", "Status / quality")
  ];
  const sorted = portfolioFinancialSortRows(filteredRows);
  const sortNames = {
    site: "site",
    days: "commercial operational days",
    capex: "actual CAPEX",
    kwh: "actual annual kWh",
    revenue: "annual revenue",
    opex: "annual OPEX",
    ebitda: "annual EBITDA proxy",
    payback: "payback",
    status: "status / data quality",
    quality: "data quality"
  };
  const sortKey = portfolioFinancialSortKey();
  const sortDir = portfolioFinancialSortDir() === "desc" ? "high to low / Z-A" : "low to high / A-Z";
  const projectionNote = `Projection uses current annual run-rate and ${(projection.growth * 100).toFixed(1)}% annual growth/tariff escalation from model assumptions. Profitability is EBITDA proxy before landlord unless actual terms are loaded.`;
  return `
    ${sectionTitle("Portfolio Financial Performance", "Financial view of all active Portfolio Calibration sites: CAPEX control, current run-rate, long-term projection and site-level performance quality.")}
    ${portfolioLiveCalibrationCard(portfolioMappedSites())}
    ${portfolioFinancialFilterPanel(rows, filteredRows)}
    <section class="panel portfolio-financial-hero portfolio-financial-dashboard"><div class="portfolio-financial-dashboard-title"><span class="eyebrow">Portfolio dashboard</span><h3>Selected sites together</h3><p>Dashboard values follow the active filters. Revenue is projected unless a trusted trailing-12-month revenue field exists. Missing CAPEX blocks only payback, not demand status. Landlord costs are not assumed without actual landlord terms.</p></div>${portfolioFinancialDashboardWindows(rows, filteredRows, summary, projection, horizon)}<p class="muted small">${h(projectionNote)}</p></section>
    <section class="panel portfolio-financial-performance-panel"><div class="panel-title-row"><div><h3>Performance position</h3><p class="muted small">Demand and data-quality status for the currently selected sites.</p></div></div>${portfolioFinancialPerformanceCards(summary)}<p class="muted small">OPEX uses the model's current charger, DUoS, support and transaction-cost assumptions applied to actual annualised kWh/sessions. Landlord rent/share is excluded unless actual site-level landlord terms are provided. Negative-cashflow sites show “No payback”.</p></section>
    <section class="panel portfolio-financial-table-panel"><div class="panel-title-row"><div><h3>Site financial performance table <span class="portfolio-finance-footnote">V17.28 verified AADT API guard</span></h3><p class="muted small">Use the green header buttons to sort any column. Active sort: ${h(sortNames[sortKey] || "site")} · ${h(sortDir)}. Active filters: ${number(filteredRows.length,0)} of ${number(rows.length,0)} sites. Revenue shows actual T12M only when a trusted trailing-12-month revenue field exists; rolling/partial actuals are labelled projected annual run-rate. Days now use commercial operational basis: first session, first kWh, then energy-delivered days inferred from cumulative kWh and actual run-rate, then reported/stored fallbacks; generic telemetry first-active dates are not used. Payback is a current run-rate proxy. Click a site or commercial-term chip to edit landlord terms.</p></div></div>${filteredRows.length ? table(headers, sorted.map(portfolioFinancialTableRow), "portfolio-table portfolio-financial-table") : `<p class="notice">No sites match the selected filters. Reset filters to show all active sites.</p>`}</section>
    ${portfolioCommercialTermsModal(rows)}
  `;
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
      "designPeakFloorSessions"
    ]
  },
  {
    title: "Peak window & power defaults",
    keys: [
      "techUpliftEarlyPhaseRate",
      "techUpliftMiddlePhaseRate",
      "techUpliftCap",
      "durationResponseFactor",
      "powerFactor"
    ]
  },
  {
    title: "Battery technical assumptions",
    keys: [
      "batteryDispatchFractionUsable",
      "batteryBaseDegradationRate",
      "batteryCyclingDegradationFactor",
      "overnightRechargeWindowDuration"
    ]
  },
  {
    title: "Commercial, service & warranty assumptions",
    keys: [
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
  }
];

const ADVANCED_EXCLUDED_KEYS = new Set([...DEMAND_KEYS, ...SETUP_INPUT_KEYS, "siteAddress", "rawCorridorTrafficAadt", "trafficSourceYear", "investmentHorizon", "modelStartYear", "codYear"]);
const UNIT_MAP = {
  annualTrafficGrowthRate: "%", siteRelevanceFactor: "%", onRoadBevShareAtCod: "%", bevShareCap: "%", fastChargePropensity: "%", effectiveAadtCap: "veh/day", benchmarkTargetSessionsPer1000Aadt: "sessions/1k AADT",
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
  benchmarkProfile: "Site-type benchmark profile used to load relevance, capture, effective AADT cap and target sessions/1k AADT.",
  effectiveAadtCap: "Optional cap applied to matched AADT before the demand chain where only part of passing traffic is commercially relevant.",
  benchmarkTargetSessionsPer1000Aadt: "Portfolio benchmark capture metric used as guidance for the selected site type.",
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
  landlordGpShare: "Share of gross profit paid to the landlord where that commercial structure is used. Defaults to 0; populate manually only when actual terms exist. Mutually exclusive with gross-sales share.",
  landlordGrossSalesShare: "Share of gross sales paid to the landlord where that commercial structure is used. Defaults to 0; populate manually only when actual terms exist. Mutually exclusive with GP share; gross-sales share takes precedence if both fields are populated.",
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
    <div class="reset-card" style="border-color:#efd38e;background:linear-gradient(135deg,#fff3d6,#fbfaf7)"><div><strong>Reset all advanced settings to default values</strong><p>Restores the visible advanced assumptions to the base default values. Changes here affect demand, feasibility, capex, opex, ROI, cash flow and scenario ranking where the relevant factor is used.</p></div><button class="reset" data-reset="advanced">Reset all</button></div>
    <div class="advanced-groups">
      ${DEVELOPER_GROUPS.map(group => {
        const keys = group.keys.filter(k => advancedInputKeys().includes(k));
        if (!keys.length) return "";
        return `<section class="panel"><h3>${h(group.title)}</h3><p class="advanced-section-note">Only advanced assumptions not already editable in the main workflow are shown here.</p><div class="input-grid three">${keys.map(developerField).join("")}</div></section>`;
      }).join("")}
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
    ["portfolio", "Back-test real hubs", "Compare modelled output against real operating hubs using matched AADT, MIC and model-equivalent chargers.", "Open Calibration", "scales"],
    ["portfolioFinancials", "Review portfolio financials", "See actual CAPEX, model CAPEX, operating days, actual-run-rate revenue, OPEX and payback quality across all live sites.", "Open Financials", "money"],
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
    <div class="notice aadt-help"><strong>Traffic assumption note</strong><br>${h(aadtHelpText())}</div>
    <div class="export-card-grid">
      <section class="export-card primary-export">
        <h3>Investor PDF Pack</h3>
        <p>Exports a polished PDF-ready report covering Site Screening, Demand Forecast, Product Configuration, Investment Case, Annual Financials, Scenario Ranking, Portfolio Calibration and Portfolio Financials. AADT is explained in the assumptions section of the report.</p>
        <button class="primary" id="exportInvestorPdf">Export investor PDF</button>
      </section>
      <section class="export-card excel-export">
        <h3>Annual Financials Excel</h3>
        <p>Exports annual sessions, delivered kWh, revenue, electricity cost, gross profit, opex, cash flow and scenario ranking in an Excel-readable workbook.</p>
        <button class="primary" id="exportAnnualExcel">Export annual financials Excel</button>
      </section>
      <section class="export-card portfolio-financial-export">
        <h3>Portfolio Financials Export</h3>
        <p>Standalone export of the Portfolio Financials tab only. Excel exports the same investor table as the app. PDF exports the Portfolio Financials dashboard, performance cards and site table.</p>
        <div class="actions">
          <button class="primary" id="exportPortfolioFinancialsExcel">Export Portfolio Financials Excel</button>
          <button class="secondary" id="exportPortfolioFinancialsPdf">Export Portfolio Financials PDF</button>
        </div>
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

function updateResponsiveTabNavigation() {
  const tabs = document.getElementById("tabs");
  if (!tabs) return;
  const buttons = Array.from(tabs.querySelectorAll("button"));
  if (!buttons.length) return;
  const applyLabels = (mode = "long") => {
    buttons.forEach(btn => {
      const longLabel = btn.dataset.long || btn.textContent.trim();
      const shortLabel = btn.dataset.short || longLabel;
      btn.textContent = mode === "short" ? shortLabel : longLabel;
      btn.title = longLabel;
    });
  };
  const totalButtonWidth = () => {
    const gap = Number.parseFloat(getComputedStyle(tabs).columnGap || getComputedStyle(tabs).gap || "8") || 8;
    return Math.ceil(buttons.reduce((sum, btn) => sum + btn.offsetWidth, 0) + gap * Math.max(0, buttons.length - 1));
  };
  tabs.classList.remove("tabs-compact", "tabs-wrap");
  applyLabels("long");
  void tabs.offsetWidth;
  const available = Math.max(0, tabs.clientWidth - 6);
  if (totalButtonWidth() <= available) return;
  tabs.classList.add("tabs-compact");
  applyLabels("short");
  void tabs.offsetWidth;
  if (totalButtonWidth() <= available) return;
  tabs.classList.add("tabs-wrap");
}

function render() {
  enforceConfigCompatibility();
  let r;
  const pages = {
    site: () => renderSiteDashboard(),
    demand: () => renderDemandDashboard(r),
    setup: () => renderScenarioSetup(r),
    investment: () => renderInvestmentDashboard(r),
    annuals: () => renderAnnualFinancials(r),
    scenario: () => renderScenarioRanking(r),
    portfolio: () => renderPortfolioCalibration(),
    portfolioFinancials: () => renderPortfolioFinancialPerformance(),
    advanced: () => renderAdvancedSettings(r),
    report: () => renderInvestorReport(r)
  };
  try {
    activeTab = VALID_TABS.includes(activeTab) ? activeTab : "site";
    updateResponsiveTabNavigation();
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
      if (key === "grantSupport") {
        grantSupportManualOverride = true;
        clearGrantSupportMetadata();
        const manualAmount = Number(raw || 0);
        if (Number.isFinite(manualAmount) && manualAmount > 0) {
          state.inputs.grantSupportSourceLabel = "Manual entry";
          state.inputs.grantSupportMatchConfidence = "Manual";
        }
      }
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

  const benchmarkProfileSelect = el("benchmarkProfileSelect");
  if (benchmarkProfileSelect) benchmarkProfileSelect.addEventListener("change", e => {
    setInput("benchmarkProfile", e.target.value);
    preserveScrollRender();
  });
  const applyBenchmarkProfileButton = el("applyBenchmarkProfile");
  if (applyBenchmarkProfileButton) applyBenchmarkProfileButton.addEventListener("click", () => {
    const selected = el("benchmarkProfileSelect")?.value || state.inputs.benchmarkProfile || "auto";
    applyDemandBenchmarkProfile(selected);
    preserveScrollRender();
  });

  document.querySelectorAll("[data-config]").forEach(node => {
    node.addEventListener("change", e => {
      const key = e.target.dataset.config;
      let raw = e.target.value;
      if (["selectedMicKva", "chargerWarrantyYears", "batteryWarrantyYears", "dispenserCount", "chargerCount", "kempowerTripleCabinetCount"].includes(key)) {
        raw = raw === "N/A" ? "N/A" : Number(raw);
      }
      const hardwareConfigKeys = new Set(["platform", "chargerModel", "chargerCount", "cabinetType", "dispenserCount", "kempowerTripleCabinetCount"]);
      setConfig(key, raw);
      if (hardwareConfigKeys.has(key)) {
        delete state.config.actualInstalledPowerKwOverride;
        delete state.config.actualInstalledPowerKwSourceLabel;
      }
      if (!["actualInitialCapexOverride", "capexSourceLabel"].includes(key)) {
        delete state.config.actualInitialCapexOverride;
        delete state.config.capexSourceLabel;
      }
      enforceConfigCompatibility();
      preserveScrollRender();
    });
  });

  const clearZeviGrant = el("clearZeviGrant");
  if (clearZeviGrant) clearZeviGrant.addEventListener("click", () => {
    setInput("grantSupport", 0);
    clearGrantSupportMetadata();
    grantSupportManualOverride = true;
    preserveScrollRender();
  });
  const applyZeviGrantSuggestion = el("applyZeviGrantSuggestion");
  if (applyZeviGrantSuggestion) applyZeviGrantSuggestion.addEventListener("click", () => {
    const suggestion = state.inputs.grantSupportSuggestion;
    if (suggestion) applyZeviFundingMatch(suggestion, { force: true });
    preserveScrollRender();
  });


  const portfolioSelect = el("portfolioSiteSelect");
  if (portfolioSelect) portfolioSelect.addEventListener("change", e => { localStorage.setItem("evHub.portfolio.selectedSite", e.target.value); render(); });
  document.querySelectorAll("[data-portfolio-filter]").forEach(node => {
    node.addEventListener("change", e => {
      const key = e.target.dataset.portfolioFilter;
      if (!key) return;
      const value = e.target.value;
      if (value === "all" && e.target.checked) {
        localStorage.setItem(`evHub.portfolio.${key}`, "all");
        render();
        return;
      }
      const checked = Array.from(document.querySelectorAll(`[data-portfolio-filter="${key}"]`))
        .filter(input => input.value !== "all" && input.checked)
        .map(input => input.value);
      localStorage.setItem(`evHub.portfolio.${key}`, checked.length ? checked.join(",") : "all");
      render();
    });
  });
  document.querySelectorAll(".portfolio-multi-filter").forEach(details => {
    details.addEventListener("toggle", () => {
      if (details.open) {
        closePortfolioStatusPopover();
        closePortfolioFilterMenus(details);
      }
    });
  });
  document.querySelectorAll("[data-portfolio-sort]").forEach(node => {
    node.addEventListener("click", e => {
      const key = e.currentTarget.dataset.portfolioSort;
      const currentKey = localStorage.getItem("evHub.portfolio.sortKey") || "site";
      const currentDir = localStorage.getItem("evHub.portfolio.sortDir") || "asc";
      localStorage.setItem("evHub.portfolio.sortKey", key);
      localStorage.setItem("evHub.portfolio.sortDir", currentKey === key && currentDir === "asc" ? "desc" : "asc");
      render();
    });
  });
  document.querySelectorAll("[data-portfolio-financial-sort]").forEach(node => {
    node.addEventListener("click", e => {
      const key = e.currentTarget.dataset.portfolioFinancialSort;
      const currentKey = localStorage.getItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.sortKey`) || "site";
      const currentDir = localStorage.getItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.sortDir`) || "asc";
      localStorage.setItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.sortKey`, key);
      localStorage.setItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.sortDir`, currentKey === key && currentDir === "asc" ? "desc" : "asc");
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-portfolio-financial-filter-checkbox]").forEach(node => {
    node.addEventListener("change", e => {
      const key = e.currentTarget.dataset.portfolioFinancialFilterCheckbox;
      const value = e.currentTarget.value || "";
      if (!key || !value) return;
      const current = portfolioFinancialFilterValues(key).filter(v => v !== "all");
      const next = new Set(current);
      if (e.currentTarget.checked) next.add(value); else next.delete(value);
      localStorage.setItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.filter.${key}`, portfolioFinancialFilterStorageValue([...next]));
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-portfolio-financial-filter-all]").forEach(node => {
    node.addEventListener("click", e => {
      const key = e.currentTarget.dataset.portfolioFinancialFilterAll;
      if (!key) return;
      localStorage.setItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.filter.${key}`, "all");
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-portfolio-financial-reset-filters]").forEach(node => {
    node.addEventListener("click", () => {
      PORTFOLIO_FINANCIAL_FILTERS.forEach(key => localStorage.setItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.filter.${key}`, "all"));
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-portfolio-financial-horizon]").forEach(node => {
    node.addEventListener("click", e => {
      localStorage.setItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.horizon`, e.currentTarget.dataset.portfolioFinancialHorizon || "5");
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-commercial-terms-open]").forEach(node => {
    node.addEventListener("click", e => {
      e.preventDefault();
      const key = e.currentTarget.dataset.commercialTermsOpen;
      if (!key) return;
      localStorage.setItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.commercialModal`, key);
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-commercial-terms-close], [data-commercial-modal-backdrop]").forEach(node => {
    node.addEventListener("click", e => {
      if (e.currentTarget !== e.target && e.currentTarget.dataset.commercialModalBackdrop) return;
      localStorage.removeItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.commercialModal`);
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-commercial-term='termType']").forEach(node => {
    const sync = () => {
      const form = node.closest("[data-commercial-form]");
      const type = node.value;
      const fixed = form?.querySelector("[data-commercial-term='fixedRent']");
      const gp = form?.querySelector("[data-commercial-term='gpSharePct']");
      const sales = form?.querySelector("[data-commercial-term='salesSharePct']");
      if (fixed) fixed.disabled = !["fixed", "fixed-gp", "fixed-sales"].includes(type);
      if (gp) gp.disabled = !["gp", "fixed-gp"].includes(type);
      if (sales) sales.disabled = !["sales", "fixed-sales"].includes(type);
    };
    node.addEventListener("change", sync);
    sync();
  });
  document.querySelectorAll("[data-commercial-site-form]").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const key = form.dataset.commercialSiteForm;
      const row = portfolioFinancialRows().find(r => portfolioCommercialTermsKey(r.site) === key);
      if (!row) return;
      portfolioCommercialTermsSave(row.site, portfolioCommercialReadForm(form));
      localStorage.removeItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.commercialModal`);
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-commercial-terms-clear]").forEach(node => {
    node.addEventListener("click", e => {
      const key = e.currentTarget.dataset.commercialTermsClear;
      const row = portfolioFinancialRows().find(r => portfolioCommercialTermsKey(r.site) === key);
      if (row) portfolioCommercialTermsClear(row.site);
      localStorage.removeItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.commercialModal`);
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-commercial-bulk-select]").forEach(node => {
    node.addEventListener("click", e => {
      const mode = e.currentTarget.dataset.commercialBulkSelect;
      document.querySelectorAll("[data-commercial-bulk-site]").forEach(box => { box.checked = mode === "all"; });
    });
  });
  document.querySelectorAll("[data-commercial-bulk-form]").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const terms = portfolioCommercialReadForm(form);
      const rows = portfolioFinancialRows();
      form.querySelectorAll("[data-commercial-bulk-site]:checked").forEach(box => {
        const row = rows.find(r => portfolioCommercialTermsKey(r.site) === box.value);
        if (row) portfolioCommercialTermsSave(row.site, terms);
      });
      localStorage.removeItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.commercialModal`);
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-commercial-bulk-clear]").forEach(node => {
    node.addEventListener("click", e => {
      const form = e.currentTarget.closest("form");
      const rows = portfolioFinancialRows();
      form?.querySelectorAll("[data-commercial-bulk-site]:checked").forEach(box => {
        const row = rows.find(r => portfolioCommercialTermsKey(r.site) === box.value);
        if (row) portfolioCommercialTermsClear(row.site);
      });
      localStorage.removeItem(`${PORTFOLIO_FINANCIAL_STORAGE_PREFIX}.commercialModal`);
      preserveScrollRender();
    });
  });
  document.querySelectorAll("[data-portfolio-status-trigger]").forEach(node => {
    node.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      showPortfolioStatusPopover(e.currentTarget);
    });
  });
  document.querySelectorAll("[data-portfolio-variance-trigger]").forEach(node => {
    node.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      showPortfolioVariancePopover(e.currentTarget);
    });
  });
  document.querySelectorAll("[data-portfolio-maturity-trigger]").forEach(node => {
    node.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      showPortfolioMaturityPopover(e.currentTarget);
    });
  });
  const portfolioUploadInput = el("portfolioCalibrationFiles");
  const portfolioUploadStatus = el("portfolioCalibrationUploadStatus");
  if (portfolioUploadInput) portfolioUploadInput.addEventListener("change", async () => {
    const files = Array.from(portfolioUploadInput.files || []);
    if (!files.length) {
      if (portfolioUploadStatus) portfolioUploadStatus.textContent = "No files selected. Stored calibration data remains active.";
      return;
    }
    const form = new FormData();
    files.forEach(file => form.append("files", file, file.name));
    portfolioUploadInput.disabled = true;
    if (portfolioUploadStatus) portfolioUploadStatus.textContent = "Validating uploaded calibration files automatically…";
    try {
      const res = await fetch("/api/import-live-calibration", { method: "POST", body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.ok) throw payload;
      savePortfolioLiveActuals(payload);
      render();
    } catch (err) {
      portfolioLiveUploadError = err || { message: "Unknown upload error" };
      clearPortfolioLiveActuals();
      portfolioLiveUploadError = err || { message: "Unknown upload error" };
      render();
    } finally {
      portfolioUploadInput.disabled = false;
    }
  });
  const clearPortfolioUpload = el("clearPortfolioCalibrationUpload");
  if (clearPortfolioUpload) clearPortfolioUpload.addEventListener("click", () => { clearPortfolioLiveActuals(); render(); });

  const applyPortfolioSite = el("applyPortfolioSite");
  if (applyPortfolioSite) applyPortfolioSite.addEventListener("click", () => {
    const portfolioSiteList = portfolioSites({ includeAdditional: true });
    const selectedId = localStorage.getItem("evHub.portfolio.selectedSite") || portfolioSiteList[0]?.id;
    const site = portfolioSiteList.find(s => s.id === selectedId) || portfolioSiteList[0];
    if (!site || !portfolioCanLoadSite(site)) {
      alert(portfolioLoadBlockReason(site));
      return;
    }
    applyPortfolioSiteModelConfig(site);
    setInput("siteAddress", site.address || site.name);
    setInput("rawCorridorTrafficAadt", Number(site.aadt || 0));
    state.filters.manualAadtOverride = true;
    pendingPortfolioSiteSearch = { siteId: site.id };
    const siteLat = Number(site.lat || 0);
    const siteLon = Number(site.lon || 0);
    const hasPreciseCoords = siteLat > 50 && siteLat < 56 && siteLon > -11 && siteLon < -5;
    setSiteContext({
      ok: true,
      site: {
        name: site.name,
        display_address: site.address || site.name,
        lat: hasPreciseCoords ? siteLat : 53.35,
        lon: hasPreciseCoords ? siteLon : -7.70,
        source: hasPreciseCoords ? "Portfolio calibration — precise curated coordinates" : "Portfolio calibration pending map search",
        confidence: hasPreciseCoords ? "portfolio curated" : "pending site screening search"
      },
      traffic: portfolioSiteTraffic(site, {}),
      chargers: [],
      warning: hasPreciseCoords
        ? "Portfolio site loaded with curated coordinates. Running nearby charger search to refresh local data. Portfolio MIC, AADT and charger configuration are preserved."
        : "Opening this operating hub in Site Screening and running the normal map / nearby charger search. Portfolio MIC, AADT and charger configuration are preserved."
    });
    goTab("site");
  });

  const searchBtn = el("searchBtn");
  const addressInput = el("addressSearch");
  const searchStatus = el("addressSearchStatus");
  let siteSearchInFlight = false;
  const runSiteSearch = async (options = {}) => {
    if (siteSearchInFlight) return;
    const portfolioSite = options.portfolioSite || null;
    const requestedAddress = options.address || addressInput?.value?.trim() || state.inputs.siteAddress || "";
    const address = String(requestedAddress || "").trim();
    if (!address) {
      if (searchStatus) {
        searchStatus.textContent = "Enter an address or Eircode to start the site search.";
        searchStatus.className = "address-search-status warn";
      }
      return;
    }
    if (portfolioSite) {
      applyPortfolioSiteModelConfig(portfolioSite);
      state.filters.manualAadtOverride = true;
      state.inputs.rawCorridorTrafficAadt = Number(portfolioSite.aadt || state.inputs.rawCorridorTrafficAadt || 0);
    }
    siteSearchInFlight = true;
    mapSearchVersion += 1;
    resetMapState(portfolioSite ? "portfolio site map search started" : "new address search started");
    if (searchBtn) {
      searchBtn.textContent = portfolioSite ? "Loading portfolio site map…" : "Searching + calculating AADT…";
      searchBtn.disabled = true;
    }
    if (searchStatus) {
      searchStatus.textContent = portfolioSite
        ? `Loading ${portfolioSite.name} through the normal Site Screening search: address, map, AADT context and nearby chargers.`
        : "Searching address, AADT and nearby chargers. This will time out safely if providers do not respond.";
      searchStatus.className = "address-search-status searching";
    }
    try {
      const ctx = await searchLocation(address, state.filters.radiusKm, { timeoutMs: 18000 });
      const guardedCtx = portfolioSite ? ctx : await ensureClientCoordinateFirstAadt(ctx, address);
      // portfolioSearchContext(ctx, portfolioSite) preserves portfolio AADT/MIC while using the refreshed address/map search result.
      const nextCtx = portfolioSite ? portfolioSearchContext(guardedCtx, portfolioSite) : guardedCtx;
      setSiteContext(nextCtx);
      state.inputs.siteAddress = address;
      autoApplyZeviFundingForContext(portfolioSite ? grantFundingContextFromSite(portfolioSite) : grantFundingContextFromCurrent({ searchText: address }), { force: !!portfolioSite });
      if (portfolioSite) {
        state.inputs.rawCorridorTrafficAadt = Number(portfolioSite.aadt || nextCtx?.traffic?.aadt || state.inputs.rawCorridorTrafficAadt || 0);
        state.filters.manualAadtOverride = true;
      } else if (!state.filters.manualAadtOverride && nextCtx?.traffic?.aadt) {
        state.inputs.rawCorridorTrafficAadt = Number(nextCtx.traffic.aadt);
        const sourceYear = latestYearFromText(nextCtx.traffic.aadt_year || nextCtx.traffic.source || nextCtx.traffic.reference || "");
        if (sourceYear) state.inputs.trafficSourceYear = sourceYear;
      }
    } catch (err) {
      const fallbackCtx = {
        ok: true,
        site: { name: address, lat: 53.35, lon: -7.70, source: "UI fallback after unexpected search error", confidence: "fallback" },
        traffic: { aadt: 12000, source: "Fallback AADT estimate only — unexpected UI error", confidence: "low / fallback", provider: "UI fallback" },
        chargers: [],
        warning: `Address search failed safely and the button was reset. Detail: ${err?.message || err}`
      };
      setSiteContext(portfolioSite ? portfolioSearchContext(fallbackCtx, portfolioSite) : fallbackCtx);
      state.inputs.siteAddress = address;
      if (portfolioSite) autoApplyZeviFundingForContext(grantFundingContextFromSite(portfolioSite), { force: true });
      else autoApplyZeviFundingForContext(grantFundingContextFromCurrent({ searchText: address }), { keepExistingSuggestion: true });
      if (portfolioSite) {
        state.inputs.rawCorridorTrafficAadt = Number(portfolioSite.aadt || state.inputs.rawCorridorTrafficAadt || 0);
        state.filters.manualAadtOverride = true;
      }
    } finally {
      siteSearchInFlight = false;
      if (searchBtn) {
        searchBtn.textContent = "Search";
        searchBtn.disabled = false;
      }
      render();
    }
  };
  if (searchBtn) searchBtn.addEventListener("click", () => runSiteSearch());
  if (pendingPortfolioSiteSearch && activeTab === "site") {
    const pending = pendingPortfolioSiteSearch;
    pendingPortfolioSiteSearch = null;
    const site = portfolioSites().find(s => s.id === pending.siteId);
    if (site) setTimeout(() => runSiteSearch({ portfolioSite: site, address: site.address || site.name }), 0);
  }
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

  document.querySelectorAll("[data-select-tii-candidate]").forEach(node => {
    node.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const idx = e.currentTarget.dataset.selectTiiCandidate;
      applyTiiCandidateSelection(idx);
    });
    node.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const idx = e.currentTarget.dataset.selectTiiCandidate;
        applyTiiCandidateSelection(idx);
      }
    });
  });
  const showAllAadtCounters = el("showAllAadtCounters");
  if (showAllAadtCounters) showAllAadtCounters.addEventListener("change", e => {
    state.filters.showAllAadtCounters = Boolean(e.target.checked);
    render();
  });

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
      const guardedCtx = await ensureClientCoordinateFirstAadt(ctx, label);
      setSiteContext(guardedCtx);
      state.inputs.siteAddress = label;
      autoApplyZeviFundingForContext(grantFundingContextFromCurrent({ searchText: label }), { keepExistingSuggestion: true });
      if (!state.filters.manualAadtOverride && guardedCtx?.traffic?.aadt) {
        state.inputs.rawCorridorTrafficAadt = Number(guardedCtx.traffic.aadt);
        const sourceYear = latestYearFromText(guardedCtx.traffic.aadt_year || guardedCtx.traffic.source || guardedCtx.traffic.reference || "");
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
  window.__evHubSelectAadtCandidate = applyTiiCandidateSelection;
  window.__evHubSelectAadtCounterById = applyTiiCounterIdSelection;

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
  const exportPortfolioFinancialsExcelButton = el("exportPortfolioFinancialsExcel");
  if (exportPortfolioFinancialsExcelButton) exportPortfolioFinancialsExcelButton.addEventListener("click", () => exportPortfolioFinancialsExcel(portfolioFinancialExportPayload()));
  const exportPortfolioFinancialsPdfButton = el("exportPortfolioFinancialsPdf");
  if (exportPortfolioFinancialsPdfButton) exportPortfolioFinancialsPdfButton.addEventListener("click", () => exportPortfolioFinancialsPdf(portfolioFinancialExportPayload()));
}

function enforceConfigCompatibility() {
  if (state.config.platform === "Autel Standalone") {
    state.config.cabinetType = "N/A";
    state.config.dispenserCount = "N/A";
    state.config.kempowerTripleCabinetCount = "N/A";
    if (state.config.chargerModel === "N/A") state.config.chargerModel = "Autel DH480 — 320 kW";
    if (state.config.chargerCount === "N/A") state.config.chargerCount = 2;
    state.config.chargerCount = Math.max(1, Math.round(Number(state.config.chargerCount) || 1));
  } else {
    state.config.chargerModel = "N/A";
    state.config.chargerCount = "N/A";
    const cabinets = cabinetOptions(state.config.platform);
    if (!cabinets.some(x => x.item === state.config.cabinetType)) state.config.cabinetType = cabinets[0]?.item || "N/A";
    if (showKempowerTripleCabinetCount(state.config)) {
      const rawCount = Math.round(Number(state.config.kempowerTripleCabinetCount || 1));
      state.config.kempowerTripleCabinetCount = rawCount === 2 ? 2 : 1;
    } else {
      state.config.kempowerTripleCabinetCount = "N/A";
    }
    const maxDual = selectedCabinetMaxDualDisp(state.config);
    let disp = state.config.dispenserCount === "N/A" ? 2 : Math.round(Number(state.config.dispenserCount) || 0);
    disp = Math.max(0, disp);
    if (maxDual != null) disp = Math.min(disp, maxDual);
    state.config.dispenserCount = disp;
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

function aadtPopupHtml(candidate, idx) {
  const isSelected = Boolean(candidate.selected);
  const name = h(candidate.counter_name || candidate.counter_id || "TII counter");
  const distance = Number.isFinite(Number(candidate.distance_km)) ? `${number(Number(candidate.distance_km), 2)} km from site` : "distance unavailable";
  const aadt = Number(candidate.aadt);
  const id = encodeURIComponent(aadtCounterStableId(candidate) || String(idx));
  const confidence = candidate.confidence || (candidate.diagnostic ? "Diagnostic / manual review" : "confidence not provided");
  const basis = candidate.match_basis || candidate.location_source || "TII counter candidate";
  const official = candidate.official_location ? "Official TII map coordinate" : "Bundled/local counter coordinate";
  return `<div class="aadt-popup"><strong>${name}</strong><span>${h(candidate.route || "route not provided")} · ${distance}</span><span>${Number.isFinite(aadt) ? number(aadt,0) + " AADT" : "AADT not available"}</span><span>${h(confidence)}</span><span>${h(official)}</span><small>${h(basis)}</small><button type="button" onclick="window.__evHubSelectAadtCounterById && window.__evHubSelectAadtCounterById('${id}')">${isSelected ? "Using this counter" : "Use this counter"}</button></div>`;
}
function updateAadtCounterOverlay(siteLat, siteLon) {
  if (!map || !mapLoaded || !map.getStyle()) return [];
  aadtMarkers.forEach(m => m.remove());
  aadtMarkers = [];
  const recommended = (state.siteContext?.traffic?.candidates || [])
    .slice(0, 4)
    .map((c, idx) => ({ ...c, __idx: idx, __rank: idx + 1, lat: Number(c.lat), lon: Number(c.lon), recommended: true }))
    .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  const recommendedIds = new Set(recommended.map(aadtCounterStableId));
  const diagnostic = state.filters.showAllAadtCounters ? (state.siteContext?.traffic?.nearby_counters || [])
    .map((c, idx) => ({ ...c, __idx: idx, __rank: idx + 1, lat: Number(c.lat), lon: Number(c.lon), diagnostic: true }))
    .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon) && !recommendedIds.has(aadtCounterStableId(c)))
    .slice(0, 28) : [];
  const candidates = [...recommended, ...diagnostic];
  const lineFeatures = recommended.map(c => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[siteLon, siteLat], [c.lon, c.lat]] },
    properties: { selected: Boolean(c.selected), route: c.route || "", aadt: Number(c.aadt || 0) }
  }));
  const lineData = { type: "FeatureCollection", features: lineFeatures };
  if (!map.getSource("aadt-lines")) {
    map.addSource("aadt-lines", { type: "geojson", data: lineData });
    map.addLayer({
      id: "aadt-counter-lines",
      type: "line",
      source: "aadt-lines",
      paint: {
        "line-color": ["case", ["boolean", ["get", "selected"], false], "#f97316", "#0ea5a4"],
        "line-opacity": ["case", ["boolean", ["get", "selected"], false], 0.9, 0.34],
        "line-width": ["case", ["boolean", ["get", "selected"], false], 4, 2],
        "line-dasharray": ["case", ["boolean", ["get", "selected"], false], [1, 0], [2, 2]]
      }
    });
  } else {
    map.getSource("aadt-lines").setData(lineData);
  }
  candidates.forEach(c => {
    const rankLabel = c.selected ? "✓" : c.recommended ? String(c.__rank) : "·";
    const cls = `aadt-marker-el ${c.selected ? "selected" : c.recommended ? "candidate" : "diagnostic"}`;
    const element = makeMarker(cls, rankLabel);
    const popup = new maplibregl.Popup({ offset: 18, closeButton: true, closeOnClick: false }).setHTML(aadtPopupHtml(c, c.__idx));
    const marker = new maplibregl.Marker({ element })
      .setLngLat([c.lon, c.lat])
      .setPopup(popup)
      .addTo(map);
    const openMarkerPopup = () => { try { if (!marker.getPopup().isOpen()) marker.togglePopup(); } catch (_) {} };
    element.addEventListener("mouseenter", openMarkerPopup);
    element.addEventListener("focus", openMarkerPopup);
    element.addEventListener("click", openMarkerPopup);
    aadtMarkers.push(marker);
  });
  return recommended;
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
  aadtMarkers.forEach(m => m.remove());
  aadtMarkers = [];
  siteMarker = new maplibregl.Marker({ element: makeMarker("site-marker-el", "⚡") }).setLngLat([lon, lat]).setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(`<strong>${h(ctx?.site?.name || "Selected site")}</strong><br>Selected site`)).addTo(map);
  const chargers = filteredChargers();
  chargers.forEach(charger => {
    const p = maxConnectorPower(charger);
    const marker = new maplibregl.Marker({ element: makeMarker("charger-marker-el", "•") }).setLngLat([charger.lon, charger.lat]).setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<strong>${h(charger.name)}</strong><br>${number(charger.distance_km,2)} km<br>${p == null ? "Power not provided" : kw(p,0)}`)).addTo(map);
    chargerMarkers.push(marker);
  });
  const aadtCandidatesForBounds = updateAadtCounterOverlay(lat, lon);
  const [sw, ne] = radiusBounds(lon, lat, state.filters.radiusKm);
  const bounds = new maplibregl.LngLatBounds(sw, ne);
  chargers.forEach(charger => bounds.extend([charger.lon, charger.lat]));
  aadtCandidatesForBounds.forEach(c => bounds.extend([c.lon, c.lat]));
  map.fitBounds(bounds, {
    padding: { top: 92, bottom: 74, left: 74, right: 74 },
    maxZoom: 15,
    duration: 450
  });
  lastRenderedMapKey = mapKey;
  const confidence = ctx?.site?.confidence ? ` Location confidence: ${ctx.site.confidence}.` : "";
  const aadtOverlayNote = aadtCandidatesForBounds.length ? ` AADT overlay: ${aadtCandidatesForBounds.filter(c => c.selected).length || 1} selected/recommended counter${aadtCandidatesForBounds.length === 1 ? "" : "s"} shown.` : "";
  showMapStatus(`Map centred on ${h(ctx?.site?.name || "selected site")} at ${number(lat, 5)}, ${number(lon, 5)}. Radius: ${state.filters.radiusKm < 1 ? "500 m" : state.filters.radiusKm + " km"}.${confidence}${aadtOverlayNote}`);
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
  closePortfolioStatusPopover();
  render();
});

document.addEventListener("click", e => {
  const pop = document.getElementById("portfolioStatusPopover");
  if (pop && !e.target.closest("#portfolioStatusPopover") && !e.target.closest("[data-portfolio-status-trigger]") && !e.target.closest("[data-portfolio-maturity-trigger]") && !e.target.closest("[data-portfolio-variance-trigger]")) closePortfolioStatusPopover();
  if (!e.target.closest(".portfolio-multi-filter")) closePortfolioFilterMenus();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closePortfolioStatusPopover();
    closePortfolioFilterMenus();
  }
});

window.addEventListener("resize", () => { updateResponsiveTabNavigation(); closePortfolioStatusPopover(); closePortfolioFilterMenus(); });
window.addEventListener("scroll", () => { closePortfolioStatusPopover(); closePortfolioFilterMenus(); }, true);

updateResponsiveTabNavigation();
render();
