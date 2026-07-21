# EV Charging Hub Investment Tool — V21.6 Prediction Enhanced

V21.6 is built directly from the approved **V21.5 Baseline Frozen Release**. The familiar interface, navigation, cards, tables and Portfolio Financial Performance layout are preserved.

The release concentrates on improving prediction quality, maturity assessment and auditability using the operating data already available. The only intentional visible extension is in **Portfolio Calibration**, where each site can display a compact maturity/repeatability label and the existing detail window explains the evidence behind that classification.

## Build

- Application: `V21.6`
- Build: `EVHUB-V21.6-20260721-R1`
- Live-history schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.6`
- Package version: `21.6.0`

## Prediction-engine improvements

### Explainable ensemble forecast

The forward forecast evaluates multiple transparent candidate methods rather than relying on one fixed formula:

- annual actual basis;
- recent 30-day run-rate;
- recent 90-day run-rate;
- seasonal-naive persistence;
- bounded and decaying trend;
- empirical maturity-ramp challenger.

Weights and any conservative bias correction are selected from the closest available historical evidence by forecast horizon, site age and site category. The chosen method weights remain available to the calculation audit; no opaque machine-learning model is used.

### No-lookahead validation

Historical validation is performed with rolling forecast origins. At every origin, only information available by that date is used. Method performance and confidence are evaluated leave-one-site-out so a site is not used both to tune and independently assess its own forecast.

### Empirical confidence and maturity

- Forecast ranges use observed validation errors where enough independent evidence exists, while retaining conservative minimum uncertainty floors.
- Maturity curves converge naturally rather than being forced to jump to 100% at month 24.
- Mature commercial potential is represented as P25, P50 and P75 run-rates.
- Commercial demand potential is kept separate from the technical delivery ceiling.

### Repeatability classification

Portfolio Calibration can classify a site as:

- Early evidence
- Ramping
- Stabilising
- Repeatable / mature
- Late-ramping
- Declining / disrupted
- Capacity-constrained

The classification considers operating age, complete months, daily coverage, recent seasonally adjusted stability, robust volatility, repeated stability checks, possible disruptions and technical headroom.

### Data-quality and disruption checks

The daily parser now retains reporting and active charger counts. The engine can identify evidence such as missing source dates, extended zero-output periods, session-energy anomalies and persistent charger-count changes. Suspected disruptions reduce confidence rather than automatically being treated as genuine demand loss.

### Model governance

The application can preserve the first available model/assumption snapshot for future comparison. A snapshot created after a site was approved is explicitly labelled as a first-available baseline and is not misrepresented as the original historical approval case.

## UI preservation

- `assets/styles.css` is byte-for-byte identical to the approved V21.5 frozen baseline.
- No V22 workspace, Board/Analyst mode or broad navigation redesign is included.
- No additional permanent cards or columns were added to Portfolio Financial Performance.
- Only the approved Portfolio Calibration maturity labels and explanation in the existing detail window were added.

## Calibration upload

The complete dashboard ZIP or `Daily_Charger_kWh.xlsx` can be parsed locally in the browser. The parser builds continuous daily histories, rolling-30-day energy, monthly observations and charger-reporting diagnostics. The Python upload endpoint remains available as a fallback and for the complete server workflow.

## Local start

Windows:

```text
run_local_server.bat
```

macOS/Linux:

```bash
./run_local_server.sh
```

The production entry point is:

```bash
python server.py
```

## Test

```bash
npm test
```

See `V21.6_PRODUCTION_VALIDATION.md` for the supplied-data results, rolling-origin validation metrics and known limitations.
