# V21.2 release notes

## Calibration upload fix

- Removed the mandatory `/api/version` gate that caused valid uploads to fail with HTTP 404.
- Added automatic API discovery for application-relative and domain-root paths.
- Added fallback between current and legacy import endpoints.
- Changed build/parser mismatches to diagnostics when the returned data structure is valid.
- Retained strict rejection of incompatible schemas and missing daily/monthly histories.
- Added reverse-proxy subpath support in `server.py`.
- Added stale-port protection in local launchers: the browser opens only after the correct backend starts, and another port is selected if 10314 is already occupied.

## Preserved V21.1/V21 functionality

- Full-width Portfolio Financial Performance layout on desktop.
- Rolling 30-day actual and forecast audit graph.
- Electricity versus standing/capacity cost visibility.
- Funding controls and gross/net CAPEX treatment.
- Optimised canonical `Daily_Charger_kWh` parsing and compressed responses.
