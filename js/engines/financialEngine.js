import { deriveConfiguration, technicalChecks, validateConfiguration, batteryUsableEnergyKwh, batteryUsableFraction, rechargeWindowDurationHours } from "./technicalEngine.js";
import { batteryItem, batteryDeploymentCostProfile } from "../data/batteryLibrary.js";
import { sum, npv, irr } from "../utils.js";

function batteryEnvelope(config) {
  const battery = batteryItem(config.batterySize);
  const selectedPowerKw = Number(battery.powerKw || 0);
  const selectedEnergyKwh = Number(battery.energyKwh || 0);
  if (!selectedPowerKw || !selectedEnergyKwh || config.batteryStrategy === "Grid only") {
    return { unitsMax: 0, unitPowerKw: 0, unitEnergyKwh: 0, firstUnitDeploymentCapex: 0, additionalUnitDeploymentCapex: 0, unitReplacementCapex: 0, unitServiceCost: 0, totalDeploymentCapexExcludingCivils: 0, battery };
  }

  // Autel batteries are selected in 125 kW / 261 kWh modules.
  // Polarium selections are treated as multiples of the smallest 150 kW / 280 kWh block.
  const unitPowerKw = String(config.batterySize || "").includes("Polarium") ? 150 : 125;
  const unitEnergyKwh = String(config.batterySize || "").includes("Polarium") ? 280 : 261;
  const profile = batteryDeploymentCostProfile(battery);
  const unitsMax = profile.unitsMax;
  const unitServiceCost = unitPowerKw === 150 ? 350 : 420;
  return { unitsMax, unitPowerKw, unitEnergyKwh, firstUnitDeploymentCapex: profile.firstUnitDeploymentCapex, additionalUnitDeploymentCapex: profile.additionalUnitDeploymentCapex, unitReplacementCapex: profile.unitReplacementCapex, unitServiceCost, totalDeploymentCapexExcludingCivils: profile.totalDeploymentCapexExcludingCivils, battery };
}

function activeBatteryTotals(cohorts, inputs = {}) {
  return cohorts.reduce((acc, c) => {
    acc.units += c.units;
    acc.powerKw += c.units * c.unitPowerKw;
    acc.nominalEnergyKwh += c.units * c.unitEnergyKwh;
    acc.sohAdjustedEnergyKwh += c.units * c.unitEnergyKwh * c.soh;
    acc.dispatchableEnergyKwh += batteryUsableEnergyKwh(c.units * c.unitEnergyKwh, c.soh, inputs);
    return acc;
  }, { units: 0, powerKw: 0, nominalEnergyKwh: 0, sohAdjustedEnergyKwh: 0, dispatchableEnergyKwh: 0 });
}

function weightedAverageSoh(cohorts, inputs = {}) {
  const totals = activeBatteryTotals(cohorts, inputs);
  if (!totals.units) return 0;
  return cohorts.reduce((acc, c) => acc + c.soh * c.units, 0) / totals.units;
}

function resolvedBatteryDeploymentMode(config, envelope) {
  if (!envelope.unitsMax) return "grid-only";
  const explicit = String(config.batteryDeploymentMode || "").toLowerCase();
  if (explicit.includes("installed") || explicit.includes("day one") || explicit.includes("day-one")) return "installed-day-one";
  if (Number(config.actualInitialCapexOverride || 0) > 0) return "installed-day-one";
  return "staged-envelope";
}

function reliabilityAvailabilityFactor(inputs = {}) {
  const failureRate = Math.max(0, Math.min(1, Number(inputs.annualFailureRateStarting || 0)));
  const downtimeImpact = Math.max(0, Math.min(1, Number(inputs.downtimeImpactFactor || 0)));
  return Math.max(0, Math.min(1, 1 - failureRate * downtimeImpact));
}

export function calculateYearByYear(inputs, config, demand) {
  const derived = deriveConfiguration(config, inputs);
  const configurationValidity = validateConfiguration(config);
  const isValidConfiguration = configurationValidity.valid;
  const envelope = batteryEnvelope(config);
  const noBatteryDerived = envelope.unitsMax > 0
    ? deriveConfiguration({ ...config, batteryStrategy: "Grid only", batterySize: "No battery", batteryWarrantyYears: 0 }, inputs)
    : derived;
  const totalBatteryLibraryDeploymentCapex = envelope.unitsMax > 0
    ? Number(envelope.totalDeploymentCapexExcludingCivils || 0)
    : 0;
  // Battery augmentation rule:
  // - keep the selected battery size as a staged envelope;
  // - make main battery civils/electrical provision once for the selected envelope;
  // - do not re-charge that civils/integration allowance each time an extra module is deployed;
  // - the first battery deployment carries the one-off provision allowance;
  // - each later deployment/augmentation pays only the battery module share of HW + shipping/logistics + unit install/commissioning.
  const batteryEnvelopeProvisionCapex = envelope.unitsMax > 0
    ? Math.max(0, derived.initialInvestmentCapex - noBatteryDerived.initialInvestmentCapex - totalBatteryLibraryDeploymentCapex)
    : 0;
  const stagedFirstBatteryDeploymentBaseCapex = envelope.unitsMax > 0
    ? envelope.firstUnitDeploymentCapex
    : 0;
  const stagedAdditionalBatteryDeploymentCapex = envelope.unitsMax > 0
    ? envelope.additionalUnitDeploymentCapex
    : 0;
  const rows = [];
  const batteryCohorts = [];
  const batteryDeploymentMode = resolvedBatteryDeploymentMode(config, envelope);
  if (batteryDeploymentMode === "installed-day-one" && envelope.unitsMax > 0) {
    batteryCohorts.push({
      installYear: Number(inputs.modelStartYear || inputs.codYear),
      units: envelope.unitsMax,
      unitPowerKw: envelope.unitPowerKw,
      unitEnergyKwh: envelope.unitEnergyKwh,
      unitDeploymentCapex: 0,
      unitReplacementCapex: envelope.unitReplacementCapex,
      soh: 1,
      sohStart: 1,
      annualSohDegradation: 0,
      replacedThisYear: false,
      installedAtCod: true
    });
  }
  let cumulativeCashFlow = 0;
  const peakWindowDurationHrs = Number(inputs.peakWindowEndHour ?? inputs.peakWindowHours ?? 5) || 5;
  const rechargeWindowHours = rechargeWindowDurationHours(inputs);
  const nonBatteryInitialCapex = noBatteryDerived.initialInvestmentCapex;
  const grossBaseInitialCapex = batteryDeploymentMode === "installed-day-one" ? derived.initialInvestmentCapex : nonBatteryInitialCapex;
  const requestedGrantSupport = Math.max(0, Number(inputs.grantSupport || 0));
  const availabilityFactor = reliabilityAvailabilityFactor(inputs);
  let appliedGrantSupport = 0;
  let grossInitialInvestmentBeforeGrant = 0;
  let gridOnlyCapacityPlateauKwh = 0;

  demand.years.forEach((d, idx) => {
    const yearNumber = idx + 1;
    const year = d.year;
    const selectedMicKva = config.selectedMicKva;
    const gridPowerKw = selectedMicKva * inputs.powerFactor;
    const peakWindowEnergyDemandKwh = d.annualEnergyDemandedKwh * inputs.peakWindowShare / 365;
    const residualPeakWindowKwh = Math.max(0, peakWindowEnergyDemandKwh - gridPowerKw * peakWindowDurationHrs);
    const peakDemandRequiredKw = d.peakDemandRequiredKw;
    const batteryPowerRequiredKw = Math.max(0, peakDemandRequiredKw - gridPowerKw);

    // 1) Age all installed battery cohorts individually.
    let batteryReplacementUnits = 0;
    let batteryReplacementCapex = 0;
    batteryCohorts.forEach(cohort => {
      const annualSohDegradation = inputs.batteryBaseDegradationRate + inputs.batteryCyclingDegradationFactor * Math.min(
        1,
        d.annualEnergyDemandedKwh / Math.max(1, cohort.units * cohort.unitEnergyKwh * 365)
      );
      cohort.sohStart = cohort.soh;
      cohort.annualSohDegradation = annualSohDegradation;
      cohort.soh = Math.max(0, cohort.soh - annualSohDegradation);
      if (cohort.soh <= inputs.batteryReplacementThresholdSoh && cohort.soh > 0) {
        batteryReplacementUnits += cohort.units;
        batteryReplacementCapex += cohort.units * cohort.unitReplacementCapex;
        cohort.soh = 1;
        cohort.replacedThisYear = true;
      } else {
        cohort.replacedThisYear = false;
      }
    });

    // 2) Check active deployed fleet; add minimum additional units if required, capped by the selected battery envelope.
    let before = activeBatteryTotals(batteryCohorts, inputs);
    const powerUnitsNeeded = envelope.unitPowerKw > 0 ? Math.ceil(Math.max(0, batteryPowerRequiredKw - before.powerKw) / envelope.unitPowerKw) : 0;
    const unitDispatchableEnergyKwh = batteryUsableEnergyKwh(envelope.unitEnergyKwh, 1, inputs);
    const energyUnitsNeeded = unitDispatchableEnergyKwh > 0 ? Math.ceil(Math.max(0, residualPeakWindowKwh - before.dispatchableEnergyKwh) / unitDispatchableEnergyKwh) : 0;
    const desiredAdditionalUnits = Math.max(powerUnitsNeeded, energyUnitsNeeded);
    const remainingEnvelopeUnits = Math.max(0, envelope.unitsMax - before.units);
    const newBatteryUnitsInstalled = batteryDeploymentMode === "installed-day-one" ? 0 : Math.min(remainingEnvelopeUnits, desiredAdditionalUnits);
    const augmentationFlag = newBatteryUnitsInstalled > 0 ? "AUGMENT" : "";
    const firstBatteryDeploymentThisYear = newBatteryUnitsInstalled > 0 && before.units === 0;
    const augmentationCapex = newBatteryUnitsInstalled > 0
      ? (firstBatteryDeploymentThisYear
        ? stagedFirstBatteryDeploymentBaseCapex
          + Math.max(0, newBatteryUnitsInstalled - 1) * stagedAdditionalBatteryDeploymentCapex
          + batteryEnvelopeProvisionCapex
        : newBatteryUnitsInstalled * stagedAdditionalBatteryDeploymentCapex)
      : 0;
    if (newBatteryUnitsInstalled > 0) {
      batteryCohorts.push({
        installYear: year,
        units: newBatteryUnitsInstalled,
        unitPowerKw: envelope.unitPowerKw,
        unitEnergyKwh: envelope.unitEnergyKwh,
        unitDeploymentCapex: firstBatteryDeploymentThisYear ? stagedFirstBatteryDeploymentBaseCapex : stagedAdditionalBatteryDeploymentCapex,
        unitReplacementCapex: envelope.unitReplacementCapex,
        soh: 1,
        sohStart: 1,
        annualSohDegradation: 0,
        replacedThisYear: false
      });
    }

    const totals = activeBatteryTotals(batteryCohorts, inputs);
    const batteryInverterPowerKw = totals.powerKw;
    const batteryNominalEnergyKwh = totals.nominalEnergyKwh;
    const batteryEnergyAvailableKwhSohAdjusted = totals.sohAdjustedEnergyKwh;
    const batteryDispatchableEnergyKwh = totals.dispatchableEnergyKwh;
    const batterySohStart = batteryCohorts.length ? batteryCohorts.reduce((acc, c) => acc + (c.sohStart ?? c.soh) * c.units, 0) / Math.max(1, totals.units) : 0;
    const batterySohEnd = weightedAverageSoh(batteryCohorts, inputs);
    const annualSohDegradation = batterySohStart > 0 ? Math.max(0, batterySohStart - batterySohEnd) : 0;
    const batteryReplacementTrigger = batteryReplacementUnits > 0 ? 1 : 0;
    const batteryPowerDeficitKw = Math.max(0, batteryPowerRequiredKw - batteryInverterPowerKw);
    const batteryEnergyDeficitKwh = Math.max(0, residualPeakWindowKwh - batteryDispatchableEnergyKwh);

    const installedChargerPowerKw = derived.installedChargerPowerKw;
    const batteryPeakResidualCoverageRatio = residualPeakWindowKwh > 0 ? Math.min(1, batteryDispatchableEnergyKwh / Math.max(1, residualPeakWindowKwh)) : 1;
    const peakWindowShare = Math.max(0, Math.min(1, Number(inputs.peakWindowShare || 0)));
    // Grid-only sites should continue serving all physically deliverable energy from their existing MIC/chargers.
    // A missing battery must not force delivered energy to zero once peak-window demand exceeds grid-only capacity.
    // Instead, the site plateaus at its plug/power capacity and the model records unserved/lost demand.
    const batteryEnergyCoverageRatio = (config.batteryStrategy === "Grid only" || envelope.unitsMax === 0)
      ? 1
      : Math.min(1, (1 - peakWindowShare) + peakWindowShare * batteryPeakResidualCoverageRatio);
    const batterySustainDurationAtFullOutputHrs = batteryInverterPowerKw > 0 ? batteryDispatchableEnergyKwh / Math.max(1, batteryInverterPowerKw) : 0;
    const gridPowerAvailableForRechargeKw = gridPowerKw;
    const batteryEnergyToRechargeKwh = Math.min(residualPeakWindowKwh, batteryDispatchableEnergyKwh);
    const overnightRechargeDeliverableKwh = gridPowerAvailableForRechargeKw * rechargeWindowHours;
    const totalAvailableSitePowerKw = gridPowerKw + batteryInverterPowerKw;
    const requiredMicNoBatteryKva = d.requiredMicNoBatteryKva;
    const batteryPowerSurplusDeficitKw = batteryInverterPowerKw - batteryPowerRequiredKw;
    const installedOutputs = Math.max(0, Number(derived.installedOutputs || 0));
    const plugCoverageRatio = Math.min(1, installedOutputs / Math.max(1, Number(d.peakConcurrentSessions || d.requiredPlugs || 0)));
    const powerCoverageRatio = Math.min(1, Math.min(installedChargerPowerKw, totalAvailableSitePowerKw) / Math.max(1, peakDemandRequiredKw));
    const rawServedDemandCoverageRatio = Math.max(0, Math.min(1, powerCoverageRatio, plugCoverageRatio, batteryEnergyCoverageRatio));
    let deliveredEnergyServedKwh = d.annualEnergyDemandedKwh * rawServedDemandCoverageRatio * availabilityFactor;
    const gridOnlyPlateauEligible = (config.batteryStrategy === "Grid only" || envelope.unitsMax === 0);
    const capacityConstrainedThisYear = rawServedDemandCoverageRatio < 0.999 && d.annualEnergyDemandedKwh > 0;
    if (gridOnlyPlateauEligible) {
      if (capacityConstrainedThisYear) {
        gridOnlyCapacityPlateauKwh = Math.max(gridOnlyCapacityPlateauKwh, deliveredEnergyServedKwh);
        deliveredEnergyServedKwh = Math.min(d.annualEnergyDemandedKwh, gridOnlyCapacityPlateauKwh);
      } else {
        gridOnlyCapacityPlateauKwh = Math.max(gridOnlyCapacityPlateauKwh, deliveredEnergyServedKwh);
      }
    }
    const servedDemandCoverageRatio = d.annualEnergyDemandedKwh > 0 ? deliveredEnergyServedKwh / d.annualEnergyDemandedKwh : 1;
    const sessionsServed = deliveredEnergyServedKwh / inputs.averageSessionEnergy;
    const lostEnergyKwh = Math.max(0, d.annualEnergyDemandedKwh - deliveredEnergyServedKwh);
    const lostSessions = Math.max(0, d.annualSessionsDemanded - sessionsServed);

    const energyRevenue = deliveredEnergyServedKwh * inputs.netSellingPriceExVat * Math.pow(1 + inputs.annualTariffEscalation, idx);
    const totalRevenue = energyRevenue;
    const electricityCost = deliveredEnergyServedKwh * inputs.electricityCost * Math.pow(1 + inputs.annualElectricityCostEscalation, idx);
    const grossProfit = totalRevenue - electricityCost;

    const chargerSlaPpmSupport = derived.chargerSlaPpmCost;
    const managedService = derived.managedService;
    const batteryAnnualService = totals.units > 0 ? derived.batteryAnnualService : 0;
    const duosStandingCharge = 1320.36;
    const duosCapacityCharge = selectedMicKva * 49.28;
    const groundRent = derived.groundRent;
    const transactionProcessingFee = totalRevenue * inputs.transactionProcessingFeePctRevenue;
    const flatTransactionFee = sessionsServed * inputs.flatTransactionFeePerSession;
    // Landlord GP share and gross-sales share are mutually exclusive commercial structures.
    // If both inputs are non-zero, gross-sales share takes precedence to avoid double counting.
    const landlordGrossSalesShare = inputs.landlordGrossSalesShare > 0 ? totalRevenue * inputs.landlordGrossSalesShare : 0;
    const landlordGpShare = inputs.landlordGrossSalesShare > 0 ? 0 : Math.max(0, grossProfit) * inputs.landlordGpShare;
    const extendedChargerWarranty = config.chargerWarrantyYears === 0 ? 0 : (yearNumber <= config.chargerWarrantyYears ? derived.annualChargerWarrantyCost : 0);
    const extendedBatteryWarranty = (config.batteryWarrantyYears === 0 || config.batteryStrategy === "Grid only") ? 0 : (yearNumber <= config.batteryWarrantyYears ? totals.units * (derived.annualBatteryWarrantyCost / Math.max(1, envelope.unitsMax)) : 0);
    const totalOperatingCosts = chargerSlaPpmSupport + managedService + batteryAnnualService + duosStandingCharge + duosCapacityCharge + groundRent + transactionProcessingFee + flatTransactionFee + landlordGpShare + landlordGrossSalesShare + extendedChargerWarranty + extendedBatteryWarranty;

    const initialBatteryProvisionCapex = 0;
    const augmentationCapexAtCod = idx === 0 && batteryDeploymentMode === "staged-envelope" ? augmentationCapex : 0;
    if (idx === 0) {
      grossInitialInvestmentBeforeGrant = grossBaseInitialCapex + augmentationCapexAtCod;
      appliedGrantSupport = Math.min(requestedGrantSupport, grossInitialInvestmentBeforeGrant);
    }
    const grossInitialInvestmentCapex = idx === 0 ? grossInitialInvestmentBeforeGrant : 0;
    const initialInvestmentCapex = idx === 0 ? Math.max(0, grossInitialInvestmentBeforeGrant - appliedGrantSupport) : 0;
    const validChargerReplacementCapex = isValidConfiguration && Number.isFinite(Number(derived.chargerReplacementCapex)) && derived.chargerReplacementCapex > 0;
    const replacementCycleYears = Math.max(1, Number(inputs.chargerEquipmentReplacementCycleYears || 10));
    const chargerReplacementTrigger = (validChargerReplacementCapex && (yearNumber % replacementCycleYears === 0)) ? 1 : 0;
    const chargerReplacementCapex = chargerReplacementTrigger === 1 ? derived.chargerReplacementCapex : 0;
    const postCodAugmentationCapex = idx === 0 ? 0 : augmentationCapex;
    const totalCapex = initialInvestmentCapex + batteryReplacementCapex + chargerReplacementCapex + postCodAugmentationCapex;
    const grossTotalCapex = grossInitialInvestmentCapex + batteryReplacementCapex + chargerReplacementCapex + postCodAugmentationCapex;
    const operatingProfit = grossProfit - totalOperatingCosts;
    const postInitialAnnualCashFlow = operatingProfit - batteryReplacementCapex - chargerReplacementCapex - postCodAugmentationCapex;
    const annualCashFlow = operatingProfit - totalCapex;
    cumulativeCashFlow += annualCashFlow;
    const breakEvenMarker = cumulativeCashFlow >= 0 && (idx === 0 || rows[idx - 1].cumulativeCashFlow < 0) ? "★ BREAKEVEN" : "";
    const helperChargerReplacementYear = chargerReplacementTrigger ? year : 9999;
    const helperBatteryReplacementYear = batteryReplacementTrigger ? year : 9999;
    const helperBreakEvenYear = cumulativeCashFlow >= 0 ? year : 9999;

    const row = {
      yearNumber, year, configurationValid: isValidConfiguration, configurationInvalidReasons: configurationValidity.reasons || [], batterySohStart, annualSohDegradation, batterySohEnd, batteryReplacementTrigger,
      effectiveBatterySoh: batterySohEnd, augmentationFlag, batteryPowerDeficitKw, batteryEnergyDeficitKwh,
      additionalBatteryCabinetsNeeded: totals.units,
      installedBatteryUnits: totals.units,
      newBatteryUnitsInstalled,
      batteryReplacementUnits,
      newAugmentationCabinets: newBatteryUnitsInstalled,
      augmentationNote: newBatteryUnitsInstalled > 0 ? `INSTALL ${newBatteryUnitsInstalled} BATTERY UNIT(S)` : "",
      augmentationCapex, augmentationCapexAtCod, postCodAugmentationCapex,
      installedChargerPowerKw, selectedMicKva, batteryInverterPowerKw, batteryNominalEnergyKwh, batteryUsableEnergyKwh: batteryDispatchableEnergyKwh,
      batteryUsableFraction: batteryUsableFraction(inputs), availabilityFactor,
      peakWindowEnergyDemandKwh, batteryEnergyAvailableKwhSohAdjusted, batteryEnergyCoverageRatio,
      batterySustainDurationAtFullOutputHrs, peakWindowDurationHrs, gridPowerAvailableForRechargeKw,
      batteryEnergyToRechargeKwh, overnightRechargeDeliverableKwh, totalAvailableSitePowerKw,
      peakDemandRequiredKw, batteryPowerRequiredKw, batteryPowerSurplusDeficitKw, requiredMicNoBatteryKva,
      powerCoverageRatio, plugCoverageRatio, batteryEnergyCoverageRatio, servedDemandCoverageRatio,
      deliveredEnergyServedKwh, sessionsServed, lostEnergyKwh, lostSessions,
      energyRevenue, totalRevenue, electricityCost, grossProfit, chargerSlaPpmSupport, managedService,
      batteryAnnualService, duosStandingCharge, duosCapacityCharge, groundRent, transactionProcessingFee,
      flatTransactionFee, landlordGpShare, landlordGrossSalesShare, extendedChargerWarranty,
      extendedBatteryWarranty, totalOperatingCosts, grossInitialInvestmentCapex, initialInvestmentCapex, grantApplied: idx === 0 ? appliedGrantSupport : 0, initialBatteryProvisionCapex, batteryReplacementCapex,
      chargerReplacementTrigger, chargerReplacementCapex, totalCapex, grossTotalCapex, operatingProfit, postInitialAnnualCashFlow, annualCashFlow,
      cumulativeCashFlow, breakEvenMarker, helperChargerReplacementYear, helperBatteryReplacementYear,
      helperBreakEvenYear, demandedSessions: d.annualSessionsDemanded, demandedEnergyKwh: d.annualEnergyDemandedKwh,
      requiredPlugs: d.peakConcurrentSessions, bevShare: d.bevShare, relevantTraffic: d.relevantTraffic
    };

    rows.push(row);
  });

  return {
    rows,
    derived,
    technical: technicalChecks(config, inputs, demand),
    batteryDeploymentMode,
    grantRequested: requestedGrantSupport,
    grantApplied: appliedGrantSupport,
    grantUnapplied: Math.max(0, requestedGrantSupport - appliedGrantSupport),
    grossInitialInvestmentBeforeGrant,
    reliabilityAvailabilityFactor: availabilityFactor,
    rechargeWindowHours
  };
}

export function summariseFinancials(inputs, config, demand, yearByYear, horizon = inputs.investmentHorizon) {
  const rows = yearByYear.rows.slice(0, Math.max(1, Number(horizon || 1)));
  const initialInvestment = Math.max(0, Number(rows[0]?.initialInvestmentCapex || 0));
  const grossInitialInvestmentBeforeGrant = Math.max(0, Number(rows[0]?.grossInitialInvestmentCapex || yearByYear.grossInitialInvestmentBeforeGrant || 0));
  const grantRequested = Math.max(0, Number(yearByYear.grantRequested ?? inputs.grantSupport ?? 0));
  const grantApplied = Math.max(0, Number(yearByYear.grantApplied ?? rows[0]?.grantApplied ?? 0));
  const grantUnapplied = Math.max(0, grantRequested - grantApplied);

  // Project-finance timing convention: construction funding is period 0;
  // operating cash flow is received at each year end. Later replacement and
  // augmentation capex remains in the year in which it is incurred.
  const operatingCashflows = rows.map((r, idx) => Number(r.operatingProfit || 0) - (idx === 0 ? 0 : Number(r.totalCapex || 0)));
  const projectCashflows = [-initialInvestment, ...operatingCashflows];
  const discountRate = Number(inputs.discountRate || 0);
  const npvValue = npv(projectCashflows, discountRate);
  const irrValue = irr(projectCashflows);

  const cumulativeByYear = [];
  let running = -initialInvestment;
  rows.forEach((r, idx) => {
    running += operatingCashflows[idx];
    cumulativeByYear.push(running);
  });
  const paybackIndex = cumulativeByYear.findIndex(v => v >= 0);
  let paybackYears = null;
  if (paybackIndex >= 0) {
    const previous = paybackIndex === 0 ? -initialInvestment : cumulativeByYear[paybackIndex - 1];
    const currentYearCashflow = operatingCashflows[paybackIndex];
    paybackYears = paybackIndex + (currentYearCashflow > 0 ? Math.max(0, Math.min(1, -previous / currentYearCashflow)) : 1);
  }

  const batteryReplacementYears = rows.filter(r => r.batteryReplacementTrigger === 1).map(r => r.year);
  const chargerReplacementYears = rows.filter(r => r.chargerReplacementTrigger === 1).map(r => r.year);
  const capexEvents = rows.filter(r => Number(r.grossTotalCapex || 0) > 0).map(r => ({
    year: r.year,
    amount: Number(r.grossTotalCapex || 0),
    operatorFundedAmount: Number(r.totalCapex || 0),
    grantApplied: Number(r.grantApplied || 0),
    reason: [
      r.grossInitialInvestmentCapex > 0 ? "initial investment" : "",
      r.batteryReplacementCapex > 0 ? "battery replacement" : "",
      r.chargerReplacementCapex > 0 ? "charger replacement" : "",
      r.postCodAugmentationCapex > 0 ? "battery augmentation" : "",
      r.augmentationCapexAtCod > 0 ? "battery deployment at COD" : ""
    ].filter(Boolean).join(", ")
  }));

  const grossTotalCapex = sum(rows.map(r => Number(r.grossTotalCapex || 0)));
  const operatorFundedTotalCapex = sum(rows.map(r => Number(r.totalCapex || 0)));
  const totalOpex = sum(rows.map(r => r.totalOperatingCosts));
  const totalRevenue = sum(rows.map(r => r.totalRevenue));
  const totalGrossProfit = sum(rows.map(r => r.grossProfit));
  const cumulativeCashFlow = projectCashflows.reduce((acc, value) => acc + value, 0);
  const totalDeliveredKwh = sum(rows.map(r => r.deliveredEnergyServedKwh));
  const totalDemandedKwh = sum(rows.map(r => r.demandedEnergyKwh));
  const roi = initialInvestment > 0 ? cumulativeCashFlow / initialInvestment : null;
  const roiOnGrossInitialCapex = grossInitialInvestmentBeforeGrant > 0 ? cumulativeCashFlow / grossInitialInvestmentBeforeGrant : null;

  const leaseTerm = Math.max(0, Math.floor(Number(inputs.leaseTerm || 0)));
  const securedLeaseHorizon = leaseTerm > 0 ? Math.min(rows.length, leaseTerm) : 0;
  const securedLeaseCashflows = securedLeaseHorizon > 0 ? projectCashflows.slice(0, securedLeaseHorizon + 1) : [];
  const securedLeaseCumulativeCashFlow = securedLeaseCashflows.length ? sum(securedLeaseCashflows) : null;
  const securedLeaseNpv = securedLeaseCashflows.length ? npv(securedLeaseCashflows, discountRate) : null;
  const securedLeaseIrr = securedLeaseCashflows.length ? irr(securedLeaseCashflows) : null;
  const postLeaseCashFlow = securedLeaseHorizon > 0 && securedLeaseHorizon < rows.length
    ? sum(projectCashflows.slice(securedLeaseHorizon + 1))
    : 0;

  return {
    horizon: rows.length,
    cashflowTimingConvention: "Period 0 construction; operating cash flow at year end",
    projectCashflows,
    initialInvestment,
    roi,
    roiOnGrossInitialCapex,
    grantSupport: grantApplied,
    grantRequested,
    grantApplied,
    grantUnapplied,
    grantCapped: grantUnapplied > 0,
    grossInitialInvestmentBeforeGrant,
    totalCapex: grossTotalCapex,
    grossTotalCapex,
    operatorFundedTotalCapex,
    totalOpex,
    totalRevenue,
    totalGrossProfit,
    year1DeliveredEnergy: rows[0]?.deliveredEnergyServedKwh ?? 0,
    year1Revenue: rows[0]?.totalRevenue ?? 0,
    year1GrossProfit: rows[0]?.grossProfit ?? 0,
    year1OperatingCost: rows[0]?.totalOperatingCosts ?? 0,
    year1AnnualCashFlow: operatingCashflows[0] ?? 0,
    cumulativeCashFlow,
    breakEvenYear: paybackIndex >= 0 ? rows[paybackIndex]?.year ?? null : null,
    simplePayback: paybackYears,
    paybackYears,
    firstBatteryReplacementYear: batteryReplacementYears[0] || null,
    batteryReplacementCount: batteryReplacementYears.length,
    chargerReplacementCount: chargerReplacementYears.length,
    firstChargerReplacementYear: chargerReplacementYears[0] || null,
    capexEvents,
    npv: npvValue,
    irr: irrValue,
    discountRate,
    npvIsUndiscounted: discountRate === 0,
    ebitda: sum(rows.map(r => r.operatingProfit)),
    totalReplacementCapex: sum(rows.map(r => r.batteryReplacementCapex + r.chargerReplacementCapex + r.postCodAugmentationCapex)),
    lifetimeKwhDelivered: totalDeliveredKwh,
    servedDemandPercentage: totalDemandedKwh > 0 ? totalDeliveredKwh / totalDemandedKwh : 1,
    lostDemandKwh: sum(rows.map(r => r.lostEnergyKwh)),
    lostRevenue: sum(rows.map(r => r.lostEnergyKwh * inputs.netSellingPriceExVat)),
    capexPerPlug: yearByYear.derived.installedOutputs > 0 ? grossTotalCapex / yearByYear.derived.installedOutputs : 0,
    capexPerAnnualKwhDelivered: rows[0]?.deliveredEnergyServedKwh ? grossTotalCapex / rows[0].deliveredEnergyServedKwh : 0,
    averageUtilisation: totalDeliveredKwh / Math.max(1, yearByYear.derived.installedChargerPowerKw * 8760 * rows.length),
    totalCostToServeDemand: operatorFundedTotalCapex + totalOpex,
    leaseTerm,
    securedLeaseHorizon,
    securedLeaseCumulativeCashFlow,
    securedLeaseNpv,
    securedLeaseIrr,
    postLeaseCashFlow,
    leaseCoversHorizon: leaseTerm >= rows.length,
    batteryDeploymentMode: yearByYear.batteryDeploymentMode,
    reliabilityAvailabilityFactor: yearByYear.reliabilityAvailabilityFactor,
    rechargeWindowHours: yearByYear.rechargeWindowHours
  };
}
