import { downloadText } from "../utils.js";

const SNAPSHOT_STORAGE_KEY = "evHub.forecastSnapshots.v21_6";
const MAX_SNAPSHOTS = 1000;
const FALLBACK_SNAPSHOTS = 250;

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableObject(value[key])]));
  }
  return value;
}

function simpleHash(value) {
  const text = JSON.stringify(stableObject(value));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function listForecastSnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function forecastSnapshotCount() {
  return listForecastSnapshots().length;
}

function persistForecastSnapshots(rows = []) {
  const retained = Array.isArray(rows) ? rows.slice(-MAX_SNAPSHOTS) : [];
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(retained));
    return { persisted: true, count: retained.length, pruned: Math.max(0, Number(rows?.length || 0) - retained.length), error: null };
  } catch (firstError) {
    const fallback = retained.slice(-FALLBACK_SNAPSHOTS);
    try {
      localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(fallback));
      return { persisted: true, count: fallback.length, pruned: Math.max(0, Number(rows?.length || 0) - fallback.length), error: null };
    } catch (secondError) {
      return {
        persisted: false,
        count: listForecastSnapshots().length,
        pruned: 0,
        error: secondError?.message || firstError?.message || "Browser storage unavailable"
      };
    }
  }
}

export function buildForecastSnapshot(state, results, reason = "manual-save") {
  const now = new Date();
  const inputs = { ...(state?.inputs || {}) };
  const config = { ...(state?.config || {}) };
  const financial = results?.financialSummary || {};
  const demand = results?.demand || {};
  const site = state?.siteContext?.site || {};
  const actualDataCutoff = state?.siteContext?.actualDataCutoff || state?.siteContext?.traffic?.source_date || null;
  return {
    snapshotId: `${now.toISOString()}-${simpleHash({ site: inputs.siteAddress, inputs, config })}`,
    forecastDate: now.toISOString(),
    reason,
    modelVersion: "V21.6",
    siteId: site.id || state?.siteContext?.portfolio_site_id || null,
    siteName: site.name || inputs.siteAddress || "Unnamed site",
    siteAddress: site.display_address || inputs.siteAddress || "",
    actualDataCutoff,
    horizonMonths: 12,
    predictedKwh: Number(financial.year1DeliveredEnergy || 0),
    predictedRevenue: Number(financial.year1Revenue || 0),
    predictedOperatingCashFlow: Number(financial.year1AnnualCashFlow || 0),
    longTermNpv: financial.npv == null ? null : Number(financial.npv),
    longTermIrr: financial.irr == null ? null : Number(financial.irr),
    investmentHorizonYears: Number(financial.horizon || inputs.investmentHorizon || 0),
    demandYear1Kwh: Number(demand?.years?.[0]?.annualEnergyDemandedKwh || 0),
    servedDemandPercentage: Number(financial.servedDemandPercentage || 0),
    technicalFeasible: Boolean(results?.yearByYear?.technical?.feasible),
    technicalFailures: results?.yearByYear?.technical?.failures || [],
    assumptionHash: simpleHash(inputs),
    configurationHash: simpleHash(config),
    inputs,
    config
  };
}

export function saveForecastSnapshot(state, results, reason = "manual-save") {
  const snapshot = buildForecastSnapshot(state, results, reason);
  const snapshots = listForecastSnapshots();
  snapshots.push(snapshot);
  const storage = persistForecastSnapshots(snapshots);
  return { ...snapshot, storagePersisted: storage.persisted, storageError: storage.error, storedSnapshotCount: storage.count };
}

export function savePortfolioForecastSnapshots(rows = [], metadata = {}) {
  const now = new Date();
  const existing = listForecastSnapshots();
  const batchId = `${now.toISOString()}-${simpleHash({ reason: metadata.reason || "actual-data-upload", cutoff: metadata.actualDataCutoff || null })}`;
  const snapshots = rows.filter(row => row?.site).map(row => {
    const site = row.site || {};
    const forecast = row.maturityForecast || {};
    const setup = {
      siteId: site.id || null,
      siteName: site.name || "Unnamed site",
      aadt: Number(site.aadt || 0),
      micKva: Number(row.micKva || site.realMicKva || 0),
      configuration: site.modelEquivalentSummary || "",
      actualCapex: Number(row.actualCapex || 0)
    };
    return {
      snapshotId: `${batchId}-${simpleHash(setup)}`,
      batchId,
      forecastType: "operating-site-forward-12m",
      forecastDate: now.toISOString(),
      reason: metadata.reason || "actual-data-upload",
      modelVersion: "V21.6",
      siteId: setup.siteId,
      siteName: setup.siteName,
      siteAddress: site.address || "",
      actualDataCutoff: metadata.actualDataCutoff || site.actual?.asOfDate || site.liveActuals?.asOfDate || null,
      horizonMonths: 12,
      predictedKwh: Number(row.next12mKwh || 0),
      predictedKwhP25: Number(row.next12mKwhLow || 0),
      predictedKwhP75: Number(row.next12mKwhHigh || 0),
      predictedRevenue: Number(row.next12mRevenue || 0),
      predictedRevenueP25: Number(row.next12mRevenueLow || 0),
      predictedRevenueP75: Number(row.next12mRevenueHigh || 0),
      predictedOperatingCashFlow: Number(row.forecastOperatingCashflow || 0),
      predictedOperatingCashFlowP25: Number(row.forecastOperatingCashflowLow || 0),
      predictedOperatingCashFlowP75: Number(row.forecastOperatingCashflowHigh || 0),
      forecastConfidence: forecast?.forward12m?.confidence?.label || forecast?.confidence?.label || null,
      historyMonths: Number(forecast?.forward12m?.historyMonths || forecast?.historyMonths || 0),
      operationalDays: Number(row.operationalDays || 0),
      setupHash: simpleHash(setup),
      setup
    };
  });
  if (!snapshots.length) return { batchId, saved: 0, attempted: 0, persisted: true, snapshots: [], error: null };
  const storage = persistForecastSnapshots([...existing, ...snapshots]);
  return {
    batchId,
    saved: storage.persisted ? snapshots.length : 0,
    attempted: snapshots.length,
    persisted: storage.persisted,
    storedSnapshotCount: storage.count,
    snapshots,
    error: storage.error
  };
}

export function clearForecastSnapshots() {
  try {
    localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
    return true;
  } catch (_) {
    return false;
  }
}

export function exportForecastSnapshotLedger() {
  const payload = {
    schemaVersion: "evhub-forecast-snapshot-v1",
    exportedAt: new Date().toISOString(),
    snapshotCount: forecastSnapshotCount(),
    snapshots: listForecastSnapshots()
  };
  downloadText(`EVHub_Forecast_Snapshot_Ledger_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}
