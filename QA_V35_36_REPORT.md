# QA v35.36 — Battery augmentation provision update

## Scope

This revision keeps the v35.35 live-upload cache guard and adds one lifecycle CAPEX refinement:

- Battery envelopes are still staged; battery units deploy only when needed.
- The one-off battery civils/electrical/integration provision is charged once, at the first battery deployment event.
- Later battery augmentation events no longer repeat that one-off civils/integration allowance.
- Later augmentations include only the battery module share of hardware, shipping/logistics and unit install/commissioning.

No hardware unit costs, ESB library values, demand assumptions, AADT mappings, product feasibility rules or Scenario Ranking feasibility logic were changed.

## Engine change verified

For an Autel 3 × 125 kW / 261 kWh envelope:

- Old method: every deployed unit carried the averaged full battery uplift, including repeated civils/integration: about €73,663 per unit.
- New method:
  - first battery deployment includes unit deployment + one-off provision: about €90,063;
  - later augmentation units are about €65,463 each;
  - the one-off civils/integration allowance is not repeated.

The total full-envelope allowance remains consistent, but timing is more realistic and augmentation no longer repeats civil/integration costs.

## Tests run

- JavaScript syntax check across `js/**/*.js`
- Python server syntax check
- `npm test`
- Static regression tests:
  - Advanced Settings visibility
  - Demand benchmark profile
  - XLSX and Portfolio PDF static export checks
  - Portfolio benchmark smoke
  - Portfolio filter layout
  - Portfolio load/search static checks
  - Portfolio status popover
  - Responsive static checks
- Local Python server startup and HTTP GET smoke test
- Live-upload API test with Daily Charger + Running Total + Rolling 30D files
- Full live-upload API test with all uploaded dashboard files
- Export XLSX generation through the actual export engine with a browser stub
- XLSX OOXML validation with Python `zipfile`
- XLSX openability validation with `openpyxl`
- No `NaN`, `Infinity`, `null`, `#REF!`, `#VALUE!`, or `#DIV/0!` found in generated XLSX XML
- Scenario comparison smoke tests for default, low-traffic, high-traffic and right-sizing cases

## Key regression results

- `npm test`: passed
- All static `.mjs` tests: passed
- Server GET `/`: HTTP 200
- Upload parser with full file pack:
  - ok: true
  - latest actuals date: 2026-06-28
  - site count: 43
  - parsed actual source: `Daily_Charger_kWh.xlsx`
  - supporting files correctly detected and excluded from actual kWh parsing
- Circle K Express Dungarvan check after full upload:
  - annual kWh: 19,200.445
  - rolling 30D kWh: 1,792.701
- Export workbook:
  - file generated successfully
  - opens with `openpyxl`
  - sheets present: Investment Summary, Annual Financials, Annual Technical Detail, Scenario Ranking, Portfolio Calibration

## Risk notes

- The revision is additive and restricted to the battery lifecycle CAPEX timing logic.
- The existing staged-envelope strategy is preserved.
- Scenario Ranking tests still pass, including the previous right-sizing regression that prevents oversized battery selection.
- Export generation and live-upload parsing were re-tested after the change.
