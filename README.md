# EV Charging Hub Investment Tool — V21.7

V21.7 is built from V21.6 Prediction Enhanced and preserves the approved V21.5 frozen interface.

## Build

- Application: `V21.7`
- Build: `EVHUB-V21.7-20260722-R1`
- Live-history schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.7`
- Package version: `21.7.0`

## V21.7 changes

### Commercial-operation denominator

The upload parsers now distinguish isolated commissioning activity from sustained commercial operation. The rule is conservative and leaves all inactivity after commercial opening inside the denominator.

The supplied data identifies one clear commissioning prefix:

- Corrib Oil – Swinford
- First recorded activity: 10 July 2025
- Commercial operation: 18 February 2026

The corrected date is used consistently by annualisation, forecast weighting, maturity, model comparison and backtesting.

### Run-rate payback sorting

The Site Financial Performance table sorts payback as:

- best to worst; or
- worst to best.

Missing values remain at the bottom, immediate payback is recognised as `0.0 yrs`, and long payback values retain their exact tooltip value.

### Logo reset

Clicking the ePower logo, after confirmation, clears app data and app-controlled caches and reloads the default stored dataset.

### Forecast legend

`Smoothed history — visual guide` clarifies that the smoothed historical line is not directly extrapolated into the forecast.

## Preserved prediction engine

The V21.6 explainable ensemble, no-lookahead backtesting, empirical uncertainty, repeatability classification, mature-run-rate ranges and technical-capacity logic remain unchanged.

## Local start

Windows:

```text
run_local_server.bat
```

macOS/Linux:

```bash
./run_local_server.sh
```

Production entry point:

```bash
python server.py
```

## Test

```bash
npm test
```

See:

- `RELEASE_NOTES_V21.7.md`
- `V21.7_PRODUCTION_VALIDATION.md`
