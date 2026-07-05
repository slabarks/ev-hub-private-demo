// Hidden ESB connection cost estimator derived from historical ESB quotation data supplied by the model owner.
// Source quotations are VAT-inclusive; values below are stored and used ex-VAT.
// Rows such as Waiting, N/A, TBC, blanks, malformed dates/costs, unsupported MICs and GBP values are excluded.

export const ESB_CONNECTION_COST_LIBRARY = {
  vatRate: 0.23,
  methodology: "Median/trimmed historical ESB quotation estimate by valid model MIC, converted from VAT-inclusive to ex-VAT.",
  annualEscalationDefault: 0.03,
  baseYear: 2025,
  micCostsExVat: {
    50: { micKva: 50, sampleBand: "49/50/55 kVA", sampleCount: 45, medianExVat: 4904.95, trimmedMeanExVat: 5220.00, notes: "49/50/55 kVA quotes, euro-only, outliers removed." },
    100: { micKva: 100, sampleBand: "99/100 kVA", sampleCount: 14, medianExVat: 8018.82, trimmedMeanExVat: 8050.00, notes: "99/100 kVA quotes normalised to 100 kVA." },
    150: { micKva: 150, sampleBand: "120/149/150/170 kVA", sampleCount: 8, medianExVat: 10314.66, trimmedMeanExVat: 10600.00, notes: "Smaller LV upgrade bands mapped to the model 150 kVA MIC." },
    200: { micKva: 200, sampleBand: "170/199/200 kVA", sampleCount: 160, medianExVat: 13013.75, trimmedMeanExVat: 13400.00, notes: "Dominated by 199 kVA quotations; large outliers trimmed." },
    400: { micKva: 400, sampleBand: "400 kVA", sampleCount: 7, medianExVat: 18621.38, trimmedMeanExVat: 18500.00, notes: "400 kVA quotation band." },
    800: { micKva: 800, sampleBand: "700/800 kVA", sampleCount: 8, medianExVat: 23860.84, trimmedMeanExVat: 25300.00, notes: "700/800 kVA quotations; extreme high outlier excluded from default estimate." },
    1000: { micKva: 1000, sampleBand: "800 kVA extrapolated", sampleCount: 0, medianExVat: 29826.05, trimmedMeanExVat: 31625.00, notes: "Extrapolated from the 800 kVA band due limited direct quote history." },
    1500: { micKva: 1500, sampleBand: "800 kVA extrapolated", sampleCount: 0, medianExVat: 41756.47, trimmedMeanExVat: 44275.00, notes: "Extrapolated from the 800 kVA band due limited direct quote history." }
  }
};

export function normaliseMicForEsbCost(micKva) {
  const value = Number(micKva);
  if (!Number.isFinite(value)) return 200;
  if (value <= 50) return 50;
  if (value <= 100) return 100;
  if (value <= 150) return 150;
  if (value <= 250) return 200;
  if (value <= 500) return 400;
  if (value <= 900) return 800;
  if (value <= 1200) return 1000;
  return 1500;
}

export function estimateEsbConnectionCostExVat(micKva, modelStartYear, escalationRate = ESB_CONNECTION_COST_LIBRARY.annualEscalationDefault, method = "median") {
  const band = normaliseMicForEsbCost(micKva);
  const record = ESB_CONNECTION_COST_LIBRARY.micCostsExVat[band] || ESB_CONNECTION_COST_LIBRARY.micCostsExVat[200];
  const base = method === "trimmedMean" ? record.trimmedMeanExVat : record.medianExVat;
  const year = Number(modelStartYear || new Date().getFullYear());
  const years = Math.max(0, year - ESB_CONNECTION_COST_LIBRARY.baseYear);
  const rate = Number.isFinite(Number(escalationRate)) ? Number(escalationRate) : ESB_CONNECTION_COST_LIBRARY.annualEscalationDefault;
  const cost = base * Math.pow(1 + rate, years);
  return {
    micBand: band,
    costExVat: cost,
    baseCostExVat: base,
    baseYear: ESB_CONNECTION_COST_LIBRARY.baseYear,
    escalationRate: rate,
    yearsEscalated: years,
    source: record.notes,
    sampleCount: record.sampleCount,
    methodology: ESB_CONNECTION_COST_LIBRARY.methodology
  };
}
