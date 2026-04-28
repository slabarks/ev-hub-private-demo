import { deriveConfiguration, technicalChecks } from "./technicalEngine.js";
import { batteryItem } from "../data/batteryLibrary.js";
import { sum, npv, irr } from "../utils.js";

function batteryAugmentationUnit(config) {
  const name = config.batterySize || "";
  if (name.includes("Polarium")) return { powerKw: 150, energyKwh: 280, unitCost: 63730 };
  return { powerKw: 125, energyKwh: 261, unitCost: 52441.87 };
}

export function calculateYearByYear(inputs, config, demand) {
  const derived = deriveConfiguration(config, inputs);
  const unit = batteryAugmentationUnit(config);
  const rows = [];
  let previousEndSoh = 1;
  let previousReplacementTrigger = 0;
  let previousAugmentationCabinets = 0;
  let cumulativeCashFlow = 0;
  const firstYearStartSoh = 1;

  demand.years.forEach((d, idx) => {
    const yearNumber = idx + 1;
    const year = d.year;
    const batterySohStart = idx === 0 ? 1 : (previousReplacementTrigger === 1 ? 1 : previousEndSoh);
    const annualSohDegradation = inputs.batteryBaseDegradationRate + inputs.batteryCyclingDegradationFactor * Math.min(1, d.annualEnergyDemandedKwh / Math.max(1, derived.batteryEnergyKwh * 365));
    const batterySohEnd = Math.max(0, batterySohStart - annualSohDegradation);
    const batteryReplacementTrigger = (batterySohEnd <= inputs.batteryReplacementThresholdSoh && batterySohEnd > 0 && derived.batteryPowerKw > 0 && (idx === 0 || previousReplacementTrigger === 0)) ? 1 : 0;
    const effectiveBatterySoh = batterySohEnd;

    const batteryPowerDeficitKw = Math.max(0, d.peakDemandRequiredKw - config.selectedMicKva * inputs.powerFactor - derived.batteryPowerKw);
    const residualPeakWindowKwh = Math.max(0, d.annualEnergyDemandedKwh * inputs.peakWindowShare / 365 - config.selectedMicKva * inputs.powerFactor * 5);
    const batteryEnergyDeficitKwh = Math.max(0, residualPeakWindowKwh - derived.batteryEnergyKwh * firstYearStartSoh);
    const additionalBatteryCabinetsNeeded = (batteryPowerDeficitKw === 0 && batteryEnergyDeficitKwh === 0)
      ? 0
      : Math.max(
          batteryPowerDeficitKw > 0 ? Math.ceil(batteryPowerDeficitKw / unit.powerKw) : 0,
          batteryEnergyDeficitKwh > 0 ? Math.ceil(batteryEnergyDeficitKwh / unit.energyKwh) : 0
        );
    const augmentationFlag = additionalBatteryCabinetsNeeded > 0 ? "★ ADD BATTERY" : "";
    const augmentationCapex = idx === 0
      ? (additionalBatteryCabinetsNeeded > 0 ? additionalBatteryCabinetsNeeded * unit.unitCost : 0)
      : (additionalBatteryCabinetsNeeded > previousAugmentationCabinets ? (additionalBatteryCabinetsNeeded - previousAugmentationCabinets) * unit.unitCost : 0);

    const installedChargerPowerKw = derived.installedChargerPowerKw;
    const selectedMicKva = config.selectedMicKva;
    const batteryInverterPowerKw = derived.batteryPowerKw;
    const batteryUsableEnergyKwh = derived.batteryEnergyKwh;
    const peakWindowEnergyDemandKwh = d.annualEnergyDemandedKwh * inputs.peakWindowShare / 365;
    const batteryEnergyAvailableKwhSohAdjusted = 0;
    const batteryEnergyCoverageRatio = 1;
    const batterySustainDurationAtFullOutputHrs = augmentationCapex === 0 ? 0 : installedChargerPowerKw / Math.max(1, augmentationCapex);
    const peakWindowDurationHrs = 5;
    const gridPowerAvailableForRechargeKw = selectedMicKva * inputs.powerFactor;
    const batteryEnergyToRechargeKwh = 0;
    const overnightRechargeDeliverableKwh = peakWindowEnergyDemandKwh * inputs.overnightRechargeWindowDuration;
    const totalAvailableSitePowerKw = derived.totalAvailableSitePowerKw;
    const peakDemandRequiredKw = d.peakDemandRequiredKw;
    const batteryPowerRequiredKw = Math.max(0, peakDemandRequiredKw - selectedMicKva * inputs.powerFactor);
    const batteryPowerSurplusDeficitKw = derived.batteryPowerKw - gridPowerAvailableForRechargeKw;
    const requiredMicNoBatteryKva = d.requiredMicNoBatteryKva;
    const powerCoverageRatio = Math.min(1, totalAvailableSitePowerKw / Math.max(1, peakDemandRequiredKw));
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
    const batteryAnnualService = derived.batteryAnnualService;
    const duosStandingCharge = 1320.36;
    const duosCapacityCharge = selectedMicKva * 49.28;
    const groundRent = derived.groundRent;
    const transactionProcessingFee = deliveredEnergyServedKwh * inputs.transactionProcessingFeePctRevenue;
    const flatTransactionFee = sessionsServed * inputs.flatTransactionFeePerSession;
    const landlordGpShare = grossProfit * inputs.landlordGpShare;
    const landlordGrossSalesShare = deliveredEnergyServedKwh * inputs.landlordGrossSalesShare;
    const extendedChargerWarranty = config.chargerWarrantyYears === 0 ? 0 : (yearNumber <= config.chargerWarrantyYears ? derived.annualChargerWarrantyCost : 0);
    const extendedBatteryWarranty = (config.batteryWarrantyYears === 0 || config.batteryStrategy === "Grid only") ? 0 : (yearNumber <= config.batteryWarrantyYears ? derived.annualBatteryWarrantyCost : 0);
    const totalOperatingCosts = chargerSlaPpmSupport + managedService + batteryAnnualService + duosStandingCharge + duosCapacityCharge + groundRent + transactionProcessingFee + flatTransactionFee + landlordGpShare + landlordGrossSalesShare + extendedChargerWarranty + extendedBatteryWarranty;

    const initialInvestmentCapex = idx === 0 ? derived.initialInvestmentCapex - inputs.grantSupport : 0;
    const batteryReplacementCapex = batteryReplacementTrigger === 1 ? derived.batteryReplacementUnitCapex : 0;
    const chargerReplacementTrigger = (yearNumber % inputs.chargerEquipmentReplacementCycleYears === 0) ? 1 : 0;
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
      yearNumber,
      year,
      batterySohStart,
      annualSohDegradation,
      batterySohEnd,
      batteryReplacementTrigger,
      effectiveBatterySoh,
      augmentationFlag,
      batteryPowerDeficitKw,
      batteryEnergyDeficitKwh,
      additionalBatteryCabinetsNeeded,
      augmentationNote: additionalBatteryCabinetsNeeded > 0 ? `★ ADD ${additionalBatteryCabinetsNeeded} CABINET(S)` : "",
      augmentationCapex,
      installedChargerPowerKw,
      selectedMicKva,
      batteryInverterPowerKw,
      batteryUsableEnergyKwh,
      peakWindowEnergyDemandKwh,
      batteryEnergyAvailableKwhSohAdjusted,
      batteryEnergyCoverageRatio,
      batterySustainDurationAtFullOutputHrs,
      peakWindowDurationHrs,
      gridPowerAvailableForRechargeKw,
      batteryEnergyToRechargeKwh,
      overnightRechargeDeliverableKwh,
      totalAvailableSitePowerKw,
      peakDemandRequiredKw,
      batteryPowerRequiredKw,
      batteryPowerSurplusDeficitKw,
      requiredMicNoBatteryKva,
      powerCoverageRatio,
      deliveredEnergyServedKwh,
      sessionsServed,
      lostEnergyKwh,
      lostSessions,
      energyRevenue,
      totalRevenue,
      electricityCost,
      grossProfit,
      chargerSlaPpmSupport,
      managedService,
      batteryAnnualService,
      duosStandingCharge,
      duosCapacityCharge,
      groundRent,
      transactionProcessingFee,
      flatTransactionFee,
      landlordGpShare,
      landlordGrossSalesShare,
      extendedChargerWarranty,
      extendedBatteryWarranty,
      totalOperatingCosts,
      initialInvestmentCapex,
      batteryReplacementCapex,
      chargerReplacementTrigger,
      chargerReplacementCapex,
      totalCapex,
      operatingProfit,
      annualCashFlow,
      cumulativeCashFlow,
      breakEvenMarker,
      helperChargerReplacementYear,
      helperBatteryReplacementYear,
      helperBreakEvenYear,
      demandedSessions: d.annualSessionsDemanded,
      demandedEnergyKwh: d.annualEnergyDemandedKwh,
      requiredPlugs: d.peakConcurrentSessions,
      bevShare: d.bevShare,
      relevantTraffic: d.relevantTraffic
    };

    rows.push(row);
    previousEndSoh = batterySohEnd;
    previousReplacementTrigger = batteryReplacementTrigger;
    previousAugmentationCabinets = additionalBatteryCabinetsNeeded;
  });

  return {
    rows,
    derived,
    technical: technicalChecks(config, inputs, demand)
  };
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
      r.augmentationCapex > 0 ? "battery augmentation" : ""
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
