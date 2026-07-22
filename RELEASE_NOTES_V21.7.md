# V21.7 release notes — Commercial Operation and Payback Sorting

## Release basis

V21.7 is built from V21.6 Prediction Enhanced and preserves the approved V21.5 visual baseline. No broad UI redesign or additional permanent financial-table content has been introduced.

## Commercial-operation date correction

The live-history parser no longer assumes that the first recorded session must be the start of commercial operation.

The revised hierarchy is:

1. Explicit commercial-operation date when present.
2. Conservatively inferred sustained commercial activity.
3. First-session or first-kWh fallback where no commissioning pattern exists.

A commissioning prefix is excluded only when all of the following are true:

- no more than three active days;
- no more than 10 sessions;
- no more than 100 kWh and €50 net revenue;
- the prefix spans no more than 14 days;
- it is followed by at least a 30-day dormant gap; and
- the restart contains at least three active days and either eight sessions or 100 kWh during the next 30 days.

All zero-use days after the commercial-operation date remain in the denominator.

For the supplied dashboard dataset, Corrib Oil – Swinford is the only site meeting the commissioning-prefix test:

- first recorded activity: 10 July 2025;
- excluded prefix: one session, 2.492 kWh, €0 revenue;
- dormant gap: 223 days;
- inferred commercial operation: 18 February 2026;
- commercial days through 13 July 2026: 146.

The corrected date propagates into annualisation, forecast weighting, maturity/repeatability, age-matched model comparison, backtesting and confidence ranges.

## Run-rate payback sorting

The Site Financial Performance table now applies business-semantic sorting.

### Best to worst

1. Immediate / zero net invested CAPEX.
2. Positive finite payback from shortest to longest.
3. Very long positive payback.
4. No payback because EBITDA is not positive.
5. Missing or uncalculable values.

### Worst to best

1. No payback because EBITDA is not positive.
2. Positive finite payback from longest to shortest.
3. Immediate payback.
4. Missing or uncalculable values remain at the bottom.

Missing CAPEX, missing actuals and missing operating days are no longer mixed alphabetically with genuine poor-performing sites. Rows with equal status use site name as a deterministic secondary sort.

Additional corrections:

- zero net invested CAPEX displays `Immediate / 0.0 yrs`;
- values above 50 years retain the compact `>50 yrs` display;
- the tooltip exposes the underlying calculated value;
- active sort wording is `best to worst` or `worst to best` for payback.

## Logo reset

Clicking the ePower logo now requests confirmation and then:

- clears application local and session storage;
- clears app-controlled browser caches;
- unregisters app service workers where present;
- removes uploaded calibration data and unsaved selections;
- reloads the default stored dataset with a cache-busting URL.

Cancelling the confirmation leaves all data unchanged.

## Forecast graph wording

The legend label is clarified from `Smoothed actual trend` to:

`Smoothed history — visual guide`

The smoothed line remains visual only and is not directly extrapolated into the controlled forecast.

## UI preservation

- The approved navigation, cards, tables and Portfolio Financial Performance layout are unchanged.
- `assets/styles.css` remains byte-identical to the frozen V21.5 baseline.
- No new permanent cards or columns were added.
