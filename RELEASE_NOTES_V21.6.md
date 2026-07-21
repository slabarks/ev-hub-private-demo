# V21.6 release notes — Prediction Enhanced

## Release basis

V21.6 was developed from the user-supplied **V21.5 Baseline Frozen Release**. The approved interface remains the visual baseline.

### UI scope

No broad UI redesign was made. Existing navigation, cards, tables, filters and Portfolio Financial Performance presentation were retained. The only approved visible addition is in **Portfolio Calibration**:

- compact maturity/repeatability labels;
- evidence and explanation in the existing site detail window.

## Forecasting improvements

### Explainable ensemble

The Next 12m engine now combines transparent candidate forecasts:

- annual actual basis;
- recent 30-day run-rate;
- recent 90-day run-rate;
- seasonal-naive persistence;
- controlled trend;
- empirical maturity-ramp trajectory.

The final weights are selected from historical performance for the closest available horizon, age and category evidence. Bias correction is shrunk toward zero and capped to avoid unstable over-adjustment.

### Rolling-origin, no-lookahead backtesting

- Historical forecasts are recreated at multiple prior dates.
- Each recreation uses only data available at that date.
- Model selection and confidence evaluation are performed leave-one-site-out.
- Three-, six- and twelve-month performance is retained separately.

### Empirical uncertainty

- Forecast bands use observed historical errors when sufficient independent evidence exists.
- Conservative age-based uncertainty floors remain in place.
- Ranges can be asymmetric where historical under- and overforecast errors are asymmetric.
- Limited evidence is explicitly preserved as limited evidence rather than presented as false precision.

## Maturity and repeatability

### New classification framework

- Early evidence
- Ramping
- Stabilising
- Repeatable / mature
- Late-ramping
- Declining / disrupted
- Capacity-constrained

Classification incorporates:

- operating history and complete months;
- data coverage;
- seasonally adjusted recent-block stability;
- robust monthly volatility;
- repeated stability checks across assessment dates;
- possible disruption or charger-reporting changes;
- installed technical capacity.

### Mature run-rate and curve

- P25, P50 and P75 current-condition mature run-rates are estimated.
- The empirical maturity curve converges naturally.
- The previous artificial month-24 jump to 100% has been removed.
- Commercial demand potential and technical delivery capacity are calculated separately.

## Data-quality improvements

Daily histories now retain:

- reporting charger count;
- active charger count.

These support detection of:

- missing source-date coverage;
- prolonged zero-delivery periods;
- material session-energy anomalies;
- persistent charger-count increases or decreases.

Possible disruptions reduce confidence and are exposed in the Portfolio Calibration evidence rather than silently becoming a demand trend.

## Model governance

The application can preserve the model version, assumptions and first-available forecast baseline for future performance review. It does not claim a baseline captured after approval was the original board-approved investment case.

## Unchanged

- V21.5 visual design and information density.
- Portfolio Financial Performance cards and columns.
- Funding, CAPEX, OPEX and technical-engine presentation.
- Browser-local dashboard ZIP/XLSX upload.
- Phased 1% traffic-growth treatment, applied once.
- Existing detailed forecast graph and audit controls.
