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
  // Landlord commercial shares default to zero. Populate manually only when site-specific terms exist.
  landlordGpShare: 0,
  landlordGrossSalesShare: 0,
  transactionProcessingFeePctRevenue: 0.008,
  flatTransactionFeePerSession: 0.25,
  managedServiceFeePerChargerAsset: 250,
  esbConnectionApplicationFee: 0,
  esbConnectionCostEscalationRate: 0.03,
  leaseTerm: 15,

  trafficSourceYear: 2016,
  rawCorridorTrafficAadt: 39800,
  benchmarkProfile: "auto",
  effectiveAadtCap: 0,
  benchmarkTargetSessionsPer1000Aadt: 0,
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
  kempowerTripleCabinetCount: "N/A",
  batterySize: "Autel 1x125kW/261kWh",
  serviceLevel: "Premium",
  selectedMicKva: 200,
  chargerWarrantyYears: 0,
  batteryWarrantyYears: 0,
  batteryDeploymentMode: "Staged as required"
};

export const EXCEL_REFERENCE = {
  defaultDemandYear1AnnualEnergy: 118225.14791224079,
  defaultDemandYear20PeakDemandKw: 621.1281823903814,
  defaultInitialInvestmentCapex: 275099.1625,
  defaultYear20CumulativeCashFlow: 1191222.5659317425,
  defaultFirstBatteryReplacementYear: 2044,
  defaultFirstChargerReplacementYear: 2035
};

export const ASSUMPTION_DICTIONARY = [
  ["netSellingPriceExVat", "Net selling price excluding VAT", "€/kWh", "Inputs!B9", "Portfolio-calibrated default from ePower operating hub €/kWh; revenue uses net price."],
  ["electricityCost", "Electricity cost", "€/kWh", "Inputs!B10", "Buy price net of VAT."],
  ["rawCorridorTrafficAadt", "Raw corridor traffic AADT", "veh/day", "Inputs!B26", "Traffic count used as demand source."],
  ["benchmarkProfile", "Site-type benchmark profile", "profile", "Demand", "Selected site-type benchmark used to load relevance, capture and effective AADT cap."],
  ["effectiveAadtCap", "Effective AADT cap", "veh/day", "Demand", "Caps the raw matched AADT used in the demand calculation where only part of the passing traffic is commercially relevant."],
  ["benchmarkTargetSessionsPer1000Aadt", "Target sessions per 1,000 AADT", "sessions/1k AADT", "Demand", "Peer benchmark capture metric used for guidance and diagnostics."],
  ["siteRelevanceFactor", "Site relevance factor", "%", "Inputs!B28", "What it does: filters corridor traffic to site-relevant traffic. Basis: calibrated with capture from ePower hub data + matched AADT."],
  ["annualBevShareGrowthRate", "Annual BEV share growth rate", "%", "Inputs!B30", "What it does: grows BEV traffic share over time. Basis: planning assumption retained after portfolio calibration."],
  ["batteryReplacementThresholdSoh", "Battery replacement threshold (SOH)", "%", "Inputs!B56", "Replacement is based on state of health, not SOC."],
  ["selectedMicKva", "Selected MIC", "kVA", "Summary!B12", "Must be one of the Excel MIC values only."],
  ["esbConnectionCostEscalationRate", "ESB connection cost escalation", "%", "Model", "Escalates historical ex-VAT ESB quotation medians from the quote base year to the model start year."]
];


const ASSUMPTION_METADATA_OVERRIDES = {
  siteAddress: { basisType: "Measured", source: "User-selected site", status: "active" },
  rawCorridorTrafficAadt: { basisType: "Measured", source: "TII counter or manual override", status: "active" },
  trafficSourceYear: { basisType: "Measured", source: "TII source year", status: "active" },
  benchmarkProfile: { basisType: "Portfolio calibrated", source: "Operating hub segment benchmarks", status: "active" },
  effectiveAadtCap: { basisType: "Portfolio calibrated", source: "Site-type benchmark", status: "active" },
  siteRelevanceFactor: { basisType: "Portfolio calibrated", source: "Operating hub calibration", status: "active" },
  siteCaptureRate: { basisType: "Portfolio calibrated", source: "Operating hub calibration", status: "active" },
  averageSessionEnergy: { basisType: "Portfolio calibrated", source: "Operating hub sessions", status: "active" },
  netSellingPriceExVat: { basisType: "Commercial assumption", source: "Operator tariff", status: "active" },
  grossSellingPriceInclVat: { basisType: "Commercial assumption", source: "Displayed tariff", status: "reference" },
  electricityCost: { basisType: "Commercial assumption", source: "Energy procurement", status: "active" },
  grantSupport: { basisType: "Measured", source: "Confirmed grant or manual input", status: "active" },
  groundRentPerEvSpace: { basisType: "Commercial assumption", source: "Lease terms", status: "active" },
  landlordGpShare: { basisType: "Commercial assumption", source: "Lease terms", status: "active" },
  landlordGrossSalesShare: { basisType: "Commercial assumption", source: "Lease terms", status: "active" },
  leaseTerm: { basisType: "Commercial assumption", source: "Secured lease", status: "active" },
  discountRate: { basisType: "Investor assumption", source: "Required return", status: "active" },
  esbConnectionApplicationFee: { basisType: "Measured", source: "ESB application/connection quote", status: "active" },
  esbConnectionCostEscalationRate: { basisType: "Planning assumption", source: "Historical quotation escalation", status: "active" },
  powerFactor: { basisType: "Engineering assumption", source: "Electrical design", status: "active" },
  batteryReserve: { basisType: "Engineering assumption", source: "BESS operating policy", status: "active" },
  batteryDispatchFractionUsable: { basisType: "Engineering assumption", source: "BESS operating policy", status: "active" },
  batteryReplacementThresholdSoh: { basisType: "Engineering assumption", source: "Asset lifecycle policy", status: "active" },
  batteryBaseDegradationRate: { basisType: "Engineering assumption", source: "Battery lifecycle model", status: "active" },
  batteryCyclingDegradationFactor: { basisType: "Engineering assumption", source: "Battery lifecycle model", status: "active" },
  overnightRechargeWindowStart: { basisType: "Engineering assumption", source: "Site operating schedule", status: "active" },
  overnightRechargeWindowEnd: { basisType: "Engineering assumption", source: "Site operating schedule", status: "active" },
  overnightRechargeWindowDuration: { basisType: "Derived", source: "Start/end hours when available", status: "derived" },
  annualFailureRateStarting: { basisType: "Engineering assumption", source: "Reliability planning", status: "active" },
  downtimeImpactFactor: { basisType: "Engineering assumption", source: "Reliability planning", status: "active" },
  operatingHoursPerDay: { basisType: "Reference only", source: "Requires intraday demand profile", status: "reference" },
  batteryAugmentationTriggerDeficitKw: { basisType: "Reference only", source: "Commercial augmentation policy not activated", status: "reference" },
  benchmarkTargetSessionsPer1000Aadt: { basisType: "Diagnostic", source: "Portfolio comparison only", status: "diagnostic" },
  investmentHorizon: { basisType: "Investor assumption", source: "Selected analysis horizon", status: "active" },
  modelHorizon: { basisType: "Model control", source: "Forecast engine", status: "active" },
  modelStartYear: { basisType: "Model control", source: "Selected COD/start year", status: "active" },
  codYear: { basisType: "Derived", source: "Model start year", status: "derived" }
};

export const ASSUMPTION_METADATA = Object.fromEntries(
  Object.keys(DEFAULT_INPUTS).map(key => [key, {
    basisType: "Planning assumption",
    source: "Model default",
    status: "active",
    ...(ASSUMPTION_METADATA_OVERRIDES[key] || {})
  }])
);

export const CONFIG_ASSUMPTION_METADATA = Object.fromEntries(
  Object.keys(DEFAULT_SELECTED_CONFIG).map(key => [key, {
    basisType: "Engineering selection",
    source: "Product configuration",
    status: "active",
    ...({
      platform: { source: "Product platform library" },
      batteryStrategy: { source: "Grid/BESS architecture" },
      chargerModel: { source: "Product library" },
      chargerCount: { source: "Product configuration" },
      cabinetType: { source: "Product library" },
      dispenserCount: { source: "Product configuration" },
      kempowerTripleCabinetCount: { source: "Product configuration" },
      batterySize: { source: "Battery library" },
      batteryDeploymentMode: { basisType: "Commercial policy", source: "Installed at COD or staged" },
      selectedMicKva: { source: "Grid connection" },
      serviceLevel: { basisType: "Commercial assumption", source: "Service contract" },
      chargerWarrantyYears: { basisType: "Commercial assumption", source: "Warranty contract" },
      batteryWarrantyYears: { basisType: "Commercial assumption", source: "Warranty contract" }
    }[key] || {})
  }])
);
