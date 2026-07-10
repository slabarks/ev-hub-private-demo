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
  const raw = candidates.find(Array.isArray) || [];
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
  return {
    site,
    history: adjusted,
    plateau,
    lateSlope,
    stable: Number.isFinite(lateSlope) ? Math.abs(lateSlope) <= 0.15 : false
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
  p50[maxMonths - 1] = Math.max(1, p50[maxMonths - 1]);
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
  const model = {
    source,
    curve,
    seasonality,
    eligibleTrainingSiteCount: eligibleProfiles.length,
    trainingSiteCount: curveProfiles.length,
    stableSiteCount: stableProfiles.length,
    empiricalMonths,
    maxObservedMonth: curveProfiles.length ? Math.max(...curveProfiles.flatMap(profile => profile.history.map(row => row.monthIndex))) : 0,
    trainingSiteNames: curveProfiles.map(profile => profile.site?.name || profile.site?.siteName || "Site"),
    methodology: source === "empirical"
      ? `${stableProfiles.length >= 3 ? "Stable " : ""}seasonality-adjusted, site-normalised mature-cohort median with monotonic smoothing and conservative prior shrinkage.`
      : eligibleProfiles.length
        ? "Conservative portfolio ramp prior blended with limited 365+ day cohort evidence; more stable mature histories are required for empirical status."
        : "Conservative portfolio ramp prior; upload charger-level daily history to activate mature-cohort learning."
  };
  model.backtest = options.includeBacktest === false ? {} : backtest(curveSites, { maxMonths, rampYear1, rampYear2 }, model);
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
  const usable = history.filter(row => row.dailyKwh > 0 && row.calendarDays >= 14).map(row => ({
    ...row,
    adjustedDailyKwh: row.dailyKwh / seasonalityFactor(seasonality, row.calendarMonth)
  }));
  const recent = median(usable.slice(-3).map(row => row.adjustedDailyKwh));
  const previous = median(usable.slice(-6, -3).map(row => row.adjustedDailyKwh));
  const blockChange = recent > 0 && previous > 0 ? recent / previous - 1 : null;
  const monthlyGrowth = Number.isFinite(blockChange) && blockChange > -1 ? Math.pow(1 + blockChange, 1 / 3) - 1 : null;
  return { recent, previous, blockChange, monthlyGrowth, sampleMonths: usable.length };
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
  const trend = recentTrendInfo(history, model.seasonality);
  const annualDaily = finitePositive(params.currentAnnualKwh) ? Number(params.currentAnnualKwh) / 365 : null;
  const recentAdjusted = historyAdjustedDaily || (recentDailyInput ? recentDailyInput / currentSeasonality : annualDaily);
  const modelPlateauDaily = finitePositive(params.modelMatureAnnualKwh) ? Number(params.modelMatureAnnualKwh) / 365 : null;
  const lateRamp = dataDays >= 365 && Number.isFinite(trend.blockChange) && trend.blockChange > 0.15;
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
  const observedPlateauDaily = recentAdjusted ? recentAdjusted / Math.max(currentCurveFactor, 0.25) : null;
  let actualWeight = actualCredibilityWeight(dataDays, history.length);
  if (lateRamp) actualWeight = Math.min(actualWeight, 0.70);
  let plateauDaily = null;
  if (observedPlateauDaily && modelPlateauDaily) plateauDaily = observedPlateauDaily * actualWeight + modelPlateauDaily * (1 - actualWeight);
  else plateauDaily = observedPlateauDaily || modelPlateauDaily || annualDaily || 0;
  plateauDaily = Math.max(0, plateauDaily || 0);

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
  const confidence = forecastConfidence(model, dataDays, history.length, backtestError, lateRamp);
  const currentMaturityFactor = plateauDaily > 0 && recentAdjusted > 0
    ? clamp(recentAdjusted / plateauDaily, 0, 1.15)
    : currentCurveFactor;
  let monthsToMaturity = 0;
  if (currentMaturityFactor < 0.95 || lateRamp) {
    const foundOffset = Array.from({ length: Math.max(1, model.curve.length + 12) }, (_, idx) => idx + 1)
      .find(offset => curveFactor(model, forecastAgeMonths + offset, "p50") >= 0.95);
    monthsToMaturity = foundOffset || Math.max(0, Math.ceil((model.curve.length || 24) - forecastAgeMonths));
  }

  const monthly = [];
  for (let offset = 1; offset <= horizonMonths; offset += 1) {
    const age = forecastAgeMonths + offset;
    const calendarMonth = futureCalendarMonth(currentCalendarMonth, offset);
    const seasonal = seasonalityFactor(model.seasonality, calendarMonth);
    const volumeGrowth = Math.pow(1 + trafficGrowth, offset / 12);
    const priceGrowth = Math.pow(1 + tariffGrowth, offset / 12);
    const factor = curveFactor(model, age, "p50");
    const lowerFactor = curveFactor(model, age, "p25");
    const upperFactor = curveFactor(model, age, "p75");
    const days = DAYS_PER_MONTH;
    const kwh = plateauDaily * factor * seasonal * days * volumeGrowth;
    const sessions = avgSessionKwh > 0 ? kwh / avgSessionKwh : 0;
    const revenue = kwh * currentPrice * priceGrowth;
    const lowerKwh = plateauDaily * (1 - confidence.uncertainty) * lowerFactor * seasonal * days * volumeGrowth;
    const upperKwh = plateauDaily * (1 + confidence.uncertainty) * upperFactor * seasonal * days * volumeGrowth;
    monthly.push({
      month: offset,
      ageMonth: age,
      calendarMonth,
      curveFactor: factor,
      kwh,
      sessions,
      revenue,
      lowerKwh,
      upperKwh,
      lowerRevenue: lowerKwh * currentPrice * priceGrowth,
      upperRevenue: upperKwh * currentPrice * priceGrowth
    });
  }
  const first12 = monthly.slice(0, 12);
  const sum = (rows, key) => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  const matureAnnualKwh = plateauDaily * 365;
  const matureAnnualRevenue = matureAnnualKwh * currentPrice;
  return {
    source: model.source,
    methodology: model.methodology,
    confidence,
    ageMonths,
    forecastAgeMonths,
    currentCurveFactor,
    currentMaturityFactor,
    monthsToMaturity,
    actualWeight,
    lateRamp,
    recentTrend: trend,
    plateauDailyKwh: plateauDaily,
    matureAnnualKwh,
    matureAnnualRevenue,
    next12mKwh: sum(first12, "kwh"),
    next12mSessions: sum(first12, "sessions"),
    next12mRevenue: sum(first12, "revenue"),
    next12mRevenueLow: sum(first12, "lowerRevenue"),
    next12mRevenueHigh: sum(first12, "upperRevenue"),
    currentPrice,
    avgSessionKwh,
    monthly,
    historyMonths: history.length,
    trainingSiteCount: model.trainingSiteCount || 0,
    label: lateRamp ? "Late-ramp observed trend" : model.source === "empirical" ? "Mature-cohort trend" : "Model-prior trend"
  };
}
