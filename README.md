# EV Charging Hub Investment Tool — V21.6

V21.6 is the investor-model integrity and auditability release built from the production V21.5 baseline.

## Build

- Application: `V21.6`
- Build: `EVHUB-V21.6-20260719-R1`
- History schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.6`
- Cashflow convention: construction at period 0; operating cashflow at each year end

## Principal improvements

### Financial integrity

- Correct period-zero CAPEX and year-end operating cashflow timing for NPV.
- Robust IRR calculation that returns no result when a valid project IRR does not exist.
- Fractional-year payback rather than a whole-year marker only.
- Gross CAPEX, grant applied, unapplied grant and operator-funded CAPEX shown separately.
- Grant support capped at gross initial CAPEX so it cannot create negative investment.
- Secured-lease NPV/IRR and post-lease cashflow shown separately from full-horizon returns.
- Gross and net ROI retained as distinct metrics; scenario ranking policy itself is unchanged.

### Battery and technical consistency

- Usable battery energy now consistently applies SOH, reserve and dispatchable fraction.
- Overnight recharge uses the configured start/end window, with duration as fallback.
- Reliability assumptions reduce delivered energy through an explicit availability factor.
- The technical-engine battery service calculation is the single financial OPEX source.
- Known/actual installed projects initialise selected batteries at COD and do not buy the same assets again as staged augmentation.
- ESB application fees now propagate into model-calculated initial CAPEX.

### Investor auditability

- Every default input and configuration control has structured provenance and status metadata.
- Inputs are tagged as measured, portfolio calibrated, engineering, commercial, diagnostic or reference-only.
- Reference-only controls are identified rather than presented as active model drivers.
- Operating-site P25/P50/P75 kWh, revenue and operating-cashflow bands are surfaced in Portfolio Financials and exports.
- A browser-local forecast snapshot ledger records model version, data cutoff, assumptions, configuration and forward predictions.
- Snapshot storage failure is isolated from the live-data upload: a valid upload remains active even when browser storage is unavailable.

### Navigation

- Duplicate tab/stepper navigation is replaced by one navigation system.
- Investor and Analyst modes separate decision outputs from calibration and builder controls.
- The readiness strip reflects site, AADT, technical, financial and report readiness rather than merely visited tabs.

### Live calibration upload

- Complete ZIP or `Daily_Charger_kWh.xlsx` files are parsed in-browser first.
- Canonical daily/monthly site histories are validated before activation.
- Python upload routes remain available as resilient fallback paths.
- The previous valid dataset is preserved after a failed upload attempt.

## Commercial policies deliberately not retuned

V21.6 does not silently alter the segment demand coefficients, default discount/hurdle rate, scenario-ranking objective or new-site downside/upside assumptions. These require commercial approval and are documented in `V21.6_COMMERCIAL_DECISIONS_PENDING.md`.

## Local start

Windows:

```text
run_local_server.bat
```

macOS/Linux:

```bash
./run_local_server.sh
```

The complete app should be opened through `python server.py` so location, AADT and upload fallback services remain available.

## Tests

```bash
npm test
```

The eight-stage suite covers syntax/static guards, local ZIP/XLSX parsing, AADT regression, Python live-history parsing, maturity forecasting, financial-integrity and randomized invariants, API routes, upload fallback and static delivery.

See:

- `RELEASE_NOTES_V21.6.md`
- `V21.6_PRODUCTION_VALIDATION.md`
- `V21.6_CHANGE_IMPACT.md`
- `V21.6_COMMERCIAL_DECISIONS_PENDING.md`
