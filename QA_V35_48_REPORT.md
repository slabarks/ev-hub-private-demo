# QA Report — v35.48 trailing 12-month actual comparison fix

Scope: implement only Change 1 requested by the user.

## Implemented

- Mature portfolio live-data uploads use trailing 365-day actual kWh, sessions and net revenue for annual comparison.
- Near-mature sites use partial-year cumulative annualisation over all live days instead of rolling 30-day annualised run-rate.
- Early sites remain on daily cumulative annualisation.
- Added trailing365Kwh, trailing365Sessions and trailing365NetRevenue fields to uploaded actuals for auditability.
- No motorway/hotel target recalibration and no Cork City AADT override were implemented.

## Regression coverage

- Server syntax compile.
- Static regression ensuring near/mature sites no longer use rolling30×365 for benchmark annual actuals.
- Existing JS engine tests and individual static regression tests.
- Portfolio benchmark smoke test.
- Killashee exclusion and low-data badge tests remain active.
