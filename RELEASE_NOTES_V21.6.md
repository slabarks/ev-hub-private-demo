# EVHub V21.6 Release Notes

**Release date:** 19 July 2026  
**Build:** `EVHUB-V21.6-20260719-R1`

## Purpose

V21.6 converts the audited V21.5 codebase into a more defensible investor model without changing the approved central demand assumptions or scenario-ranking policy.

## Corrected calculations

1. NPV now uses period-zero construction CAPEX and year-end operating cashflows.
2. IRR returns `null` for all-positive, all-negative and no-root cashflow profiles instead of displaying a plausible but invalid percentage.
3. Payback is calculated to a fraction of a year.
4. Grants are capped at gross initial CAPEX and cannot make net investment negative.
5. Gross initial CAPEX, grant applied, unapplied grant and operator-funded CAPEX are retained separately.
6. Full-project and lease-secured returns are shown separately.
7. Battery dispatchable energy consistently applies SOH, reserve and dispatch fraction.
8. Reliability/downtime assumptions now affect delivered energy.
9. Recharge feasibility uses configured overnight start/end times.
10. Actual installed configurations initialise their battery cohorts at COD, preventing duplicate staged purchases.
11. Battery annual service is reconciled to the technical-engine cost source.
12. ESB application fees are included in model-calculated initial CAPEX.

## Added investor outputs

- P25/P50/P75 next-12-month operating-site kWh.
- P25/P50/P75 next-12-month revenue.
- P25/P50/P75 next-12-month operating cashflow.
- Gross and operator-funded lifecycle CAPEX.
- Gross/net ROI, valid IRR, fractional payback and secured-lease metrics.
- Warnings for 0% discounting, capped grants, infeasible configurations and lease exposure.
- Forecast snapshot ledger with model/data/assumption/configuration provenance.

## UI and workflow

- One navigation system replaces the duplicate tab and workflow-stepper pattern.
- Investor and Analyst views group outputs by audience.
- Readiness indicators are based on resolved data and feasibility conditions.
- Assumption provenance pills are shown beside relevant inputs.

## Compatibility

- Existing point-estimate fields remain available where practical.
- Saved-state and tab alias handling are retained.
- The approved central demand forecast and feasibility-first/ROI ranking order are not retuned.
- The existing local-first calibration upload and fallback API behaviour remain in place.

## Validation

The production suite contains eight stages, including 400 deterministic randomized financial/technical invariant scenarios. Full results are in `V21.6_PRODUCTION_VALIDATION.md`.
