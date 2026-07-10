# V17.44 — Calibration upload restoration

## Root cause corrected

Two deployment safeguards introduced after V17.40 became failure points:

1. The browser required an exact backend build ID before it sent any calibration files. A valid legacy-compatible parser was therefore rejected before the upload was attempted.
2. The V17.43 HTML retained the V17.42 asset cache-buster while the server integrity check expected a V17.43 cache-buster. This could stop the new Python service and leave the prior deployment active.

## Changes

- Removed the blocking `/api/version` preflight from the upload workflow.
- Uploads are accepted or rejected using the returned site data, not version metadata.
- Older responses without build IDs are supported when they contain usable actuals.
- Exact backend mismatches are recorded as warnings only.
- Monthly-history absence no longer rejects otherwise valid run-rate actuals.
- Added unique V17.44 JavaScript and CSS cache-busters.
- Changed package-integrity checks from fatal startup errors to diagnostics.
- Changed `/api/health` to remain healthy when non-critical package warnings exist.
- Retained ZIP expansion, monthly histories, performance benchmarking and investor-facing financial logic.

## Build

- Application: `V17.44`
- Build: `EVHUB-V17.44-20260710-R1`
- Schema: `v17.44-live-history-v5`
- Parser: `EVHUB-LIVE-PARSER-17.44.1`
