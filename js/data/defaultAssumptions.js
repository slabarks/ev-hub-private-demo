export const MIC_VALUES = [50, 100, 200, 400, 800, 1000, 1500];
export const CURRENT_MODEL_YEAR = new Date().getFullYear();

export const DEFAULT_INPUTS = {
  siteAddress: "Unit A1/A2, Castlewest SC, Ballincollig, Cork, P31 YA47",
  operatingHoursPerDay: 24,
  modelStartYear: CURRENT_MODEL_YEAR,
  codYear: CURRENT_MODEL_YEAR,
  modelHorizon: 20,

  grossSellingPriceInclVat: 0.72,
  netSellingPriceExVat: 0.66,
  electricityCost: 0.25,
  annualTariffEscalation: 0,
  annualElectricityCostEscalation: 0,
  discountRate: 0,
  grantSupport: 0,

  groundRentPerEvSpace: 500,
  landlordGpShare: 0.03,
  landlordGrossSalesShare: 0.10,
  transactionProcessingFeePctRevenue: 0.008,
  flatTransactionFeePerSession: 0.25,
  managedServiceFeePerChargerAsset: 250,
  esbConnectionApplicationFee: 0,
  esbConnectionCostEscalationRate: 0.03,
  leaseTerm: 15,

  trafficSourceYear: 2016,
  rawCorridorTrafficAadt: 39800,
  annualTrafficGrowthRate: 0.01,
  siteRelevanceFactor: 0.30,
  onRoadBevShareAtCod: 0.04,
  annualBevShareGrowthRate: 0.18,
  bevShareCap: 0.25,
  fastChargePropensity: 0.22,
  siteCaptureRate: 0.18,
  siteLimitationFactor: 0.85,
  rampUpYear1: 0.60,
  rampUpYear2: 0.80,
  peakWindowShare: 0.50,
  peakHourShareWithinPeakWindow: 0.25,
  averageSessionEnergy: 30.4,
  plugInOverstayOverheadHours: 0.03,
  designPeakFloorSessions: 1,

  baseFleetPlanningPower: 60,
  techUpliftEarlyPhaseRate: 0.025,
  techUpliftMiddlePhaseRate: 0.01,
  techUpliftCap: 1.25,
  durationResponseFactor: 0.4,
  peakIntensityFactorCap: 1.1,
  annualFailureRateStarting: 0.10,
  downtimeImpactFactor: 0.35,

  gridThresholdModeling: 200,
  powerFactor: 0.98,
  batteryReserve: 0.10,
  batteryDispatchFractionUsable: 0.90,
  batteryReplacementThresholdSoh: 0.70,
  batteryBaseDegradationRate: 0.015,
  batteryCyclingDegradationFactor: 0.01,
  batteryAugmentationTriggerDeficitKw: 200,
  overnightRechargeWindowStart: 22,
  overnightRechargeWindowEnd: 6,
  overnightRechargeWindowDuration: 8,

  autelChargerWarrantyAnnualRate: 0.04,
  kempowerChargerWarrantyAnnualRate: 0.05,
  autelBatteryWarrantyAnnualRate: 0.05,
  polariumBatteryWarrantyAnnualRate: 0.05,

  chargerEquipmentReplacementCycleYears: 10,

  investmentHorizon: 20
};

export const DEFAULT_SELECTED_CONFIG = {
  platform: "Autel Distributed",
  batteryStrategy: "Grid + battery",
  chargerModel: "N/A",
  chargerCount: "N/A",
  cabinetType: "Autel Double Cabinet 480-960",
  dispenserCount: 6,
  batterySize: "Autel 1x125kW/261kWh",
  serviceLevel: "Premium",
  selectedMicKva: 200,
  chargerWarrantyYears: 0,
  batteryWarrantyYears: 0
};

export const EXCEL_REFERENCE = {
  defaultDemandYear1AnnualEnergy: 118225.14791224079,
  defaultDemandYear20PeakDemandKw: 621.1281823903814,
  defaultInitialInvestmentCapex: 323103.5225,
  defaultYear20CumulativeCashFlow: 1191222.5659317425,
  defaultFirstBatteryReplacementYear: 2044,
  defaultFirstChargerReplacementYear: 2035
};

export const ASSUMPTION_DICTIONARY = [
  ["netSellingPriceExVat", "Net selling price excluding VAT", "€/kWh", "Inputs!B9", "Portfolio-calibrated default from ePower operating hub €/kWh; revenue uses net price."],
  ["electricityCost", "Electricity cost", "€/kWh", "Inputs!B10", "Buy price net of VAT."],
  ["rawCorridorTrafficAadt", "Raw corridor traffic AADT", "veh/day", "Inputs!B26", "Traffic count used as demand source."],
  ["siteRelevanceFactor", "Site relevance factor", "%", "Inputs!B28", "What it does: filters corridor traffic to site-relevant traffic. Basis: calibrated with capture from ePower hub data + matched AADT."],
  ["annualBevShareGrowthRate", "Annual BEV share growth rate", "%", "Inputs!B30", "What it does: grows BEV traffic share over time. Basis: planning assumption retained after portfolio calibration."],
  ["batteryReplacementThresholdSoh", "Battery replacement threshold (SOH)", "%", "Inputs!B56", "Replacement is based on state of health, not SOC."],
  ["selectedMicKva", "Selected MIC", "kVA", "Summary!B12", "Must be one of the Excel MIC values only."],
  ["esbConnectionCostEscalationRate", "ESB connection cost escalation", "%", "Model", "Escalates historical ex-VAT ESB quotation medians from the quote base year to the model start year."]
];
