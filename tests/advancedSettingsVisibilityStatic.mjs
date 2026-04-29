import fs from 'fs';

const app = fs.readFileSync('js/app.js', 'utf8');
const groupBlockMatch = app.match(/const DEVELOPER_GROUPS = \[([\s\S]*?)\];/);
if (!groupBlockMatch) throw new Error('DEVELOPER_GROUPS block not found');
const groupBlock = groupBlockMatch[0];

const expectedVisible = [
  'annualTrafficGrowthRate',
  'siteRelevanceFactor',
  'onRoadBevShareAtCod',
  'bevShareCap',
  'fastChargePropensity',
  'rampUpYear1',
  'rampUpYear2',
  'plugInOverstayOverheadHours',
  'designPeakFloorSessions',
  'techUpliftEarlyPhaseRate',
  'techUpliftMiddlePhaseRate',
  'techUpliftCap',
  'durationResponseFactor',
  'powerFactor',
  'batteryDispatchFractionUsable',
  'batteryBaseDegradationRate',
  'batteryCyclingDegradationFactor',
  'overnightRechargeWindowDuration',
  'annualTariffEscalation',
  'annualElectricityCostEscalation',
  'discountRate',
  'transactionProcessingFeePctRevenue',
  'flatTransactionFeePerSession',
  'managedServiceFeePerChargerAsset',
  'autelChargerWarrantyAnnualRate',
  'kempowerChargerWarrantyAnnualRate',
  'autelBatteryWarrantyAnnualRate',
  'polariumBatteryWarrantyAnnualRate'
];

const hiddenKeys = [
  'modelHorizon',
  'grossSellingPriceInclVat',
  'gridThresholdModeling',
  'esbConnectionApplicationFee',
  'annualFailureRateStarting',
  'downtimeImpactFactor',
  'operatingHoursPerDay',
  'batteryAugmentationTriggerDeficitKw',
  'peakIntensityFactorCap',
  'batteryReserve',
  'overnightRechargeWindowStart',
  'overnightRechargeWindowEnd'
];

for (const key of expectedVisible) {
  if (!groupBlock.includes(`"${key}"`)) throw new Error(`Expected visible advanced setting missing: ${key}`);
}
for (const key of hiddenKeys) {
  if (groupBlock.includes(`"${key}"`)) throw new Error(`Hidden advanced setting still visible: ${key}`);
}
if (app.includes('Approved MIC library') || app.includes('Scenario comparison rule')) {
  throw new Error('Non-input Advanced Settings panels should not be rendered in the simplified tab');
}
console.log('Advanced settings visibility static regression passed.');
