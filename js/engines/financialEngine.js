import { deriveConfiguration, technicalChecks, validateConfiguration } from "./technicalEngine.js";
import { batteryItem } from "../data/batteryLibrary.js";
import { sum, npv, irr } from "../utils.js";

function batteryEnvelope(config) {
  const battery = batteryItem(config.batterySize);
  const selectedPowerKw = Number(battery.powerKw || 0);
  const selectedEnergyKwh = Number(battery.energyKwh || 0);
  if (!selectedPowerKw || !selectedEnergyKwh || config.batteryStrategy === "Grid only") {
    return { unitsMax: 0, unitPowerKw: 0, unitEnergyKwh: 0, unitDeploymentCapex: 0, unitReplacementCapex: 0, unitServiceCost: 0, battery };
  }

  // Autel batteries are selected in 125 kW / 261 kWh modules.
  // Polarium selections are treated as multiples of the smallest 150 kW / 280 kWh block.
  const unitPowerKw = String(config.batterySize || "").includes("Polarium") ? 150 : 125;
  const unitEnergyKwh = String(config.batterySize || "").includes("Polarium") ? 280 : 261;
  const unitsMax = Math.max(1, Math.round(selectedPowerKw / unitPowerKw));
  const totalInitialBatteryCapex = Number(battery.hardwareCost || 0)
    + Number(battery.installComm || 0)
    + Number(battery.logisticsCost || 0)
    + Number(battery.installCommissioning || 0);
  const unitDeploymentCapex = totalInitialBatteryCapex / unitsMax;
  const unitReplacementCapex = Number(battery.hardwareCost || 0) / unitsMax;
  const unitServiceCost = unitPowerKw === 150 ? 350 : 420;
  return { unitsMax, unitPowerKw, unitEnergyKwh, unitDeploymentCapex, unitReplacementCapex, unitServiceCost, battery };
}

function activeBatteryTotals(cohorts) {
  return cohorts.reduce((acc, c) => {
    acc.units += c.units;
    acc.powerKw += c.units * c.unitPowerKw;
    acc.nominalEnergyKwh += c.units * c.unitEnergyKwh;
    acc.sohAdjustedEnergyKwh += c.units * c.unitEnergyKwh * c.soh;
    return acc;
  }, { units: 0, powerKw: 0, nominalEnergyKwh: 0, sohAdjustedEnergyKwh: 0 });
}

function weightedAverageSoh(cohorts) {
  const totals = activeBatteryTotals(cohorts);
  if (!totals.units) return 0;
  return cohorts.reduce((acc, c) => acc + c.soh * c.units, 0) / totals.units;
}

export function calculateYearByYear(inputs, config, demand) {
  const derived = deriveConfiguration(config, inputs);
  const configurationValidity = validateConfiguration(config);
  const isValidConfiguration = configurationValidity.valid;
  const envelope = batteryEnvelope(config);
  const noBatteryDerived = envelope.unitsMax > 0
    ? deriveConfiguration({ ...config, batteryStrategy: "Grid only", batterySize: "No battery", batteryWarrantyYears: 0 }, inputs)
    : derived;
  const stagedBatteryDeploymentUnitCapex = envelope.unitsMax > 0
    ? Math.max(envelope.unitDeploymentCapex, (derived.initialInvestmentCapex - noBatteryDerived.initialInvestmentCapex) / envelope.unitsMax)
    : 0;
  const rows = [];
  const batteryCohorts = [];
  let cumulativeCashFlow = 0;
  const peakWindowDurationHrs = Number(inputs.peakWindowEndHour ?? inputs.peakWindowHours ?? 5) || 5;
  const nonBatteryInitialCapex = noBatteryDerived.initialInvestmentCapex;

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
    let before = activeBatteryTotals(batteryCohorts);
    const powerUnitsNeeded = envelope.unitPowerKw > 0 ? Math.ceil(Math.max(0, batteryPowerRequiredKw - before.powerKw) / envelope.unitPowerKw) : 0;
    const energyUnitsNeeded = envelope.unitEnergyKwh > 0 ? Math.ceil(Math.max(0, residualPeakWindowKwh - before.sohAdjustedEnergyKwh) / envelope.unitEnergyKwh) : 0;
    const desiredAdditionalUnits = Math.max(powerUnitsNeeded, energyUnitsNeeded);
    const remainingEnvelopeUnits = Math.max(0, envelope.unitsMax - before.units);
    const newBatteryUnitsInstalled = Math.min(remainingEnvelopeUnits, desiredAdditionalUnits);
    const augmentationFlag = newBatteryUnitsInstalled > 0 ? "AUGMENT" : "";
    const augmentationCapex = newBatteryUnitsInstalled * stagedBatteryDeploymentUnitCapex;
    if (newBatteryUnitsInstalled > 0) {
      batteryCohorts.push({
        installYear: year,
        units: newBatteryUnitsInstalled,
        unitPowerKw: envelope.unitPowerKw,
        unitEnergyKwh: envelope.unitEnergyKwh,
        unitDeploymentCapex: stagedBatteryDeploymentUnitCapex,
        unitReplacementCapex: envelope.unitReplacementCapex,
        soh: 1,
        sohStart: 1,
        annualSohDegradation: 0,
        replacedThisYear: false
      });
    }

    const totals = activeBatteryTotals(batteryCohorts);
    const batteryInverterPowerKw = totals.powerKw;
    const batteryUsableEnergyKwh = totals.nominalEnergyKwh;
    const batteryEnergyAvailableKwhSohAdjusted = totals.sohAdjustedEnergyKwh;
    const batterySohStart = batteryCohorts.length ? batteryCohorts.reduce((acc, c) => acc + (c.sohStart ?? c.soh) * c.units, 0) / Math.max(1, totals.units) : 0;
    const batterySohEnd = weightedAverageSoh(batteryCohorts);
    const annualSohDegradation = batterySohStart > 0 ? Math.max(0, batterySohStart - batterySohEnd) : 0;
    const batteryReplacementTrigger = batteryReplacementUnits > 0 ? 1 : 0;
    const batteryPowerDeficitKw = Math.max(0, batteryPowerRequiredKw - batteryInverterPowerKw);
    const batteryEnergyDeficitKwh = Math.max(0, residualPeakWindowKwh - batteryEnergyAvailableKwhSohAdjusted);

    const installedChargerPowerKw = derived.installedChargerPowerKw;
    const batteryEnergyCoverageRatio = residualPeakWindowKwh > 0 ? Math.min(1, batteryEnergyAvailableKwhSohAdjusted / Math.max(1, residualPeakWindowKwh)) : 1;
    const batterySustainDurationAtFullOutputHrs = batteryInverterPowerKw > 0 ? batteryEnergyAvailableKwhSohAdjusted / Math.max(1, batteryInverterPowerKw) : 0;
    const gridPowerAvailableForRechargeKw = gridPowerKw;
    const batteryEnergyToRechargeKwh = Math.min(residualPeakWindowKwh, batteryEnergyAvailableKwhSohAdjusted);
    const overnightRechargeDeliverableKwh = gridPowerAvailableForRechargeKw * inputs.overnightRechargeWindowDuration;
    const totalAvailableSitePowerKw = gridPowerKw + batteryInverterPowerKw;
    const requiredMicNoBatteryKva = d.requiredMicNoBatteryKva;
    const batteryPowerSurplusDeficitKw = batteryInverterPowerKw - batteryPowerRequiredKw;
    const powerCoverageRatio = Math.min(1, Math.min(installedChargerPowerKw, totalAvailableSitePowerKw) / Math.max(1, peakDemandRequiredKw));
    const deliveredEnergyServedKwh = d.annualEnergyDemandedKwh * Math.min(powerCoverageRatio, batteryEnergyCoverageRatio);
    const sessionsServed = deliveredEnergyServedKwh / inputs.averageSessionEnergy;
    const lostEnergyKwh = Math.max(0, d.annualEnergyDemandedKwh - deliveredEnergyServedKwh);
    const lostSessions = Math.max(0, d.annualSessionsDemanded - sessionsServed);

    const energyRevenue = deliveredEnergyServedKwh * inputs.netSellingPriceExVat * Math.pow(1 + inputs.annualTariffEscalation, idx);
    const totalRevenue = energyRevenue;
    const electricityCost = deliveredEnergyServedKwh * inputs.electricityCost * Math.pow(1 + inputs.annualElectricityCostEscalation, idx);
    const grossProfit = totalRevenue - electricityCost;

    const chargerSlaPpmSupport = derived.chargerSlaPpmCost;
    const managedService = derived.managedService;
    const batteryAnnualService = totals.units * envelope.unitServiceCost;
    const duosStandingCharge = 1320.36;
    const duosCapacityCharge = selectedMicKva * 49.28;
    const groundRent = derived.groundRent;
    const transactionProcessingFee = deliveredEnergyServedKwh * inputs.transactionProcessingFeePctRevenue;
    const flatTransactionFee = sessionsServed * inputs.flatTransactionFeePerSession;
    const landlordGpShare = grossProfit * inputs.landlordGpShare;
    const landlordGrossSalesShare = deliveredEnergyServedKwh * inputs.landlordGrossSalesShare;
    const extendedChargerWarranty = config.chargerWarrantyYears === 0 ? 0 : (yearNumber <= config.chargerWarrantyYears ? derived.annualChargerWarrantyCost : 0);
    const extendedBatteryWarranty = (config.batteryWarrantyYears === 0 || config.batteryStrategy === "Grid only") ? 0 : (yearNumber <= config.batteryWarrantyYears ? totals.units * (derived.annualBatteryWarrantyCost / Math.max(1, envelope.unitsMax)) : 0);
    const totalOperatingCosts = chargerSlaPpmSupport + managedService + batteryAnnualService + duosStandingCharge + duosCapacityCharge + groundRent + transactionProcessingFee + flatTransactionFee + landlordGpShare + landlordGrossSalesShare + extendedChargerWarranty + extendedBatteryWarranty;

    const initialInvestmentCapex = idx === 0 ? nonBatteryInitialCapex - inputs.grantSupport : 0;
    const validChargerReplacementCapex = isValidConfiguration && Number.isFinite(Number(derived.chargerReplacementCapex)) && derived.chargerReplacementCapex > 0;
    const chargerReplacementTrigger = (validChargerReplacementCapex && (yearNumber % inputs.chargerEquipmentReplacementCycleYears === 0)) ? 1 : 0;
    const chargerReplacementCapex = chargerReplacementTrigger === 1 ? derived.chargerReplacementCapex : 0;
    const totalCapex = initialInvestmentCapex + batteryReplacementCapex + chargerReplacementCapex + augmentationCapex;
    const operatingProfit = grossProfit - totalOperatingCosts;
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
      augmentationCapex,
      installedChargerPowerKw, selectedMicKva, batteryInverterPowerKw, batteryUsableEnergyKwh,
      peakWindowEnergyDemandKwh, batteryEnergyAvailableKwhSohAdjusted, batteryEnergyCoverageRatio,
      batterySustainDurationAtFullOutputHrs, peakWindowDurationHrs, gridPowerAvailableForRechargeKw,
      batteryEnergyToRechargeKwh, overnightRechargeDeliverableKwh, totalAvailableSitePowerKw,
      peakDemandRequiredKw, batteryPowerRequiredKw, batteryPowerSurplusDeficitKw, requiredMicNoBatteryKva,
      powerCoverageRatio, deliveredEnergyServedKwh, sessionsServed, lostEnergyKwh, lostSessions,
      energyRevenue, totalRevenue, electricityCost, grossProfit, chargerSlaPpmSupport, managedService,
      batteryAnnualService, duosStandingCharge, duosCapacityCharge, groundRent, transactionProcessingFee,
      flatTransactionFee, landlordGpShare, landlordGrossSalesShare, extendedChargerWarranty,
      extendedBatteryWarranty, totalOperatingCosts, initialInvestmentCapex, batteryReplacementCapex,
      chargerReplacementTrigger, chargerReplacementCapex, totalCapex, operatingProfit, annualCashFlow,
      cumulativeCashFlow, breakEvenMarker, helperChargerReplacementYear, helperBatteryReplacementYear,
      helperBreakEvenYear, demandedSessions: d.annualSessionsDemanded, demandedEnergyKwh: d.annualEnergyDemandedKwh,
      requiredPlugs: d.peakConcurrentSessions, bevShare: d.bevShare, relevantTraffic: d.relevantTraffic
    };

    rows.push(row);
  });

  return { rows, derived, technical: technicalChecks(config, inputs, demand), batteryDeploymentMode: "staged-envelope" };
}

export function summariseFinancials(inputs, config, demand, yearByYear, horizon = inputs.investmentHorizon) {
  const rows = yearByYear.rows.slice(0, horizon);
  const cashflows = rows.map(r => r.annualCashFlow);
  const batteryReplacementYears = rows.filter(r => r.batteryReplacementTrigger === 1).map(r => r.year);
  const chargerReplacementYears = rows.filter(r => r.chargerReplacementTrigger === 1).map(r => r.year);
  const capexEvents = rows.filter(r => r.totalCapex > 0).map(r => ({
    year: r.year,
    amount: r.totalCapex,
    reason: [
      r.initialInvestmentCapex > 0 ? "initial investment" : "",
      r.batteryReplacementCapex > 0 ? "battery replacement" : "",
      r.chargerReplacementCapex > 0 ? "charger replacement" : "",
      r.augmentationCapex > 0 ? ((r.installedBatteryUnits || 0) === (r.newBatteryUnitsInstalled || 0) ? "battery deployment" : "battery augmentation") : ""
    ].filter(Boolean).join(", ")
  }));

  const totalCapex = sum(rows.map(r => r.totalCapex));
  const totalOpex = sum(rows.map(r => r.totalOperatingCosts));
  const totalRevenue = sum(rows.map(r => r.totalRevenue));
  const totalGrossProfit = sum(rows.map(r => r.grossProfit));
  const cumulativeCashFlow = rows.at(-1)?.cumulativeCashFlow ?? 0;
  const breakEvenRow = rows.find(r => r.cumulativeCashFlow >= 0);
  const totalDeliveredKwh = sum(rows.map(r => r.deliveredEnergyServedKwh));
  const totalDemandedKwh = sum(rows.map(r => r.demandedEnergyKwh));
  const simplePayback = breakEvenRow ? breakEvenRow.yearNumber : null;
  const npvValue = npv(cashflows, inputs.discountRate || 0);
  const irrValue = irr(cashflows);
  const netInitialInvestment = rows[0]?.initialInvestmentCapex ?? 0;
  const roi = netInitialInvestment > 0 ? cumulativeCashFlow / netInitialInvestment : null;

  return {
    horizon,
    initialInvestment: rows[0]?.initialInvestmentCapex ?? 0,
    roi,
    grantSupport: inputs.grantSupport,
    grossInitialInvestmentBeforeGrant: (rows[0]?.initialInvestmentCapex ?? 0) + inputs.grantSupport,
    totalCapex,
    totalOpex,
    totalRevenue,
    totalGrossProfit,
    year1DeliveredEnergy: rows[0]?.deliveredEnergyServedKwh ?? 0,
    year1Revenue: rows[0]?.totalRevenue ?? 0,
    year1GrossProfit: rows[0]?.grossProfit ?? 0,
    year1OperatingCost: rows[0]?.totalOperatingCosts ?? 0,
    year1AnnualCashFlow: rows[0]?.annualCashFlow ?? 0,
    cumulativeCashFlow,
    breakEvenYear: breakEvenRow ? breakEvenRow.year : null,
    simplePayback,
    firstBatteryReplacementYear: batteryReplacementYears[0] || null,
    batteryReplacementCount: batteryReplacementYears.length,
    chargerReplacementCount: chargerReplacementYears.length,
    firstChargerReplacementYear: chargerReplacementYears[0] || null,
    capexEvents,
    npv: npvValue,
    irr: irrValue,
    ebitda: sum(rows.map(r => r.operatingProfit)),
    totalReplacementCapex: sum(rows.map(r => r.batteryReplacementCapex + r.chargerReplacementCapex + r.augmentationCapex)),
    lifetimeKwhDelivered: totalDeliveredKwh,
    servedDemandPercentage: totalDemandedKwh > 0 ? totalDeliveredKwh / totalDemandedKwh : 1,
    lostDemandKwh: sum(rows.map(r => r.lostEnergyKwh)),
    lostRevenue: sum(rows.map(r => r.lostEnergyKwh * inputs.netSellingPriceExVat)),
    capexPerPlug: yearByYear.derived.installedOutputs > 0 ? totalCapex / yearByYear.derived.installedOutputs : 0,
    capexPerAnnualKwhDelivered: rows[0]?.deliveredEnergyServedKwh ? totalCapex / rows[0].deliveredEnergyServedKwh : 0,
    averageUtilisation: totalDeliveredKwh / Math.max(1, yearByYear.derived.installedChargerPowerKw * 8760 * horizon),
    totalCostToServeDemand: totalCapex + totalOpex - inputs.grantSupport
  };
}
