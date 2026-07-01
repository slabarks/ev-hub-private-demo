# QA Report — v35.54 Active Curator Calibration

## Scope
- Kept Portfolio Calibration Status column removed.
- Activated reviewed curator profiles for selected mature/near-mature sites.
- Curator modifiers now multiply the matched portfolio model kWh only when `active = true`.
- Variance popover and XLSX export include curator audit notes.

## Active curated profiles
- The Cope Shopping Centre: 1.30× retail destination-strength modifier.
- Greenhills Hotel: 1.25× hotel destination-strength modifier.
- Walsh's Centra Service Station Roscommon: 1.25× town-catchment modifier.
- Corrib Oil - Cork City: 1.50× multi-corridor catchment modifier.
- Corrib Oil - Swinford: 1.50× strong town-catchment modifier.

## Guardrails
- All non-reviewed sites remain at 1.00×.
- Competition framework remains present but neutral until a batch-scanned profile is reviewed.
- No global category capture factors were changed.
- Curated modifiers are shown in the variance popover and export audit fields.

## Tests
Passed from clean extracted package: syntax checks, npm engine tests, all static .mjs regressions, burn test, portfolio smoke, export checks, curator active static regression.
