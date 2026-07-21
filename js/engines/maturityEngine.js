const DAYS_PER_MONTH = 365.25 / 12;
const MIN_FACTOR = 0.18;
const MAX_FACTOR = 1.08;

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function sortedFinite(values) {
  return values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

export function median(values) {
  const vals = sortedFinite(values);
  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

export function quantile(values, q) {
  const vals = sortedFinite(values);
  if (!vals.length) return null;
  const pos = clamp(q, 0, 1) * (vals.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return vals[lo];
  return vals[lo] + (vals[hi] - vals[lo]) * (pos - lo);
}

function mean(values) {
  const vals = sortedFinite(values);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function sum(values) {
  return values.map(Number).filter(Number.isFinite).reduce((acc, value) => acc + value, 0);
}

function robustMadCoefficient(values) {
  const vals = sortedFinite(values).filter(value => value > 0);
  const centre = median(vals);
  if (!(centre > 0) || vals.length < 2) return null;
  const mad = median(vals.map(value => Math.abs(value - centre)));
  return Number.isFinite(mad) ? (mad * 1.4826) / centre : null;
}

function normaliseWeights(weights = {}) {
  const entries = Object.entries(weights).map(([key, value]) => [key, Math.max(0, Number(value) || 0)]);
  const total = entries.reduce((acc, [, value]) => acc + value, 0);
  if (!(total > 0)) return {};
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
}

function weightedValue(values = {}, weights = {}) {
  const usable = Object.entries(weights).filter(([key, weight]) => Number(weight) > 0 && Number.isFinite(Number(values[key])));
  const total = usable.reduce((acc, [, weight]) => acc + Number(weight), 0);
  if (!(total > 0)) return null;
  return usable.reduce((acc, [key, weight]) => acc + Number(values[key]) * Number(weight), 0) / total;
}

function ageBucketFromDays(dataDays) {
  const days = Math.max(0, Number(dataDays || 0));
  if (days < 60) return "under_60";
  if (days < 180) return "60_179";
  if (days < 365) return "180_364";
  return "365_plus";
}

function siteCategoryKey(site) {
  return String(site?.categoryKey || site?.category || "portfolio").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || "portfolio";
}

function monthNumber(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.round(n);
  const text = String(value || "").slice(0, 10);
  const match = text.match(/^\d{4}-(\d{2})/);
  return match ? clamp(Number(match[1]), 1, 12) : 1;
}

function monthIndex(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : fallback;
}

function priorFactor(month, rampYear1 = 0.60, rampYear2 = 0.80) {
  const m = Math.max(1, Number(month || 1));
  // Shape prior only. Empirical mature-site cohorts replace most of its weight
  // as soon as sufficient monthly history is available.
  const target12 = clamp(0.78 + (Number(rampYear1 || 0.60) - 0.60) * 0.35, 0.70, 0.90);
  const target24 = clamp(0.95 + (Number(rampYear2 || 0.80) - 0.80) * 0.20, 0.90, 1.0);
  if (m <= 12) {
    const start = 0.34;
    const t = (m - 1) / 11;
    return start + (target12 - start) * (1 - Math.pow(1 - t, 1.18));
  }
  const t = Math.min(1, (m - 12) / 12);
  return target12 + (target24 - target12) * (1 - Math.pow(1 - t, 1.35));
}

export function isotonicNonDecreasing(values, weights = []) {
  const blocks = values.map((v, i) => ({ start: i, end: i, weight: finitePositive(weights[i]) || 1, value: Number(v) || 0 }));
  let i = 0;
  while (i < blocks.length - 1) {
    if (blocks[i].value <= blocks[i + 1].value + 1e-12) {
      i += 1;
      continue;
    }
    const left = blocks[i];
    const right = blocks[i + 1];
    const weight = left.weight + right.weight;
    const merged = {
      start: left.start,
      end: right.end,
      weight,
      value: (left.value * left.weight + right.value * right.weight) / weight
    };
    blocks.splice(i, 2, merged);
    if (i > 0) i -= 1;
  }
  const out = Array(values.length).fill(0);
  blocks.forEach(block => {
    for (let j = block.start; j <= block.end; j += 1) out[j] = block.value;
  });
  return out;
}

function historyForSite(site) {
  const candidates = [
    site?.actual?.monthlyHistory,
    site?.monthlyHistory,
    site?.liveActuals?.monthlyHistory,
    site?.liveActuals?.diagnostics?.monthlyHistory
  ];
  const raw = candidates.find(candidate => Array.isArray(candidate) && candidate.length) || [];
  return raw.map((row, idx) => {
    const days = finitePositive(row.calendarDays ?? row.daysInScope ?? row.periodDays ?? row.days) || DAYS_PER_MONTH;
    const kwh = Math.max(0, Number(row.kwh ?? row.energyKwh ?? 0) || 0);
    const sessions = Math.max(0, Number(row.sessions ?? 0) || 0);
    const netRevenue = Math.max(0, Number(row.netRevenue ?? row.revenue ?? 0) || 0);
    return {
      monthIndex: monthIndex(row.monthIndex, idx + 1),
      month: String(row.month || row.calendarMonthLabel || row.monthStart || ""),
      calendarMonth: monthNumber(row.calendarMonth ?? row.month ?? row.monthStart),
      calendarDays: days,
      activeDays: Math.max(0, Number(row.activeDays || 0) || 0),
      complete: row.isCompleteCalendarMonth !== false && days >= 24,
      kwh,
      sessions,
      netRevenue,
      dailyKwh: days > 0 ? kwh / days : 0,
      dailySessions: days > 0 ? sessions / days : 0
    };
  }).filter(row => row.monthIndex > 0 && row.calendarDays >= 10);
}

export function dailyHistoryForSite(site) {
  const candidates = [
    site?.actual?.dailyHistory,
    site?.dailyHistory,
    site?.liveActuals?.dailyHistory,
    site?.liveActuals?.diagnostics?.dailyHistory
  ];
  const raw = candidates.find(candidate => Array.isArray(candidate) && candidate.length) || [];
  return raw.map(row => ({
    date: String(row?.date || "").slice(0, 10),
    kwh: Math.max(0, Number(row?.kwh || 0) || 0),
    sessions: Math.max(0, Number(row?.sessions || 0) || 0),
    netRevenue: Math.max(0, Number(row?.netRevenue || row?.revenue || 0) || 0),
    rolling30Kwh: Math.max(0, Number(row?.rolling30Kwh || 0) || 0),
    sourcePresent: row?.sourcePresent !== false,
    reportingChargerCount: Math.max(0, Number(row?.reportingChargerCount || 0) || 0),
    activeChargerCount: Math.max(0, Number(row?.activeChargerCount || 0) || 0)
  })).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date)).sort((a, b) => a.date.localeCompare(b.date));
}

function longestRun(rows, predicate) {
  let longest = 0;
  let current = 0;
  rows.forEach(row => {
    if (predicate(row)) {
      current += 1;
      longest = Math.max(longest, current);
    } else current = 0;
  });
  return longest;
}

function trailingRun(rows, predicate) {
  let count = 0;
  for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
    if (!predicate(rows[idx])) break;
    count += 1;
  }
  return count;
}

function siteDataDiagnostics(site, history = historyForSite(site)) {
  const daily = dailyHistoryForSite(site);
  const sourceRows = daily.filter(row => row.sourcePresent);
  const coverageRatio = daily.length ? sourceRows.length / daily.length : (history.length ? 0.90 : 0);
  const recentDaily = daily.slice(-90);
  const recentCoverageRatio = recentDaily.length ? recentDaily.filter(row => row.sourcePresent).length / recentDaily.length : coverageRatio;
  const positiveRows = sourceRows.filter(row => row.kwh > 0);
  const activeDayRatio = sourceRows.length ? positiveRows.length / sourceRows.length : 0;
  const positiveMedian = median(positiveRows.map(row => row.kwh)) || 0;
  const maxMissingSourceStreak = longestRun(daily, row => !row.sourcePresent);
  const maxZeroStreak = longestRun(daily, row => row.sourcePresent && row.kwh <= 0);
  const recentZeroStreak = trailingRun(daily, row => row.sourcePresent && row.kwh <= 0);
  const completeMonths = history.filter(row => row.complete && row.calendarDays >= 24).length;
  const partialMonths = history.filter(row => !row.complete || row.calendarDays < 24).length;

  const chargerRows = sourceRows.filter(row => row.reportingChargerCount > 0);
  const recentChargerRows = chargerRows.slice(-14);
  const priorChargerRows = chargerRows.slice(Math.max(0, chargerRows.length - 74), Math.max(0, chargerRows.length - 14));
  const recentReportingChargerCount = median(recentChargerRows.map(row => row.reportingChargerCount));
  const priorReportingChargerCount = median(priorChargerRows.map(row => row.reportingChargerCount));
  const chargerCountDelta = Number.isFinite(recentReportingChargerCount) && Number.isFinite(priorReportingChargerCount)
    ? recentReportingChargerCount - priorReportingChargerCount
    : 0;
  const chargerIncreaseDetected = recentChargerRows.length >= 7 && priorChargerRows.length >= 14 && chargerCountDelta >= 0.75;
  const chargerDecreaseDetected = recentChargerRows.length >= 7 && priorChargerRows.length >= 14 && chargerCountDelta <= -0.75;

  const completePositiveMonths = history.filter(row => row.complete && row.calendarDays >= 24 && row.kwh > 0 && row.sessions > 0);
  const latestThree = completePositiveMonths.slice(-3);
  const previousThree = completePositiveMonths.slice(-6, -3);
  const blockSessionEnergy = rows => {
    const sessions = sum(rows.map(row => row.sessions));
    return sessions > 0 ? sum(rows.map(row => row.kwh)) / sessions : null;
  };
  const recentAverageSessionKwh = blockSessionEnergy(latestThree);
  const priorAverageSessionKwh = blockSessionEnergy(previousThree);
  const averageSessionEnergyChange = recentAverageSessionKwh > 0 && priorAverageSessionKwh > 0
    ? recentAverageSessionKwh / priorAverageSessionKwh - 1
    : null;
  const sessionEnergyAnomaly = Number.isFinite(averageSessionEnergyChange) && Math.abs(averageSessionEnergyChange) > 0.40;
  const configurationChangeDetected = chargerIncreaseDetected || chargerDecreaseDetected;
  const disruptionSuspected = maxMissingSourceStreak >= 3
    || recentZeroStreak >= 7
    || chargerDecreaseDetected
    || (maxZeroStreak >= 10 && activeDayRatio >= 0.25 && positiveMedian >= 10);
  const qualityKey = coverageRatio >= 0.97 && recentCoverageRatio >= 0.97 && !disruptionSuspected && !configurationChangeDetected && !sessionEnergyAnomaly
    ? "high"
    : coverageRatio >= 0.90 && recentCoverageRatio >= 0.85 && !disruptionSuspected
      ? "medium"
      : "low";
  return {
    dailyObservationCount: daily.length,
    sourceObservationCount: sourceRows.length,
    coverageRatio,
    recentCoverageRatio,
    activeDayRatio,
    positiveMedianDailyKwh: positiveMedian,
    maxMissingSourceStreak,
    maxZeroStreak,
    recentZeroStreak,
    completeMonths,
    partialMonths,
    disruptionSuspected,
    qualityKey,
    recentReportingChargerCount,
    priorReportingChargerCount,
    chargerCountDelta,
    chargerIncreaseDetected,
    chargerDecreaseDetected,
    configurationChangeDetected,
    recentAverageSessionKwh,
    priorAverageSessionKwh,
    averageSessionEnergyChange,
    sessionEnergyAnomaly
  };
}

function dailyCalendarMonth(date) {
  const match = String(date || "").match(/^\d{4}-(\d{2})/);
  return match ? clamp(Number(match[1]), 1, 12) : 1;
}

function adjustedDailyFromDailyWindow(site, seasonality, requestedWindowDays) {
  const daily = dailyHistoryForSite(site);
  if (!daily.length) return null;
  const windowDays = Math.min(daily.length, Math.max(14, Number(requestedWindowDays || 30)));
  const usable = daily.slice(-windowDays);
  const sourceRows = usable.filter(row => row.sourcePresent);
  const rows = sourceRows.length >= usable.length * 0.85 ? usable : sourceRows;
  if (!rows.length) return null;
  const adjusted = rows.reduce((acc, row) => acc + row.kwh / seasonalityFactor(seasonality, dailyCalendarMonth(row.date)), 0);
  return adjusted / rows.length;
}

function recentAdjustedDailyFromDailyHistory(site, seasonality, dataDays) {
  const windowDays = dataDays >= 180 ? 90 : dataDays >= 60 ? 60 : 30;
  return adjustedDailyFromDailyWindow(site, seasonality, windowDays);
}

function maturityDays(site) {
  const candidates = [
    site?.maturity?.dataDays,
    site?.actual?.dataDays,
    site?.actual?.operationalDays,
    site?.liveActuals?.diagnostics?.daysLive
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const history = historyForSite(site);
  return history.length ? Math.max(...history.map(row => row.monthIndex)) * DAYS_PER_MONTH : 0;
}

function buildSeasonality(trainingSites) {
  const samples = Array.from({ length: 12 }, () => []);
  trainingSites.forEach(site => {
    const history = historyForSite(site).filter(row => row.complete && row.dailyKwh > 0 && row.monthIndex >= 9);
    const baseline = median(history.map(row => row.dailyKwh));
    if (!(baseline > 0)) return;
    history.forEach(row => samples[row.calendarMonth - 1].push(row.dailyKwh / baseline));
  });
  let factors = samples.map(values => values.length >= 2 ? clamp(median(values), 0.78, 1.24) : 1);
  const avg = mean(factors) || 1;
  factors = factors.map(value => value / avg);
  return factors.map((factor, idx) => ({ month: idx + 1, factor, sampleCount: samples[idx].length }));
}

function seasonalityFactor(seasonality, calendarMonth) {
  return Number(seasonality?.[clamp(Math.round(Number(calendarMonth) || 1), 1, 12) - 1]?.factor || 1);
}

function trainingProfile(site, seasonality) {
  const history = historyForSite(site).filter(row => row.dailyKwh > 0 && row.calendarDays >= 14);
  if (history.length < 8) return null;
  const adjusted = history.map(row => ({
    ...row,
    adjustedDailyKwh: row.dailyKwh / seasonalityFactor(seasonality, row.calendarMonth)
  }));
  const late = adjusted.filter(row => row.monthIndex >= Math.max(9, Math.max(...adjusted.map(x => x.monthIndex)) - 5));
  const plateau = median((late.length >= 3 ? late : adjusted.slice(-4)).map(row => row.adjustedDailyKwh));
  if (!(plateau > 0)) return null;
  const latestThree = adjusted.slice(-3).map(row => row.adjustedDailyKwh);
  const previousThree = adjusted.slice(-6, -3).map(row => row.adjustedDailyKwh);
  const recent = median(latestThree);
  const prior = median(previousThree);
  const lateSlope = recent > 0 && prior > 0 ? recent / prior - 1 : null;
  const volatility = robustMadCoefficient(adjusted.slice(-12).map(row => row.adjustedDailyKwh));
  const diagnostics = siteDataDiagnostics(site, history);
  const persistence = stabilityPersistence(adjusted, seasonality, 3);
  const stable = Number.isFinite(lateSlope)
    && Math.abs(lateSlope) <= 0.15
    && (!Number.isFinite(volatility) || volatility <= 0.30)
    && persistence.stableCount >= Math.min(2, persistence.checkCount)
    && diagnostics.coverageRatio >= 0.85
    && !diagnostics.disruptionSuspected
    && !diagnostics.configurationChangeDetected
    && !diagnostics.sessionEnergyAnomaly;
  return {
    site,
    history: adjusted,
    plateau,
    lateSlope,
    volatility,
    diagnostics,
    stabilityPersistence: persistence,
    stable
  };
}

function interpolateMissing(values) {
  const out = [...values];
  for (let i = 0; i < out.length; i += 1) {
    if (Number.isFinite(out[i])) continue;
    let left = i - 1;
    let right = i + 1;
    while (left >= 0 && !Number.isFinite(out[left])) left -= 1;
    while (right < out.length && !Number.isFinite(out[right])) right += 1;
    if (left >= 0 && right < out.length) {
      const t = (i - left) / (right - left);
      out[i] = out[left] + (out[right] - out[left]) * t;
    } else if (left >= 0) out[i] = out[left];
    else if (right < out.length) out[i] = out[right];
  }
  return out;
}

function buildCurvePoints(trainingProfiles, maxMonths, rampYear1, rampYear2) {
  const buckets = Array.from({ length: maxMonths }, () => []);
  trainingProfiles.forEach(profile => {
    profile.history.forEach(row => {
      const idx = row.monthIndex - 1;
      if (idx < 0 || idx >= maxMonths) return;
      buckets[idx].push(clamp(row.adjustedDailyKwh / profile.plateau, MIN_FACTOR, 1.30));
    });
  });
  const sampleCounts = buckets.map(values => values.length);
  const empirical = buckets.map(values => values.length ? median(values) : NaN);
  const empiricalP25 = buckets.map(values => values.length >= 3 ? quantile(values, 0.25) : NaN);
  const empiricalP75 = buckets.map(values => values.length >= 3 ? quantile(values, 0.75) : NaN);
  const priors = buckets.map((_, idx) => priorFactor(idx + 1, rampYear1, rampYear2));
  const rawP50 = empirical.map((value, idx) => {
    if (!Number.isFinite(value)) return priors[idx];
    const weight = Math.min(0.86, sampleCounts[idx] / (sampleCounts[idx] + 1.5));
    return clamp(value * weight + priors[idx] * (1 - weight), MIN_FACTOR, MAX_FACTOR);
  });
  const rawP25 = rawP50.map((value, idx) => Number.isFinite(empiricalP25[idx])
    ? clamp(empiricalP25[idx] * 0.78 + priors[idx] * 0.22, MIN_FACTOR, value)
    : clamp(value - (sampleCounts[idx] >= 2 ? 0.10 : 0.15), MIN_FACTOR, value));
  const rawP75 = rawP50.map((value, idx) => Number.isFinite(empiricalP75[idx])
    ? clamp(empiricalP75[idx] * 0.78 + priors[idx] * 0.22, value, MAX_FACTOR)
    : clamp(value + (sampleCounts[idx] >= 2 ? 0.10 : 0.15), value, MAX_FACTOR));

  let p50 = isotonicNonDecreasing(interpolateMissing(rawP50), sampleCounts.map(n => Math.max(1, n)));
  let p25 = isotonicNonDecreasing(interpolateMissing(rawP25), sampleCounts.map(n => Math.max(1, n)));
  let p75 = isotonicNonDecreasing(interpolateMissing(rawP75), sampleCounts.map(n => Math.max(1, n)));

  // Do not force an abrupt 100% value in the final month. Where empirical
  // evidence ends before the curve horizon, converge smoothly toward the
  // conservative prior end-state. This preserves monotonicity without an
  // artificial month-24 jump.
  let lastObservedIdx = -1;
  sampleCounts.forEach((count, idx) => { if (count >= 2) lastObservedIdx = idx; });
  if (lastObservedIdx >= 0 && lastObservedIdx < maxMonths - 1) {
    const startValue = p50[lastObservedIdx];
    const target = clamp(Math.max(startValue, priors[maxMonths - 1]), startValue, 1.0);
    const remaining = maxMonths - 1 - lastObservedIdx;
    for (let idx = lastObservedIdx + 1; idx < maxMonths; idx += 1) {
      const t = (idx - lastObservedIdx) / remaining;
      const eased = 1 - Math.pow(1 - t, 1.35);
      p50[idx] = startValue + (target - startValue) * eased;
    }
  }
  p50 = isotonicNonDecreasing(p50, sampleCounts.map(n => Math.max(1, n))).map(v => clamp(v, MIN_FACTOR, 1.02));
  p25 = p25.map((v, idx) => clamp(v, MIN_FACTOR, p50[idx]));
  p75 = p75.map((v, idx) => clamp(v, p50[idx], 1.12));
  return p50.map((value, idx) => ({
    month: idx + 1,
    p25: p25[idx],
    p50: value,
    p75: p75[idx],
    sampleCount: sampleCounts[idx],
    empiricalMedian: Number.isFinite(empirical[idx]) ? empirical[idx] : null
  }));
}

export function curveFactor(model, ageMonth, band = "p50") {
  const points = model?.curve || [];
  if (!points.length) return priorFactor(ageMonth);
  const age = Math.max(1, Number(ageMonth || 1));
  if (age <= 1) return Number(points[0]?.[band] || points[0]?.p50 || priorFactor(1));
  if (age >= points.length) return Number(points[points.length - 1]?.[band] || points[points.length - 1]?.p50 || 1);
  const low = Math.floor(age);
  const high = Math.ceil(age);
  const lowPoint = points[low - 1];
  const highPoint = points[high - 1];
  if (low === high) return Number(lowPoint?.[band] || lowPoint?.p50 || 1);
  const t = age - low;
  const a = Number(lowPoint?.[band] || lowPoint?.p50 || 1);
  const b = Number(highPoint?.[band] || highPoint?.p50 || a);
  return a + (b - a) * t;
}

const FORECAST_METHOD_KEYS = ["annualBasis", "recent30", "recent90", "seasonalNaive", "controlledTrend", "maturityRamp"];

function baseForecastMethodWeights(dataDays, historyLength = 0) {
  const bucket = ageBucketFromDays(dataDays);
  const weights = bucket === "under_60"
    ? { annualBasis: 0.10, recent30: 0.35, recent90: 0.15, seasonalNaive: 0.00, controlledTrend: 0.10, maturityRamp: 0.30 }
    : bucket === "60_179"
      ? { annualBasis: 0.15, recent30: 0.25, recent90: 0.20, seasonalNaive: 0.05, controlledTrend: 0.15, maturityRamp: 0.20 }
      : bucket === "180_364"
        ? { annualBasis: 0.20, recent30: 0.15, recent90: 0.25, seasonalNaive: 0.10, controlledTrend: 0.20, maturityRamp: 0.10 }
        : { annualBasis: 0.30, recent30: 0.10, recent90: 0.20, seasonalNaive: 0.25, controlledTrend: 0.15, maturityRamp: 0.00 };
  if (historyLength < 12) weights.seasonalNaive = 0;
  if (dataDays >= 365) weights.maturityRamp = 0;
  return normaliseWeights(weights);
}

function sameCalendarMonthAdjustedDaily(history, calendarMonth, seasonality) {
  const rows = history.filter(row => row.complete && row.dailyKwh > 0 && row.calendarMonth === calendarMonth);
  if (!rows.length) return null;
  const latest = rows[rows.length - 1];
  return latest.dailyKwh / seasonalityFactor(seasonality, calendarMonth);
}

function validationCandidateTotals(history, originIndex, horizon, model) {
  const prior = history.slice(0, originIndex);
  const future = history.slice(originIndex, originIndex + horizon);
  if (prior.length < 3 || future.length < horizon) return null;
  const dataDays = sum(prior.map(row => row.calendarDays));
  const adjusted = prior.map(row => ({ ...row, adjustedDailyKwh: row.dailyKwh / seasonalityFactor(model.seasonality, row.calendarMonth) }));
  const annualRows = adjusted.slice(-12);
  const annualDays = sum(annualRows.map(row => row.calendarDays));
  const annualAdjusted = annualDays > 0
    ? annualRows.reduce((acc, row) => acc + row.adjustedDailyKwh * row.calendarDays, 0) / annualDays
    : null;
  const recent30 = adjusted.length ? adjusted[adjusted.length - 1].adjustedDailyKwh : annualAdjusted;
  const recent90 = median(adjusted.slice(-3).map(row => row.adjustedDailyKwh)) || recent30 || annualAdjusted;
  const trend = recentTrendInfo(prior, model.seasonality);
  const trendPolicy = forwardTrendPolicy(dataDays, trend.sampleMonths, trend.monthlyGrowth, trend.eligible);
  const base = forwardBaseAdjustedDaily({ dataDays, annualDaily: annualAdjusted, recentAdjusted: recent90 }).value;
  const ageMonths = Math.max(1, Number(prior[prior.length - 1]?.monthIndex || prior.length));
  const currentFactor = Math.max(0.25, curveFactor(model, ageMonths, "p50"));
  const plateau = recent90 > 0 ? recent90 / currentFactor : annualAdjusted;
  const totals = Object.fromEntries(FORECAST_METHOD_KEYS.map(key => [key, 0]));
  let trendFactor = 1;
  future.forEach((row, idx) => {
    const offset = idx + 1;
    if (offset <= 6) {
      const decay = 1 - (offset - 1) / 6;
      trendFactor *= 1 + trendPolicy.monthlyGrowth * decay;
    }
    const seasonal = seasonalityFactor(model.seasonality, row.calendarMonth);
    const traffic = Math.pow(1.01, offset / 12);
    const seasonalNaiveAdjusted = sameCalendarMonthAdjustedDaily(prior, row.calendarMonth, model.seasonality);
    const candidateAdjusted = {
      annualBasis: annualAdjusted,
      recent30,
      recent90,
      seasonalNaive: seasonalNaiveAdjusted || recent90 || annualAdjusted,
      controlledTrend: base > 0 ? base * trendFactor : recent90,
      maturityRamp: plateau > 0 ? plateau * curveFactor(model, ageMonths + offset, "p50") : recent90
    };
    FORECAST_METHOD_KEYS.forEach(key => {
      const daily = Math.max(0, Number(candidateAdjusted[key] || 0));
      totals[key] += daily * seasonal * row.calendarDays * traffic;
    });
  });
  const actual = sum(future.map(row => row.kwh));
  return { actual, predictions: totals, dataDays, ageBucket: ageBucketFromDays(dataDays) };
}

function summariseValidationRecords(records, predictionAccessor) {
  const usable = records.map(record => ({ record, predicted: Number(predictionAccessor(record)), actual: Number(record.actual) }))
    .filter(item => item.predicted > 0 && item.actual > 0);
  if (!usable.length) return { sampleCount: 0, wape: null, bias: null, medianAbsolutePercentageError: null, p80AbsolutePercentageError: null, actualErrorP10: null, actualErrorP90: null };
  const absolute = usable.map(item => Math.abs(item.predicted / item.actual - 1));
  const actualErrors = usable.map(item => item.actual / item.predicted - 1);
  const totalActual = sum(usable.map(item => item.actual));
  const totalPredicted = sum(usable.map(item => item.predicted));
  return {
    sampleCount: usable.length,
    wape: totalActual > 0 ? sum(usable.map(item => Math.abs(item.predicted - item.actual))) / totalActual : null,
    bias: totalActual > 0 ? (totalPredicted - totalActual) / totalActual : null,
    medianAbsolutePercentageError: median(absolute),
    p80AbsolutePercentageError: quantile(absolute, 0.80),
    actualErrorP10: quantile(actualErrors, 0.10),
    actualErrorP90: quantile(actualErrors, 0.90)
  };
}

function projectToSimplex(values) {
  const sorted = [...values].sort((a, b) => b - a);
  let cumulative = 0;
  let rho = -1;
  for (let idx = 0; idx < sorted.length; idx += 1) {
    cumulative += sorted[idx];
    const theta = (cumulative - 1) / (idx + 1);
    if (sorted[idx] - theta > 0) rho = idx;
  }
  if (rho < 0) return values.map(() => 1 / Math.max(1, values.length));
  const theta = (sorted.slice(0, rho + 1).reduce((a, b) => a + b, 0) - 1) / (rho + 1);
  return values.map(value => Math.max(0, value - theta));
}

function optimiseWeightsForRecords(records, baseWeights) {
  const activeKeys = FORECAST_METHOD_KEYS.filter(key => Number(baseWeights[key] || 0) > 0 && records.some(record => Number(record.predictions?.[key]) > 0));
  if (!activeKeys.length) return normaliseWeights(baseWeights);
  const base = normaliseWeights(Object.fromEntries(activeKeys.map(key => [key, baseWeights[key] || 0])));
  let vector = activeKeys.map(key => Number(base[key] || 0));
  if (records.length < 4) return normaliseWeights(Object.fromEntries(activeKeys.map((key, idx) => [key, vector[idx]])));
  const regularisation = records.length < 10 ? 0.18 : records.length < 25 ? 0.10 : 0.05;
  const delta = 0.20;
  for (let iteration = 0; iteration < 260; iteration += 1) {
    const gradient = activeKeys.map((key, idx) => 2 * regularisation * (vector[idx] - Number(base[key] || 0)));
    let usable = 0;
    records.forEach(record => {
      const actual = Number(record.actual || 0);
      if (!(actual > 0)) return;
      const ratios = activeKeys.map(key => Number(record.predictions?.[key] || 0) / actual);
      if (!ratios.some(Number.isFinite)) return;
      const predictedRatio = ratios.reduce((acc, ratio, idx) => acc + (Number.isFinite(ratio) ? ratio * vector[idx] : 0), 0);
      const residual = predictedRatio - 1;
      const derivative = Math.abs(residual) <= delta ? residual / delta : Math.sign(residual);
      ratios.forEach((ratio, idx) => { if (Number.isFinite(ratio)) gradient[idx] += derivative * ratio; });
      usable += 1;
    });
    if (!usable) break;
    const learningRate = 0.12 / Math.sqrt(iteration + 1);
    vector = projectToSimplex(vector.map((value, idx) => value - learningRate * gradient[idx] / usable));
  }
  return normaliseWeights(Object.fromEntries(activeKeys.map((key, idx) => [key, vector[idx]])));
}

function candidateWeightSets(records, baseWeights) {
  const candidates = [normaliseWeights(baseWeights), optimiseWeightsForRecords(records, baseWeights)];
  const active = FORECAST_METHOD_KEYS.filter(key => Number(baseWeights[key] || 0) > 0 && records.some(record => Number(record.predictions?.[key]) > 0));
  active.forEach(key => candidates.push({ [key]: 1 }));
  for (let a = 0; a < active.length; a += 1) {
    for (let b = a + 1; b < active.length; b += 1) {
      [0.25, 0.50, 0.75].forEach(weightA => candidates.push({ [active[a]]: weightA, [active[b]]: 1 - weightA }));
    }
  }
  return candidates;
}

function chooseWeightsForRecords(records, baseWeights) {
  const base = normaliseWeights(baseWeights);
  if (records.length < 4) return base;
  let best = { weights: base, objective: Number.POSITIVE_INFINITY };
  candidateWeightSets(records, base).forEach(raw => {
    const weights = normaliseWeights(raw);
    const stats = summariseValidationRecords(records, record => weightedValue(record.predictions, weights));
    if (!(stats.sampleCount > 0) || !Number.isFinite(stats.wape)) return;
    const distance = FORECAST_METHOD_KEYS.reduce((acc, key) => acc + Math.abs(Number(weights[key] || 0) - Number(base[key] || 0)), 0);
    const sampleShrink = Math.min(1, stats.sampleCount / 25);
    const regularisation = (1 - sampleShrink) * 0.025 * distance;
    const biasPenalty = Number.isFinite(stats.bias) ? Math.abs(stats.bias) * 0.08 : 0;
    const objective = stats.wape + regularisation + biasPenalty;
    if (objective < best.objective) best = { weights, objective };
  });
  return best.weights;
}

function validationProfile(records, baseWeights) {
  const uniqueSites = [...new Set(records.map(record => record.siteName))];
  const finalWeights = chooseWeightsForRecords(records, baseWeights);
  const outOfSample = records.map(record => ({ ...record }));
  const weightCache = new Map();
  uniqueSites.forEach(siteName => {
    const training = records.filter(record => record.siteName !== siteName);
    const weights = training.length >= 4 ? chooseWeightsForRecords(training, baseWeights) : normaliseWeights(baseWeights);
    weightCache.set(siteName, weights);
  });
  outOfSample.forEach(record => {
    const weights = weightCache.get(record.siteName) || normaliseWeights(baseWeights);
    record.ensemblePrediction = weightedValue(record.predictions, weights);
  });
  const ensemble = summariseValidationRecords(outOfSample, record => record.ensemblePrediction);
  const methods = Object.fromEntries(FORECAST_METHOD_KEYS.map(key => [key, summariseValidationRecords(records, record => record.predictions[key])]));
  const shrink = ensemble.sampleCount / (ensemble.sampleCount + 12);
  const effectiveBias = Number.isFinite(ensemble.bias) ? ensemble.bias * shrink : 0;
  const biasCorrection = clamp(1 / Math.max(0.70, 1 + effectiveBias), 0.88, 1.20);
  return {
    sampleCount: ensemble.sampleCount,
    uniqueSiteCount: uniqueSites.length,
    weights: finalWeights,
    ensemble,
    methods,
    biasCorrection,
    validationMode: "rolling-origin, time-truncated, leave-one-site-out"
  };
}

function validationMonthKey(row) {
  const text = String(row?.month || row?.monthStart || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

function truncateSiteForValidation(site, cutoffKey) {
  const monthlyHistory = historyForSite(site).filter(row => {
    const key = validationMonthKey(row);
    return key && key <= cutoffKey;
  });
  const dailyHistory = dailyHistoryForSite(site).filter(row => row.date.slice(0, 7) <= cutoffKey);
  const dataDays = dailyHistory.length || Math.round(sum(monthlyHistory.map(row => row.calendarDays)));
  return {
    ...site,
    maturity: { ...(site?.maturity || {}), dataDays },
    actual: {
      ...(site?.actual || {}),
      monthlyHistory,
      dailyHistory,
      dataDays,
      operationalDays: dataDays,
      asOfDate: dailyHistory.at(-1)?.date || `${cutoffKey}-28`
    }
  };
}

function buildForecastValidation(sites, model) {
  const horizons = [3, 6, 12];
  const output = { generatedFromSiteCount: 0, horizons: {}, methodology: "Rolling-origin forecasts use only data available by each historical origin. Method performance and confidence are evaluated leave-one-site-out." };
  const sourceSites = sites || [];
  const modelCache = new Map();
  const modelForCutoff = cutoffKey => {
    if (!modelCache.has(cutoffKey)) {
      const truncated = sourceSites.map(site => truncateSiteForValidation(site, cutoffKey)).filter(site => historyForSite(site).length >= 1);
      modelCache.set(cutoffKey, buildMaturityModel(truncated, { maxMonths: model?.curve?.length || 24, includeBacktest: false }));
    }
    return modelCache.get(cutoffKey);
  };
  const siteRecords = [];
  sourceSites.forEach(site => {
    const history = historyForSite(site).filter(row => row.complete && row.dailyKwh >= 0 && row.calendarDays >= 24 && validationMonthKey(row));
    if (history.length < 6) return;
    output.generatedFromSiteCount += 1;
    horizons.forEach(horizon => {
      const possible = [];
      for (let origin = 3; origin + horizon <= history.length; origin += 1) possible.push(origin);
      possible.slice(-8).forEach(origin => {
        const cutoffKey = validationMonthKey(history[origin - 1]);
        if (!cutoffKey) return;
        const retrospectiveModel = modelForCutoff(cutoffKey);
        const calculated = validationCandidateTotals(history, origin, horizon, retrospectiveModel);
        if (!(calculated?.actual > 0)) return;
        siteRecords.push({
          ...calculated,
          horizon,
          cutoffKey,
          siteName: site?.name || site?.siteName || "Site",
          categoryKey: siteCategoryKey(site),
          modelSourceAtOrigin: retrospectiveModel.source
        });
      });
    });
  });
  horizons.forEach(horizon => {
    const records = siteRecords.filter(record => record.horizon === horizon);
    const byAge = {};
    ["under_60", "60_179", "180_364", "365_plus"].forEach(bucket => {
      const subset = records.filter(record => record.ageBucket === bucket);
      byAge[bucket] = validationProfile(subset, baseForecastMethodWeights(bucket === "under_60" ? 30 : bucket === "60_179" ? 120 : bucket === "180_364" ? 270 : 500, 12));
    });
    const categories = [...new Set(records.map(record => record.categoryKey))];
    const byCategory = {};
    categories.forEach(category => {
      const subset = records.filter(record => record.categoryKey === category);
      const uniqueSites = new Set(subset.map(record => record.siteName)).size;
      if (subset.length >= 8 && uniqueSites >= 3) {
        const representativeDays = median(subset.map(record => record.dataDays)) || 365;
        byCategory[category] = validationProfile(subset, baseForecastMethodWeights(representativeDays, 12));
      }
    });
    const representativeDays = median(records.map(record => record.dataDays)) || 365;
    output.horizons[horizon] = {
      global: validationProfile(records, baseForecastMethodWeights(representativeDays, 12)),
      byAge,
      byCategory,
      recordCount: records.length,
      originModelCount: new Set(records.map(record => record.cutoffKey)).size
    };
  });
  output.originModelCount = modelCache.size;
  return output;
}

function validationEvidenceForSite(model, site, dataDays) {
  const validation = model?.forecastValidation || {};
  const bucket = ageBucketFromDays(dataDays);
  const category = siteCategoryKey(site);
  const preferredHorizons = [12, 6, 3];
  let selected = null;
  let selectedHorizon = null;
  for (const horizon of preferredHorizons) {
    const horizonData = validation?.horizons?.[horizon];
    const age = horizonData?.byAge?.[bucket];
    if (age?.sampleCount >= 6 && age?.uniqueSiteCount >= 3) { selected = age; selectedHorizon = horizon; break; }
    const categoryData = horizonData?.byCategory?.[category];
    if (categoryData?.sampleCount >= 8 && categoryData?.uniqueSiteCount >= 3) { selected = categoryData; selectedHorizon = horizon; break; }
    if (horizonData?.global?.sampleCount >= 8 && horizonData?.global?.uniqueSiteCount >= 3) { selected = horizonData.global; selectedHorizon = horizon; break; }
  }
  return { profile: selected, horizon: selectedHorizon, bucket, category };
}

function backtest(trainingSites, options, fullModel) {
  const cutoffs = [3, 6, 9];
  const errors = Object.fromEntries(cutoffs.map(c => [c, []]));
  trainingSites.forEach(site => {
    const others = trainingSites.filter(candidate => candidate !== site);
    const model = others.length >= 2
      ? buildMaturityModel(others, { ...options, includeBacktest: false })
      : fullModel;
    const profile = trainingProfile(site, model.seasonality);
    if (!profile) return;
    cutoffs.forEach(cutoff => {
      const early = profile.history.filter(row => row.monthIndex <= cutoff).slice(-2);
      const observed = median(early.map(row => row.adjustedDailyKwh));
      const factor = curveFactor(model, cutoff, "p50");
      if (!(observed > 0) || !(factor > 0) || !(profile.plateau > 0)) return;
      const predicted = observed / factor;
      errors[cutoff].push(Math.abs(predicted / profile.plateau - 1));
    });
  });
  const summary = {};
  cutoffs.forEach(cutoff => {
    summary[cutoff] = {
      sampleCount: errors[cutoff].length,
      medianAbsoluteError: median(errors[cutoff]),
      p75AbsoluteError: quantile(errors[cutoff], 0.75)
    };
  });
  return summary;
}

export function buildMaturityModel(sites = [], options = {}) {
  const maxMonths = Math.max(18, Math.min(36, Math.round(Number(options.maxMonths || 24))));
  const rampYear1 = Number(options.rampYear1 ?? 0.60);
  const rampYear2 = Number(options.rampYear2 ?? 0.80);
  const eligibleSites = sites.filter(site => maturityDays(site) >= 365 && historyForSite(site).length >= 10);
  const seasonality = buildSeasonality(eligibleSites);
  const eligibleProfiles = eligibleSites.map(site => trainingProfile(site, seasonality)).filter(Boolean);
  const stableProfiles = eligibleProfiles.filter(profile => profile.stable);
  // Prefer sites that have reached a demonstrably stable late-stage plateau. When
  // fewer than three are available, retain the wider 365+ day cohort but shrink it
  // strongly toward the conservative prior rather than pretending precision.
  const curveProfiles = stableProfiles.length >= 3 ? stableProfiles : eligibleProfiles;
  const curve = buildCurvePoints(curveProfiles, maxMonths, rampYear1, rampYear2);
  const empiricalMonths = curve.filter(point => point.sampleCount >= 2).length;
  const source = curveProfiles.length >= 3 && empiricalMonths >= 6 ? "empirical" : "prior";
  const curveSites = curveProfiles.map(profile => profile.site);
  const finalCurveFactor = Number(curve[curve.length - 1]?.p50 || 0.95);
  const model = {
    version: "prediction-engine-21.6",
    source,
    curve,
    seasonality,
    maturityThreshold: Math.min(0.95, Math.max(0.90, finalCurveFactor * 0.99)),
    eligibleTrainingSiteCount: eligibleProfiles.length,
    trainingSiteCount: curveProfiles.length,
    stableSiteCount: stableProfiles.length,
    empiricalMonths,
    maxObservedMonth: curveProfiles.length ? Math.max(...curveProfiles.flatMap(profile => profile.history.map(row => row.monthIndex))) : 0,
    trainingSiteNames: curveProfiles.map(profile => profile.site?.name || profile.site?.siteName || "Site"),
    methodology: source === "empirical"
      ? `${stableProfiles.length >= 3 ? "Stable " : ""}seasonality-adjusted, site-normalised mature-cohort median with monotonic smoothing, robust-volatility screening and conservative prior shrinkage.`
      : eligibleProfiles.length
        ? "Conservative portfolio ramp prior blended with limited 365+ day cohort evidence; more stable mature histories are required for empirical status."
        : "Conservative portfolio ramp prior; upload charger-level daily history to activate mature-cohort learning."
  };
  model.backtest = options.includeBacktest === false ? {} : backtest(curveSites, { maxMonths, rampYear1, rampYear2 }, model);
  model.forecastValidation = options.includeBacktest === false ? { generatedFromSiteCount: 0, horizons: {} } : buildForecastValidation(sites, model);
  return model;
}

function currentDateParts(value) {
  const text = String(value || "").slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

function futureCalendarMonth(startMonth, offset) {
  return ((Number(startMonth || 1) - 1 + offset) % 12 + 12) % 12 + 1;
}

function actualCredibilityWeight(dataDays, historyLength) {
  const days = Math.max(0, Number(dataDays || 0));
  let weight;
  if (days < 60) weight = 0.20;
  else if (days < 180) weight = 0.20 + (days - 60) / 120 * 0.35;
  else if (days < 365) weight = 0.55 + (days - 180) / 185 * 0.25;
  else weight = 0.90;
  if (historyLength >= 6) weight += 0.05;
  else if (!historyLength) weight -= 0.15;
  return clamp(weight, 0.10, 0.95);
}

function forecastConfidence(model, dataDays, historyLength, backtestError, lateRamp = false) {
  if (!lateRamp && model?.source === "empirical" && dataDays >= 365 && historyLength >= 10 && (!Number.isFinite(backtestError) || backtestError <= 0.25)) {
    return { key: "high", label: "High", uncertainty: 0.10 };
  }
  if (model?.source === "empirical" && dataDays >= 90 && historyLength >= 3) {
    return { key: "medium", label: "Medium", uncertainty: lateRamp ? 0.22 : 0.18 };
  }
  if (dataDays >= 90) return { key: "medium-low", label: "Medium-low", uncertainty: lateRamp ? 0.28 : 0.24 };
  return { key: "low", label: "Low", uncertainty: 0.32 };
}

function recentAdjustedDaily(history, seasonality) {
  const usable = history.filter(row => row.dailyKwh > 0 && row.calendarDays >= 14).slice(-3);
  return median(usable.map(row => row.dailyKwh / seasonalityFactor(seasonality, row.calendarMonth)));
}

function recentTrendInfo(history, seasonality) {
  const usable = history.filter(row => row.complete && row.dailyKwh > 0 && row.calendarDays >= 24).map(row => ({
    ...row,
    adjustedDailyKwh: row.dailyKwh / seasonalityFactor(seasonality, row.calendarMonth)
  }));
  const recent = median(usable.slice(-3).map(row => row.adjustedDailyKwh));
  const previous = median(usable.slice(-6, -3).map(row => row.adjustedDailyKwh));
  const blockChange = recent > 0 && previous > 0 ? recent / previous - 1 : null;
  const monthlyGrowth = Number.isFinite(blockChange) && blockChange > -1 ? Math.pow(1 + blockChange, 1 / 3) - 1 : null;
  return { recent, previous, blockChange, monthlyGrowth, sampleMonths: usable.length, eligible: usable.length >= 6 };
}

function stabilityPersistence(history, seasonality, maxChecks = 3) {
  const usable = (history || []).filter(row => row.complete && row.dailyKwh > 0 && row.calendarDays >= 24).map(row => ({
    ...row,
    adjustedDailyKwh: Number(row.adjustedDailyKwh || (row.dailyKwh / seasonalityFactor(seasonality, row.calendarMonth)))
  }));
  const checks = [];
  for (let end = usable.length; end >= 6 && checks.length < maxChecks; end -= 1) {
    const slice = usable.slice(0, end);
    const recent = median(slice.slice(-3).map(row => row.adjustedDailyKwh));
    const previous = median(slice.slice(-6, -3).map(row => row.adjustedDailyKwh));
    const blockChange = recent > 0 && previous > 0 ? recent / previous - 1 : null;
    const volatility = robustMadCoefficient(slice.slice(-12).map(row => row.adjustedDailyKwh));
    const stable = Number.isFinite(blockChange)
      && Math.abs(blockChange) <= 0.15
      && (!Number.isFinite(volatility) || volatility <= 0.30);
    checks.push({ blockChange, volatility, stable });
  }
  return {
    checkCount: checks.length,
    stableCount: checks.filter(check => check.stable).length,
    consecutiveStableCount: checks.findIndex(check => !check.stable) === -1 ? checks.length : checks.findIndex(check => !check.stable),
    checks
  };
}

function repeatabilityScore({ dataDays, completeMonths, coverageRatio, blockChange, volatility, stabilityStableCount = 0, stabilityCheckCount = 0, disruptionSuspected, configurationChangeDetected, sessionEnergyAnomaly, capacityConstrained }) {
  const historyScore = Math.min(1, Math.max(0, Number(dataDays || 0) / 365)) * 23;
  const monthScore = Math.min(1, Math.max(0, Number(completeMonths || 0) / 10)) * 14;
  const coverageScore = clamp(Number(coverageRatio || 0), 0, 1) * 18;
  const stabilityScore = Number.isFinite(blockChange)
    ? (1 - Math.min(1, Math.abs(blockChange) / 0.30)) * 18
    : Math.min(9, monthScore * 0.67);
  const volatilityScore = Number.isFinite(volatility)
    ? (1 - Math.min(1, volatility / 0.45)) * 13
    : Math.min(6.5, monthScore * 0.50);
  const persistenceRatio = stabilityCheckCount > 0 ? stabilityStableCount / stabilityCheckCount : 0;
  const persistenceScore = persistenceRatio * 9;
  const qualityScore = disruptionSuspected ? 0 : 5;
  const capacityPenalty = capacityConstrained ? 8 : 0;
  const configurationPenalty = configurationChangeDetected ? 5 : 0;
  const sessionEnergyPenalty = sessionEnergyAnomaly ? 4 : 0;
  return Math.round(clamp(historyScore + monthScore + coverageScore + stabilityScore + volatilityScore + persistenceScore + qualityScore - capacityPenalty - configurationPenalty - sessionEnergyPenalty, 0, 100));
}

export function classifySiteRepeatability(params = {}) {
  const site = params.site || {};
  const model = params.model || buildMaturityModel([], { includeBacktest: false });
  const history = historyForSite(site);
  const dataDays = Math.max(0, Number(params.dataDays ?? maturityDays(site) ?? 0));
  const diagnostics = siteDataDiagnostics(site, history);
  const trend = recentTrendInfo(history, model.seasonality);
  const adjustedValues = history
    .filter(row => row.complete && row.dailyKwh > 0 && row.calendarDays >= 24)
    .slice(-12)
    .map(row => row.dailyKwh / seasonalityFactor(model.seasonality, row.calendarMonth));
  const volatility = robustMadCoefficient(adjustedValues);
  const persistence = stabilityPersistence(history, model.seasonality, 3);
  const technicalCapacityRatio = Number(params.technicalCapacityRatio);
  const technicalCapacityAnnualKwh = finitePositive(params.technicalCapacityAnnualKwh);
  const capacityConstrained = params.capacityConstrained === true || (Number.isFinite(technicalCapacityRatio) && technicalCapacityRatio < 0.98);
  const blockChange = trend.blockChange;
  const stableTrend = Number.isFinite(blockChange) && Math.abs(blockChange) <= 0.15;
  const stableVolatility = !Number.isFinite(volatility) || volatility <= 0.30;
  const persistentStability = persistence.stableCount >= Math.min(2, persistence.checkCount) && persistence.checkCount >= 2;
  const completeMonths = diagnostics.completeMonths;
  let key = "early_evidence";

  if (capacityConstrained && dataDays >= 90) key = "capacity_constrained";
  else if (dataDays < 60 || completeMonths < 2) key = "early_evidence";
  else if (diagnostics.disruptionSuspected || (Number.isFinite(blockChange) && blockChange < -0.15)) key = "declining_disrupted";
  else if (Number.isFinite(blockChange) && blockChange > 0.15) key = dataDays >= 365 ? "late_ramping" : "ramping";
  else if (dataDays < 180) key = "ramping";
  else if (dataDays < 365) key = stableTrend && stableVolatility && persistentStability && completeMonths >= 6 && !diagnostics.configurationChangeDetected ? "stabilising" : "ramping";
  else if (completeMonths >= 10 && stableTrend && stableVolatility && persistentStability && diagnostics.coverageRatio >= 0.90 && !diagnostics.configurationChangeDetected && !diagnostics.sessionEnergyAnomaly) key = "repeatable";
  else key = "stabilising";

  const definitions = {
    early_evidence: { label: "Early evidence", shortLabel: "Early", cls: "neutral", description: "Limited operating history means the run-rate is directional and not yet repeatable." },
    ramping: { label: "Ramping", shortLabel: "Ramping", cls: "warn", description: "Demand is still developing materially, so recent growth should not be treated as a stable plateau." },
    stabilising: { label: "Stabilising", shortLabel: "Stabilising", cls: "warn", description: "The site is approaching a repeatable run-rate, but history, volatility, repeated stability checks or configuration consistency are not yet sufficient for mature classification." },
    repeatable: { label: "Repeatable / mature", shortLabel: "Repeatable", cls: "good", description: "At least one seasonal year is available and recent seasonally adjusted performance has remained sufficiently stable across repeated assessments." },
    late_ramping: { label: "Late-ramping", shortLabel: "Late ramp", cls: "warn", description: "The site has more than one year of history but recent seasonally adjusted demand is still increasing materially." },
    declining_disrupted: { label: "Declining / disrupted", shortLabel: "Declining", cls: "bad", description: "Recent performance has fallen materially or the daily history contains a possible operational, charger-reporting or data disruption that should be reviewed." },
    capacity_constrained: { label: "Capacity-constrained", shortLabel: "Constrained", cls: "bad", description: "Commercial demand may be limited by MIC, charger output, plug count or another installed-capacity constraint." }
  };
  const definition = definitions[key];
  const score = repeatabilityScore({
    dataDays,
    completeMonths,
    coverageRatio: diagnostics.coverageRatio,
    blockChange,
    volatility,
    stabilityStableCount: persistence.stableCount,
    stabilityCheckCount: persistence.checkCount,
    disruptionSuspected: diagnostics.disruptionSuspected,
    configurationChangeDetected: diagnostics.configurationChangeDetected,
    sessionEnergyAnomaly: diagnostics.sessionEnergyAnomaly,
    capacityConstrained
  });
  const confidence = score >= 80 ? "High" : score >= 60 ? "Medium" : score >= 40 ? "Medium-low" : "Low";
  const maturityFactor = curveFactor(model, Math.max(1, dataDays / DAYS_PER_MONTH), "p50");
  const evidence = [
    `${Math.round(dataDays)} operating days`,
    `${completeMonths} complete monthly observations`,
    `data coverage ${Math.round(diagnostics.coverageRatio * 100)}%`,
    Number.isFinite(blockChange) ? `latest 3m vs prior 3m ${blockChange >= 0 ? "+" : ""}${(blockChange * 100).toFixed(1)}%` : "recent trend not yet testable",
    Number.isFinite(volatility) ? `robust volatility ${(volatility * 100).toFixed(1)}%` : "volatility not yet testable",
    persistence.checkCount ? `${persistence.stableCount}/${persistence.checkCount} recent stability checks passed` : "repeated stability not yet testable"
  ];
  if (diagnostics.chargerIncreaseDetected) evidence.push(`reporting charger count increased from ${Number(diagnostics.priorReportingChargerCount || 0).toFixed(0)} to ${Number(diagnostics.recentReportingChargerCount || 0).toFixed(0)}`);
  if (diagnostics.chargerDecreaseDetected) evidence.push(`possible charger disappearance: reporting count ${Number(diagnostics.priorReportingChargerCount || 0).toFixed(0)} → ${Number(diagnostics.recentReportingChargerCount || 0).toFixed(0)}`);
  if (diagnostics.sessionEnergyAnomaly) evidence.push(`average session energy changed ${diagnostics.averageSessionEnergyChange >= 0 ? "+" : ""}${(diagnostics.averageSessionEnergyChange * 100).toFixed(1)}%`);
  if (diagnostics.disruptionSuspected) evidence.push("possible disruption detected");
  if (capacityConstrained) evidence.push(`technical coverage ${Number.isFinite(technicalCapacityRatio) ? (technicalCapacityRatio * 100).toFixed(1) + "%" : "below demand"}`);
  return {
    key,
    label: definition.label,
    shortLabel: definition.shortLabel,
    cls: definition.cls,
    description: definition.description,
    score,
    confidence,
    dataDays,
    historyMonths: history.length,
    completeMonths,
    coverageRatio: diagnostics.coverageRatio,
    recentCoverageRatio: diagnostics.recentCoverageRatio,
    volatility,
    trend,
    stableTrend,
    stableVolatility,
    stabilityPersistence: persistence,
    disruptionSuspected: diagnostics.disruptionSuspected,
    configurationChangeDetected: diagnostics.configurationChangeDetected,
    chargerIncreaseDetected: diagnostics.chargerIncreaseDetected,
    chargerDecreaseDetected: diagnostics.chargerDecreaseDetected,
    sessionEnergyAnomaly: diagnostics.sessionEnergyAnomaly,
    averageSessionEnergyChange: diagnostics.averageSessionEnergyChange,
    maxZeroStreak: diagnostics.maxZeroStreak,
    maxMissingSourceStreak: diagnostics.maxMissingSourceStreak,
    capacityConstrained,
    technicalCapacityRatio: Number.isFinite(technicalCapacityRatio) ? technicalCapacityRatio : null,
    technicalCapacityAnnualKwh,
    maturityFactor,
    evidence
  };
}


function impliedCurveAge(model, factor) {
  const curve = model?.curve || [];
  if (!curve.length) return 1;
  const target = clamp(factor, MIN_FACTOR, 1);
  return curve.reduce((best, point) => {
    const distance = Math.abs(Number(point.p50 || 0) - target);
    return distance < best.distance ? { age: Number(point.month || 1), distance } : best;
  }, { age: 1, distance: Number.POSITIVE_INFINITY }).age;
}

function forwardForecastConfidence(model, site, dataDays, historyLength, classification = null) {
  const base = dataDays >= 365 && historyLength >= 10
    ? { key: "high", label: "High", uncertainty: 0.12 }
    : dataDays >= 180 && historyLength >= 5
      ? { key: "medium", label: "Medium", uncertainty: 0.18 }
      : dataDays >= 60 && historyLength >= 2
        ? { key: "medium-low", label: "Medium-low", uncertainty: 0.24 }
        : { key: "low", label: "Low", uncertainty: 0.32 };
  const evidence = validationEvidenceForSite(model, site, dataDays);
  const profile = evidence.profile;
  if (!(profile?.sampleCount >= 4)) {
    const disruptionPenalty = classification?.disruptionSuspected ? 0.10 : 0;
    const uncertainty = clamp(base.uncertainty + disruptionPenalty, base.uncertainty, 0.65);
    return { ...base, uncertainty, downsideUncertainty: uncertainty, upsideUncertainty: uncertainty, empirical: false, sampleCount: profile?.sampleCount || 0, validationHorizon: evidence.horizon };
  }
  const p80 = Number(profile.ensemble?.p80AbsolutePercentageError);
  const empiricalFloor = Number.isFinite(p80) ? p80 : base.uncertainty;
  const disruptionPenalty = classification?.disruptionSuspected ? 0.10 : 0;
  const uncertainty = clamp(Math.max(base.uncertainty, empiricalFloor) + disruptionPenalty, base.uncertainty, 0.70);
  let downside = Number(profile.ensemble?.actualErrorP10);
  let upside = Number(profile.ensemble?.actualErrorP90);
  downside = Number.isFinite(downside) ? Math.abs(Math.min(0, downside)) : uncertainty;
  upside = Number.isFinite(upside) ? Math.max(0, upside) : uncertainty;
  downside = clamp(Math.max(base.uncertainty * 0.70, downside), 0.08, 0.70);
  upside = clamp(Math.max(base.uncertainty * 0.70, upside), 0.08, 1.00);
  const label = uncertainty <= 0.16 ? "High" : uncertainty <= 0.24 ? "Medium" : uncertainty <= 0.35 ? "Medium-low" : "Low";
  const key = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return {
    key,
    label,
    uncertainty,
    downsideUncertainty: downside,
    upsideUncertainty: upside,
    empirical: true,
    sampleCount: profile.sampleCount,
    validationHorizon: evidence.horizon,
    validationWape: profile.ensemble?.wape ?? null,
    validationBias: profile.ensemble?.bias ?? null
  };
}

function forwardTrendPolicy(dataDays, historyLength, rawMonthlyGrowth, eligible = false) {
  if (!eligible || !Number.isFinite(rawMonthlyGrowth) || historyLength < 6 || dataDays < 90) {
    return { monthlyGrowth: 0, rawMonthlyGrowth: Number.isFinite(rawMonthlyGrowth) ? rawMonthlyGrowth : null, weight: 0, cap: 0, floor: 0, eligible: false };
  }
  let weight = 0.30;
  let cap = 0.012;
  let floor = -0.010;
  if (dataDays >= 365) {
    weight = 0.30;
    cap = 0.008;
    floor = -0.008;
  } else if (dataDays >= 180) {
    weight = 0.40;
    cap = 0.012;
    floor = -0.010;
  }
  return {
    monthlyGrowth: clamp(rawMonthlyGrowth * weight, floor, cap),
    rawMonthlyGrowth,
    weight,
    cap,
    floor,
    eligible: true
  };
}

function siteSeasonalityFactors(history, portfolioSeasonality) {
  if (history.length < 10) return (portfolioSeasonality || []).map(x => Number(x?.factor || 1));
  const usable = history.filter(row => row.dailyKwh > 0 && row.calendarDays >= 20);
  const baseline = median(usable.map(row => row.dailyKwh));
  if (!(baseline > 0)) return (portfolioSeasonality || []).map(x => Number(x?.factor || 1));
  const grouped = Array.from({ length: 12 }, () => []);
  usable.forEach(row => grouped[row.calendarMonth - 1].push(row.dailyKwh / baseline));
  let factors = grouped.map((values, idx) => {
    const portfolio = Number(portfolioSeasonality?.[idx]?.factor || 1);
    if (!values.length) return portfolio;
    const siteFactor = clamp(median(values), 0.78, 1.24);
    return siteFactor * 0.55 + portfolio * 0.45;
  });
  const avg = mean(factors) || 1;
  factors = factors.map(value => value / avg);
  return factors;
}

function forwardBaseAdjustedDaily({ dataDays, annualDaily, recentAdjusted }) {
  if (!(recentAdjusted > 0)) return { value: Math.max(0, Number(annualDaily || 0)), recentWeight: 0 };
  if (!(annualDaily > 0)) return { value: recentAdjusted, recentWeight: 1 };
  const recentWeight = dataDays < 60 ? 0.30 : dataDays < 180 ? 0.45 : dataDays < 365 ? 0.50 : 0.35;
  return { value: recentAdjusted * recentWeight + annualDaily * (1 - recentWeight), recentWeight };
}

export function forecastSiteForward12M(params = {}) {
  const site = params.site || {};
  const model = params.model || buildMaturityModel([]);
  const history = historyForSite(site);
  const dataDays = Math.max(0, Number(params.dataDays ?? maturityDays(site) ?? 0));
  const latest = currentDateParts(params.latestDate || site?.actual?.asOfDate || site?.liveActuals?.asOfDate);
  const currentCalendarMonth = latest.month;
  const currentSeasonality = seasonalityFactor(model.seasonality, currentCalendarMonth);
  const annualKwh = Math.max(0, Number(params.currentAnnualKwh || 0));
  const annualRevenue = Math.max(0, Number(params.currentAnnualRevenue || 0));
  const annualSessions = Math.max(0, Number(params.currentAnnualSessions || 0));
  const annualDaily = annualKwh > 0 ? annualKwh / 365 : null;
  const recentDailyInput = finitePositive(params.recentDailyKwh);
  const historyAdjustedDaily = recentAdjustedDaily(history, model.seasonality);
  const dailyHistoryAdjusted = recentAdjustedDailyFromDailyHistory(site, model.seasonality, dataDays);
  const recent30FromDaily = adjustedDailyFromDailyWindow(site, model.seasonality, 30);
  const recent90FromDaily = adjustedDailyFromDailyWindow(site, model.seasonality, 90);
  const rolling30Adjusted = recentDailyInput ? recentDailyInput / currentSeasonality : null;
  const recent30Adjusted = recent30FromDaily || rolling30Adjusted || historyAdjustedDaily || annualDaily;
  const recent90Adjusted = recent90FromDaily || dailyHistoryAdjusted || historyAdjustedDaily || recent30Adjusted || annualDaily;
  const recentSignals = [dailyHistoryAdjusted, historyAdjustedDaily, rolling30Adjusted].filter(value => Number.isFinite(value) && value > 0);
  const recentAdjusted = recentSignals.length
    ? (dailyHistoryAdjusted && rolling30Adjusted ? dailyHistoryAdjusted * 0.70 + rolling30Adjusted * 0.30 : recentSignals[0])
    : annualDaily;
  const baseInfo = forwardBaseAdjustedDaily({ dataDays, annualDaily, recentAdjusted });
  const baseAdjustedDaily = baseInfo.value;
  const trend = recentTrendInfo(history, model.seasonality);
  const trendPolicy = forwardTrendPolicy(dataDays, trend.sampleMonths, trend.monthlyGrowth, trend.eligible);
  const seasonality = siteSeasonalityFactors(history, model.seasonality);
  const fallbackPrice = Math.max(0, Number(params.fallbackPrice || 0));
  const currentPrice = annualKwh > 0 && annualRevenue / annualKwh >= 0.20 && annualRevenue / annualKwh <= 2.0
    ? annualRevenue / annualKwh
    : fallbackPrice;
  const avgSessionKwh = annualSessions > 0 && annualKwh > 0
    ? annualKwh / annualSessions
    : Math.max(1, Number(params.averageSessionKwh || 30.4));
  const trafficGrowth = clamp(Number(params.trafficGrowth || 0), -0.20, 0.25);
  const tariffGrowth = clamp(Number(params.tariffGrowth || 0), -0.20, 0.25);
  const technicalCapacityAnnualKwh = finitePositive(params.technicalCapacityAnnualKwh);
  const technicalCapacityRatio = Number(params.technicalCapacityRatio);
  const classification = classifySiteRepeatability({
    site,
    model,
    dataDays,
    technicalCapacityAnnualKwh,
    technicalCapacityRatio,
    capacityConstrained: params.capacityConstrained
  });
  const confidence = forwardForecastConfidence(model, site, dataDays, history.length, classification);
  const validationEvidence = validationEvidenceForSite(model, site, dataDays);
  const baseWeights = baseForecastMethodWeights(dataDays, history.length);
  const tunedWeights = validationEvidence.profile?.sampleCount >= 4 ? validationEvidence.profile.weights : {};
  const methodWeights = normaliseWeights(Object.fromEntries(FORECAST_METHOD_KEYS.map(key => [
    key,
    Number(baseWeights[key] || 0) * 0.60 + Number(tunedWeights?.[key] || 0) * 0.40
  ])));
  if (history.length < 10) methodWeights.seasonalNaive = 0;
  if (!["early_evidence", "ramping", "stabilising", "late_ramping"].includes(classification.key)) methodWeights.maturityRamp = 0;
  const normalisedMethodWeights = normaliseWeights(methodWeights);
  const validationBiasCorrection = classification.disruptionSuspected
    ? 1
    : clamp(Number(validationEvidence.profile?.biasCorrection || 1), dataDays < 180 ? 0.90 : 0.92, dataDays < 365 ? 1.18 : 1.12);

  const ageMonths = Math.max(1, dataDays / DAYS_PER_MONTH);
  const currentCurveFactor = Math.max(0.25, curveFactor(model, ageMonths, "p50"));
  const observedPlateauDaily = recent90Adjusted > 0 ? recent90Adjusted / currentCurveFactor : null;
  const modelPlateauDaily = finitePositive(params.modelMatureAnnualKwh) ? Number(params.modelMatureAnnualKwh) / 365 : null;
  const plateauWeight = actualCredibilityWeight(dataDays, history.length);
  let ensemblePlateauDaily = observedPlateauDaily && modelPlateauDaily
    ? observedPlateauDaily * plateauWeight + modelPlateauDaily * (1 - plateauWeight)
    : observedPlateauDaily || modelPlateauDaily || recent90Adjusted || annualDaily || 0;
  const recentAnchor = Math.max(0, Number(recent90Adjusted || recent30Adjusted || annualDaily || 0));
  if (recentAnchor > 0) {
    const maxMultiple = dataDays < 60 ? 2.20 : dataDays < 180 ? 1.85 : dataDays < 365 ? 1.55 : 1.30;
    ensemblePlateauDaily = clamp(ensemblePlateauDaily, recentAnchor * 0.85, recentAnchor * maxMultiple);
  }

  const monthly = [];
  const candidateTotals = Object.fromEntries(FORECAST_METHOD_KEYS.map(key => [key, 0]));
  let trendFactor = 1;
  for (let offset = 1; offset <= 12; offset += 1) {
    if (offset <= 6) {
      const decay = 1 - (offset - 1) / 6;
      trendFactor *= 1 + trendPolicy.monthlyGrowth * decay;
    }
    const calendarMonth = futureCalendarMonth(currentCalendarMonth, offset);
    const seasonal = Number(seasonality[calendarMonth - 1] || 1);
    const marketGrowth = Math.pow(1 + trafficGrowth, offset / 12);
    const priceGrowth = Math.pow(1 + tariffGrowth, offset / 12);
    const days = DAYS_PER_MONTH;
    const seasonalNaiveAdjusted = sameCalendarMonthAdjustedDaily(history, calendarMonth, model.seasonality);
    const candidateAdjustedDaily = {
      annualBasis: Math.max(0, Number(annualDaily || baseAdjustedDaily || 0)),
      recent30: Math.max(0, Number(recent30Adjusted || recentAdjusted || annualDaily || 0)),
      recent90: Math.max(0, Number(recent90Adjusted || recentAdjusted || annualDaily || 0)),
      seasonalNaive: Math.max(0, Number(seasonalNaiveAdjusted || recent90Adjusted || annualDaily || 0)),
      controlledTrend: Math.max(0, Number(baseAdjustedDaily || annualDaily || 0) * trendFactor),
      maturityRamp: Math.max(0, Number(ensemblePlateauDaily || 0) * curveFactor(model, ageMonths + offset, "p50"))
    };
    const candidateKwh = {};
    FORECAST_METHOD_KEYS.forEach(key => {
      const value = candidateAdjustedDaily[key] * seasonal * days * marketGrowth;
      candidateKwh[key] = Math.max(0, value);
      candidateTotals[key] += candidateKwh[key];
    });
    const blendedBeforeBias = Math.max(0, Number(weightedValue(candidateKwh, normalisedMethodWeights) || 0));
    const candidateValues = Object.values(candidateKwh).filter(value => Number.isFinite(value) && value > 0);
    const lowerGuard = candidateValues.length ? Math.min(...candidateValues) * 0.85 : 0;
    const upperGuard = candidateValues.length ? Math.max(...candidateValues) * 1.20 : Number.POSITIVE_INFINITY;
    let kwh = clamp(blendedBeforeBias * validationBiasCorrection, lowerGuard, upperGuard);
    const technicalMonthCeiling = technicalCapacityAnnualKwh
      ? (technicalCapacityAnnualKwh / 365) * seasonal * days
      : null;
    if (technicalMonthCeiling && technicalMonthCeiling > 0) kwh = Math.min(kwh, technicalMonthCeiling);
    const adjustedDaily = seasonal > 0 && days > 0 ? kwh / seasonal / days : 0;
    const sessions = avgSessionKwh > 0 ? kwh / avgSessionKwh : 0;
    const revenue = kwh * currentPrice * priceGrowth;
    const downside = Number(confidence.downsideUncertainty ?? confidence.uncertainty ?? 0.30);
    const upside = Number(confidence.upsideUncertainty ?? confidence.uncertainty ?? 0.30);
    const lowerKwh = Math.max(0, kwh * (1 - downside));
    let upperKwh = Math.max(kwh, kwh * (1 + upside));
    if (technicalMonthCeiling && technicalMonthCeiling > 0) upperKwh = Math.min(upperKwh, technicalMonthCeiling);
    monthly.push({
      month: offset,
      calendarMonth,
      days,
      seasonalFactor: seasonal,
      trendFactor,
      marketGrowth,
      priceGrowth,
      adjustedDailyKwh: adjustedDaily,
      kwh,
      sessions,
      revenue,
      lowerKwh,
      upperKwh,
      lowerRevenue: lowerKwh * currentPrice * priceGrowth,
      upperRevenue: upperKwh * currentPrice * priceGrowth,
      forecastStage: "forward-explainable-ensemble",
      candidateKwh,
      biasCorrection: validationBiasCorrection,
      technicalCeilingKwh: technicalMonthCeiling
    });
  }
  const sumRows = (rows, key) => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  const methodology = "Explainable ensemble forecast using annual actuals, recent 30/90-day run-rates, seasonal persistence, a bounded trend and an empirical maturity-ramp challenger. Method weights and bias correction are selected from rolling historical back-tests for the closest available age/category evidence; traffic growth is applied once and technical capacity caps delivered energy where relevant.";
  return {
    source: "actual-forward-ensemble",
    label: "Actual-led explainable ensemble forecast",
    modelType: "explainable-ensemble",
    methodology,
    confidence,
    classification,
    dataDays,
    historyMonths: history.length,
    annualDailyKwh: annualDaily,
    recentAdjustedDailyKwh: recentAdjusted,
    recent30AdjustedDailyKwh: recent30Adjusted,
    recent90AdjustedDailyKwh: recent90Adjusted,
    dailyHistoryAdjustedDailyKwh: dailyHistoryAdjusted,
    monthlyHistoryAdjustedDailyKwh: historyAdjustedDaily,
    rolling30AdjustedDailyKwh: rolling30Adjusted,
    baseAdjustedDailyKwh: baseAdjustedDaily,
    recentWeight: baseInfo.recentWeight,
    trendPolicy,
    recentTrend: trend,
    currentPrice,
    avgSessionKwh,
    seasonality,
    methodWeights: normalisedMethodWeights,
    candidateNext12mKwh: candidateTotals,
    validationBiasCorrection,
    validationEvidence: {
      horizon: validationEvidence.horizon,
      sampleCount: validationEvidence.profile?.sampleCount || 0,
      uniqueSiteCount: validationEvidence.profile?.uniqueSiteCount || 0,
      validationMode: validationEvidence.profile?.validationMode || null,
      wape: validationEvidence.profile?.ensemble?.wape ?? null,
      bias: validationEvidence.profile?.ensemble?.bias ?? null,
      ageBucket: validationEvidence.bucket,
      category: validationEvidence.category
    },
    technicalCapacityAnnualKwh,
    technicalCapacityRatio: Number.isFinite(technicalCapacityRatio) ? technicalCapacityRatio : null,
    monthly,
    next12mKwh: sumRows(monthly, "kwh"),
    next12mSessions: sumRows(monthly, "sessions"),
    next12mRevenue: sumRows(monthly, "revenue"),
    next12mRevenueLow: sumRows(monthly, "lowerRevenue"),
    next12mRevenueHigh: sumRows(monthly, "upperRevenue")
  };
}

export function forecastSiteMaturity(params = {}) {
  const site = params.site || {};
  const model = params.model || buildMaturityModel([]);
  const history = historyForSite(site);
  const dataDays = Math.max(0, Number(params.dataDays ?? maturityDays(site) ?? 0));
  const ageMonths = Math.max(1, dataDays / DAYS_PER_MONTH);
  const latest = currentDateParts(params.latestDate || site?.actual?.asOfDate || site?.liveActuals?.asOfDate);
  const currentCalendarMonth = latest.month;
  const currentSeasonality = seasonalityFactor(model.seasonality, currentCalendarMonth);
  const recentDailyInput = finitePositive(params.recentDailyKwh);
  const historyAdjustedDaily = recentAdjustedDaily(history, model.seasonality);
  const dailyAdjusted = recentAdjustedDailyFromDailyHistory(site, model.seasonality, dataDays);
  const trend = recentTrendInfo(history, model.seasonality);
  const annualDaily = finitePositive(params.currentAnnualKwh) ? Number(params.currentAnnualKwh) / 365 : null;
  const recentAdjusted = dailyAdjusted || historyAdjustedDaily || (recentDailyInput ? recentDailyInput / currentSeasonality : annualDaily);
  const modelPlateauDaily = finitePositive(params.modelMatureAnnualKwh) ? Number(params.modelMatureAnnualKwh) / 365 : null;
  const technicalCapacityAnnualKwh = finitePositive(params.technicalCapacityAnnualKwh);
  const technicalCapacityDaily = technicalCapacityAnnualKwh ? technicalCapacityAnnualKwh / 365 : null;
  const technicalCapacityRatio = Number(params.technicalCapacityRatio);
  const classification = params.classification || classifySiteRepeatability({
    site,
    model,
    dataDays,
    technicalCapacityAnnualKwh,
    technicalCapacityRatio,
    capacityConstrained: params.capacityConstrained
  });
  const lateRamp = classification.key === "late_ramping";
  let forecastAgeMonths = ageMonths;
  if (lateRamp && recentAdjusted) {
    let impliedFactor = null;
    if (modelPlateauDaily) impliedFactor = recentAdjusted / modelPlateauDaily;
    else if (Number.isFinite(trend.monthlyGrowth) && trend.monthlyGrowth > 0) {
      const forwardMultiplier = Math.min(1.55, Math.pow(1 + trend.monthlyGrowth, 9));
      impliedFactor = 1 / forwardMultiplier;
    }
    if (Number.isFinite(impliedFactor)) forecastAgeMonths = Math.min(ageMonths, impliedCurveAge(model, clamp(impliedFactor, MIN_FACTOR, 0.94)));
  }
  const currentCurveFactor = clamp(curveFactor(model, forecastAgeMonths, "p50"), MIN_FACTOR, 1.05);
  const currentCurveP25 = clamp(curveFactor(model, forecastAgeMonths, "p25"), MIN_FACTOR, currentCurveFactor);
  const currentCurveP75 = clamp(curveFactor(model, forecastAgeMonths, "p75"), currentCurveFactor, 1.12);
  const observedPlateauDaily = recentAdjusted ? recentAdjusted / Math.max(currentCurveFactor, 0.25) : null;
  const observedPlateauP25Daily = recentAdjusted ? recentAdjusted / Math.max(currentCurveP75, 0.25) : null;
  const observedPlateauP75Daily = recentAdjusted ? recentAdjusted / Math.max(currentCurveP25, 0.18) : null;
  let actualWeight = actualCredibilityWeight(dataDays, history.length);
  if (classification.key === "repeatable") actualWeight = 0.95;
  else if (lateRamp) actualWeight = Math.min(actualWeight, 0.70);
  else if (classification.key === "declining_disrupted") actualWeight = Math.min(actualWeight, 0.65);

  const blendPlateau = (observed, modelValue) => {
    if (observed && modelValue) return observed * actualWeight + modelValue * (1 - actualWeight);
    return observed || modelValue || annualDaily || 0;
  };
  let commercialP50Daily = blendPlateau(observedPlateauDaily, modelPlateauDaily);
  let commercialP25Daily = blendPlateau(observedPlateauP25Daily, modelPlateauDaily ? modelPlateauDaily * 0.85 : null);
  let commercialP75Daily = blendPlateau(observedPlateauP75Daily, modelPlateauDaily ? modelPlateauDaily * 1.15 : null);
  if (classification.key === "repeatable" && recentAdjusted) {
    commercialP50Daily = recentAdjusted;
    const repeatableRange = Math.max(0.10, Number(classification.volatility || 0));
    commercialP25Daily = recentAdjusted * (1 - Math.min(0.25, repeatableRange));
    commercialP75Daily = recentAdjusted * (1 + Math.min(0.30, repeatableRange));
  }
  commercialP50Daily = Math.max(0, commercialP50Daily || 0);
  commercialP25Daily = clamp(Math.max(0, commercialP25Daily || commercialP50Daily * 0.80), 0, commercialP50Daily);
  commercialP75Daily = Math.max(commercialP50Daily, commercialP75Daily || commercialP50Daily * 1.20);

  const deliveredP50Daily = technicalCapacityDaily ? Math.min(commercialP50Daily, technicalCapacityDaily) : commercialP50Daily;
  const deliveredP25Daily = technicalCapacityDaily ? Math.min(commercialP25Daily, technicalCapacityDaily) : commercialP25Daily;
  const deliveredP75Daily = technicalCapacityDaily ? Math.min(commercialP75Daily, technicalCapacityDaily) : commercialP75Daily;
  const capacityConstrained = Boolean(technicalCapacityDaily && commercialP50Daily > technicalCapacityDaily * 1.001);

  const annualKwh = Math.max(0, Number(params.currentAnnualKwh || 0));
  const annualRevenue = Math.max(0, Number(params.currentAnnualRevenue || 0));
  const annualSessions = Math.max(0, Number(params.currentAnnualSessions || 0));
  const fallbackPrice = Math.max(0, Number(params.fallbackPrice || 0));
  const currentPrice = annualKwh > 0 && annualRevenue / annualKwh >= 0.20 && annualRevenue / annualKwh <= 2.0
    ? annualRevenue / annualKwh
    : fallbackPrice;
  const avgSessionKwh = annualSessions > 0 && annualKwh > 0 ? annualKwh / annualSessions : Math.max(1, Number(params.averageSessionKwh || 30.4));
  const trafficGrowth = clamp(Number(params.trafficGrowth || 0), -0.20, 0.25);
  const tariffGrowth = clamp(Number(params.tariffGrowth || 0), -0.20, 0.25);
  const horizonMonths = Math.max(12, Math.min(360, Math.round(Number(params.horizonMonths || 240))));
  const backtestError = Number(model?.backtest?.[6]?.medianAbsoluteError);
  const longTermConfidence = forecastConfidence(model, dataDays, history.length, backtestError, lateRamp);
  const currentMaturityFactor = commercialP50Daily > 0 && recentAdjusted > 0
    ? clamp(recentAdjusted / commercialP50Daily, 0, 1.15)
    : currentCurveFactor;
  const maturityThreshold = Number(model?.maturityThreshold || 0.95);
  const findMonthsTo = threshold => {
    if (classification.key === "repeatable" && currentMaturityFactor >= threshold) return 0;
    const foundOffset = Array.from({ length: Math.max(1, model.curve.length + 24) }, (_, idx) => idx + 1)
      .find(offset => curveFactor(model, forecastAgeMonths + offset, "p50") >= threshold);
    return foundOffset || null;
  };
  const monthsTo90PctMaturity = findMonthsTo(0.90);
  const monthsTo95PctMaturity = findMonthsTo(maturityThreshold);
  const monthsToMaturity = monthsTo95PctMaturity || 0;

  const forward12 = params.forward12m || forecastSiteForward12M({ ...params, classification });
  const monthly = forward12.monthly.map(month => ({ ...month }));
  const month12 = monthly[11] || monthly.at(-1) || null;
  const month12Seasonality = month12 ? Number(month12.seasonalFactor || 1) : 1;
  const month12AdjustedDaily = month12 && Number(month12.kwh || 0) > 0
    ? Number(month12.kwh) / Math.max(1, Number(month12.days || DAYS_PER_MONTH)) / Math.max(0.5, month12Seasonality)
    : Math.max(0, Number(forward12.baseAdjustedDailyKwh || annualDaily || 0));
  const maturityEligible = ["early_evidence", "ramping", "stabilising", "late_ramping"].includes(classification.key);

  for (let offset = 13; offset <= horizonMonths; offset += 1) {
    const age = forecastAgeMonths + offset;
    const calendarMonth = futureCalendarMonth(currentCalendarMonth, offset);
    const seasonal = seasonalityFactor(model.seasonality, calendarMonth);
    const beyondYearOne = offset - 12;
    const continuationGrowth = Math.pow(1 + trafficGrowth, beyondYearOne / 12);
    const fullMarketGrowth = Math.pow(1 + trafficGrowth, offset / 12);
    const priceGrowth = Math.pow(1 + tariffGrowth, offset / 12);
    const factor = curveFactor(model, age, "p50");
    const lowerFactor = curveFactor(model, age, "p25");
    const upperFactor = curveFactor(model, age, "p75");
    const continuationDaily = month12AdjustedDaily * continuationGrowth;
    const commercialTargetDaily = commercialP50Daily * factor * fullMarketGrowth;
    const maturityTargetDaily = technicalCapacityDaily ? Math.min(commercialTargetDaily, technicalCapacityDaily) : commercialTargetDaily;
    const transitionWeight = maturityEligible ? Math.min(1, beyondYearOne / 12) : 0;
    let adjustedDaily = continuationDaily * (1 - transitionWeight) + maturityTargetDaily * transitionWeight;
    if (technicalCapacityDaily) adjustedDaily = Math.min(adjustedDaily, technicalCapacityDaily);
    const days = DAYS_PER_MONTH;
    const kwh = Math.max(0, adjustedDaily * seasonal * days);
    const sessions = avgSessionKwh > 0 ? kwh / avgSessionKwh : 0;
    const revenue = kwh * currentPrice * priceGrowth;
    const lowerCommercialTarget = commercialP25Daily * lowerFactor * fullMarketGrowth;
    const upperCommercialTarget = commercialP75Daily * upperFactor * fullMarketGrowth;
    const lowerTargetDaily = technicalCapacityDaily ? Math.min(lowerCommercialTarget, technicalCapacityDaily) : lowerCommercialTarget;
    const upperTargetDaily = technicalCapacityDaily ? Math.min(upperCommercialTarget, technicalCapacityDaily) : upperCommercialTarget;
    let lowerAdjustedDaily = continuationDaily * (1 - transitionWeight) + lowerTargetDaily * transitionWeight;
    let upperAdjustedDaily = continuationDaily * (1 - transitionWeight) + upperTargetDaily * transitionWeight;
    if (technicalCapacityDaily) {
      lowerAdjustedDaily = Math.min(lowerAdjustedDaily, technicalCapacityDaily);
      upperAdjustedDaily = Math.min(upperAdjustedDaily, technicalCapacityDaily);
    }
    const lowerKwh = Math.max(0, lowerAdjustedDaily * seasonal * days);
    const upperKwh = Math.max(kwh, upperAdjustedDaily * seasonal * days);
    monthly.push({
      month: offset,
      ageMonth: age,
      calendarMonth,
      curveFactor: factor,
      transitionWeight,
      kwh,
      sessions,
      revenue,
      lowerKwh,
      upperKwh,
      lowerRevenue: lowerKwh * currentPrice * priceGrowth,
      upperRevenue: upperKwh * currentPrice * priceGrowth,
      forecastStage: maturityEligible ? "long-term-maturity-transition" : "long-term-observed-run-rate",
      commercialTargetDailyKwh: commercialTargetDaily,
      technicalCeilingDailyKwh: technicalCapacityDaily
    });
  }
  const first12 = monthly.slice(0, 12);
  const sumRows = (rows, key) => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  const matureAnnualKwh = deliveredP50Daily * 365;
  const matureAnnualRevenue = matureAnnualKwh * currentPrice;
  return {
    source: model.source,
    methodology: `${forward12.methodology} Long-term projections use a P25/P50/P75 current-condition commercial plateau, transition only for ramping/stabilising sites, and cap delivered energy at the calculated technical ceiling where one exists.`,
    confidence: forward12.confidence,
    longTermConfidence,
    classification,
    ageMonths,
    forecastAgeMonths,
    currentCurveFactor,
    currentMaturityFactor,
    maturityThreshold,
    monthsToMaturity,
    monthsTo90PctMaturity,
    monthsTo95PctMaturity,
    actualWeight,
    lateRamp,
    recentTrend: trend,
    plateauDailyKwh: deliveredP50Daily,
    commercialPlateauDailyKwh: commercialP50Daily,
    commercialPotentialAnnualKwh: commercialP50Daily * 365,
    commercialPotentialAnnualKwhP25: commercialP25Daily * 365,
    commercialPotentialAnnualKwhP75: commercialP75Daily * 365,
    technicalCapacityAnnualKwh,
    technicalCapacityRatio: Number.isFinite(technicalCapacityRatio) ? technicalCapacityRatio : null,
    capacityConstrained,
    matureAnnualKwh,
    matureAnnualKwhP25: deliveredP25Daily * 365,
    matureAnnualKwhP75: deliveredP75Daily * 365,
    matureAnnualRevenue,
    next12mKwh: sumRows(first12, "kwh"),
    next12mSessions: sumRows(first12, "sessions"),
    next12mRevenue: sumRows(first12, "revenue"),
    next12mRevenueLow: sumRows(first12, "lowerRevenue"),
    next12mRevenueHigh: sumRows(first12, "upperRevenue"),
    currentPrice,
    avgSessionKwh,
    monthly,
    forward12m: forward12,
    historyMonths: history.length,
    trainingSiteCount: model.trainingSiteCount || 0,
    forecastValidation: model.forecastValidation,
    label: "Explainable ensemble Y1; evidence-based maturity from month 13"
  };
}

