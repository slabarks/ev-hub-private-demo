# V21.1 release notes

## Upload performance and reliability

- Added strict frontend/backend build verification before file transfer.
- Added 20-second preflight and 150-second upload timeouts.
- Added staged upload progress and clearer failure diagnostics.
- Added safe response handling for HTML login pages, gateway errors, invalid JSON and truncated responses.
- Added a fresh multipart request for compatibility-route fallback.
- Added gzip compression, `Server-Timing`, build headers and parser/request timing metadata.
- Optimised source selection so `Daily_Charger_kWh.xlsx` is parsed directly and supporting Overview/Ignore workbooks are not opened when the canonical source exists.
- Preserved the last valid uploaded dataset if a new upload fails.

## Portfolio table rendering

- Removed the explicitly generated top horizontal scrollbar.
- Removed the 1,650 px fixed-width requirement on normal desktop and laptop screens.
- Expanded Portfolio Financial Performance to the available browser width.
- Converted the ten columns to percentage-based widths with responsive typography and spacing.
- Retained one controlled bottom scrollbar only below 1,280 px, where forcing all columns into one view would damage readability.

## Retained V21 functionality

- Full Next 12m kWh audit graph with rolling-30-day, daily and monthly views.
- Actual-led forecast safeguards and monthly reconciliation.
- Electricity energy versus standing/capacity cost split.
- Site-level funding apply/exclude/override controls.
- Gross and net CAPEX/payback transparency.

## Build identifiers

- Application: `V21.1`
- Build: `EVHUB-V21.1-20260717-R1`
- Schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.2`
