export function calculateDemand(inputs) {
  const years = [];
  const horizon = 20;
  const startYear = Number(inputs.modelStartYear ?? inputs.codYear ?? new Date().getFullYear());
  const trafficSourceYear = Number(inputs.trafficSourceYear ?? startYear);
  let techUplift = 1;
  let durationUplift = 1;

  for (let t = 0; t < horizon; t += 1) {
    const year = startYear + t;
    const trafficGrowthFactor = Math.pow(1 + inputs.annualTrafficGrowthRate, startYear - trafficSourceYear + t);
    const matchedRawCorridorTraffic = Number(inputs.rawCorridorTrafficAadt || 0) * trafficGrowthFactor;
    const effectiveAadtCap = Number(inputs.effectiveAadtCap || 0);
    const effectiveBaseAadt = effectiveAadtCap > 0
      ? Math.min(Number(inputs.rawCorridorTrafficAadt || 0), effectiveAadtCap)
      : Number(inputs.rawCorridorTrafficAadt || 0);
    const rawCorridorTraffic = effectiveBaseAadt * trafficGrowthFactor;
    const relevantTraffic = rawCorridorTraffic * inputs.siteRelevanceFactor;
    const bevShare = Math.min(inputs.bevShareCap, inputs.onRoadBevShareAtCod * Math.pow(1 + inputs.annualBevShareGrowthRate, t));
    const bevDailyTraffic = relevantTraffic * bevShare;
    const fastChargeCandidates = bevDailyTraffic * inputs.fastChargePropensity;
    const capturedArrivalsPreRamp = fastChargeCandidates * inputs.siteCaptureRate * inputs.siteLimitationFactor;
    const rampUpFactor = t === 0 ? inputs.rampUpYear1 : t === 1 ? inputs.rampUpYear2 : 1;
    const effectiveDailyArrivals = capturedArrivalsPreRamp * rampUpFactor;
    const annualSessionsDemanded = effectiveDailyArrivals * 365;

    if (t === 0) {
      techUplift = 1;
      durationUplift = 1;
    } else {
      const techRate = t <= 10 ? inputs.techUpliftEarlyPhaseRate : inputs.techUpliftMiddlePhaseRate;
      techUplift = Math.min(inputs.techUpliftCap, techUplift * (1 + techRate));
      durationUplift = Math.min(inputs.techUpliftCap, durationUplift * (1 + techRate * inputs.durationResponseFactor));
    }

    const fleetPlanningPowerKw = inputs.baseFleetPlanningPower * techUplift;
    const sessionDurationHrs = inputs.averageSessionEnergy / (fleetPlanningPowerKw / durationUplift) + inputs.plugInOverstayOverheadHours;
    const peakHourArrivals = effectiveDailyArrivals * inputs.peakWindowShare * inputs.peakHourShareWithinPeakWindow;
    const peakConcurrentSessions = Math.max(inputs.designPeakFloorSessions, peakHourArrivals * sessionDurationHrs);
    const annualEnergyDemandedKwh = annualSessionsDemanded * inputs.averageSessionEnergy;
    const peakDemandRequiredKw = peakConcurrentSessions * fleetPlanningPowerKw;
    const requiredMicNoBatteryKva = peakDemandRequiredKw / inputs.powerFactor;
    const peakWindowKwh = annualEnergyDemandedKwh * inputs.peakWindowShare / 365;
    const requiredPlugs = peakConcurrentSessions;

    years.push({
      index: t + 1,
      year,
      rawCorridorTraffic,
      matchedRawCorridorTraffic,
      effectiveAadtCap,
      relevantTraffic,
      bevShare,
      bevDailyTraffic,
      fastChargeCandidates,
      capturedArrivalsPreRamp,
      rampUpFactor,
      effectiveDailyArrivals,
      annualSessionsDemanded,
      technologyUpliftFactor: techUplift,
      durationUpliftFactor: durationUplift,
      fleetPlanningPowerKw,
      sessionDurationHrs,
      peakHourArrivals,
      peakConcurrentSessions,
      annualEnergyDemandedKwh,
      peakWindowKwh,
      peakDemandRequiredKw,
      requiredMicNoBatteryKva,
      requiredPlugs
    });
  }

  return {
    years,
    maxPeakDemandKw: Math.max(...years.map(y => y.peakDemandRequiredKw)),
    maxRequiredMicNoBatteryKva: Math.max(...years.map(y => y.requiredMicNoBatteryKva)),
    maxConcurrentSessions: Math.max(...years.map(y => y.peakConcurrentSessions)),
    totalDemandedEnergyKwh: years.reduce((a, y) => a + y.annualEnergyDemandedKwh, 0)
  };
}
