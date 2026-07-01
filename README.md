# EV Hub Investment Tool — v35.54 active curator calibration

This build keeps the v35.39 curated AADT relevance engine, the v35.40 matched Portfolio Calibration benchmark logic, adds the v35.42 table clarity fix, the v35.44 grant render fix, and the v35.45 mapping/upload/Kempower update:

- Portfolio comparison now matches actual/live performance to the relevant model year or weighted model-year basis before calculating variance.
- Static rolling-30D actuals are annualised and matched to the configured comparison year; uploaded trailing-365 actuals are matched to the equivalent operating window where first-active/latest dates are available.
- The visible Portfolio Comparison table hides `Model basis` to reduce noise; the full basis remains in selected-site detail, status popovers and XLSX audit export.
- `In benchmark` now means mature/near-mature, good setup confidence, no overriding capacity pressure, and matched variance within ±15%.
- Early sites remain `Ramp-up`; they can show a secondary variance/capacity signal, but are not treated as mature in-benchmark evidence.
- Status logic is unified around matched variance first, then capacity, AADT/category review and peer-productivity diagnostics.
- Export/PDF portfolio tables now use the same ±15% matched-variance rules; the investor PDF also hides the noisy Model basis column.

Run locally with `python3 server.py`.

# EV Charging Hub Investment Tool

Current review build: **v35.54 Active Curator Calibration** — v34.2 Design Verified

This clean build includes the agreed design refinements, cache-busted CSS/JS, the redesigned workflow guide, refreshed icons, and Scenario Ranking layout polish.

# EV Charging Hub Investment Tool

Current review build: **v35.54 Active Curator Calibration** — HTML/JavaScript Demo v33

This package is a local-first browser demo built from the uploaded **Financial Modelling - EV Hub - DUT . V13.xlsx** workbook and the uploaded Site Location Dashboard package.

## Run locally

### Windows
Double-click:

```text
run_local_server.bat
```

The browser should open automatically. If it does not, open:

```text
http://localhost:10314/
```

### Mac / Linux

```bash
./run_local_server.sh
```

Then open:

```text
http://localhost:10314/
```

No npm install is required for the app. It uses browser JavaScript modules and a small standard-library Python server only for static serving and free provider fallback calls.

## What is included

- Site Screening with MapLibre map and raster fallback if external tiles are slow or blocked
- Free fallback provider chain from the uploaded HTML package:
  - local Cork validation seeds
  - Photon fallback
  - Nominatim fallback
  - OpenStreetMap / Overpass nearby charger fallback
- Manual AADT override
- Demand Forecast with simplified editable assumptions and revised charts
- Product Configuration replacing Simulation Cockpit
- Investment Case with four grouped KPI windows and ROI
- Annual Financials with a simplified year-by-year matrix
- Scenario Ranking with highlighted recommendation and ROI ranking across the six Excel scenarios
- Advanced Model Settings exposing hidden Excel inputs with notes
- Investor Report exports
- Modular JavaScript calculation engines
- Node-based engine tests

## Dashboard tabs

1. Site Screening
2. Demand Forecast
3. Product Configuration
4. Investment Case
5. Annual Financials
6. Scenario Ranking
7. Advanced Model Settings
8. Investor Report

## Important modelling rule

The app runs in **Excel exact mode**. The JavaScript engines reproduce the workbook formulas and calculation flow from the supplied Excel model wherever the workbook contains the logic. UI changes are presentation changes only.

The approved MIC list is the Excel list only:

```text
50, 100, 200, 400, 800, 1000, 1500 kVA
```

## Provider accuracy

The free demo sources are useful for testing, but they cannot guarantee accurate all-Ireland Eircode resolution. For public production use, configure one of these through a secure provider proxy:

- Autoaddress
- GeoDirectory / GeoAddress
- Google Geocoding
- Mapbox Geocoding

## Tests

If Node.js is available:

```bash
node tests/runTests.js
```

The tests compare key default outputs against the Excel workbook reference values.

## Public website strategy

For the public version, keep the calculation engines in browser JavaScript. Move provider credentials and live provider calls behind a secure lightweight backend/proxy. Do not expose API keys in browser code.

## Package contents note

The ZIP contains the app root files plus the `assets`, `docs`, `js`, and `tests` folders. On Windows, `index.html` may appear as just `index` if file extensions are hidden. That is normal.

## Browser auto-open

`run_local_server.bat` starts the local server and opens your default browser automatically at `http://localhost:10314/`. If a browser does not open, copy that URL into Edge, Chrome, or another browser.

## Old server issue

This package runs on **http://localhost:10314/** instead of port 8000.

If you only see the old **Site Location Dashboard** without the top header **EV Charging Hub Investment Tool** and without the eight tabs, you are looking at an old server/browser tab from a previous package. Close the old command window and open http://localhost:10314/.

## v33 port change

This v33 package runs on **http://localhost:10314/** to avoid browser cache or old local-server conflicts from earlier versions.


## v33 AADT Excel multi-tag lookup engine

This package includes a local JSON database generated from `aadt_2019_2026.xlsx`.

When a site is searched, the server first protects the Excel/Ballincollig golden reference case. For other addresses, it searches the uploaded TII AADT Summary data by Site Name and Description. If several relevant TII rows match the address, the latest available AADT values are averaged and the matched records are shown in Site Screening.

This is a text-based TII corridor proxy. It is more reliable than the failed live-coordinate parsing path, but it is not a true nearest-coordinate calculation because the uploaded AADT workbook does not contain latitude/longitude. Use the TII map/manual import or manual override when you know the exact counter.

## v33 TII coordinate-enriched AADT lookup

This version keeps the uploaded TII AADT Summary Excel as the local AADT value database. On search, the local server now attempts to enrich those rows with official TII counter coordinates from the public TII traffic-counter location files and, when available, selects the nearest coordinate-enriched counter to the searched site. If the coordinate file is blocked or unavailable, the app automatically falls back to the multi-tag Site Name / Description lookup from the Excel and clearly labels the source/confidence.

The search workflow is also more tolerant: if open/free geocoding fails, the app still attempts the TII Excel AADT text match and only falls back to demo/manual values if no usable TII match is found.


## v35.2 map recenter reliability fix

- Every new address search now clears the previous MapLibre instance, stale markers, radius ring and charger markers before loading the next site.
- The map is recreated and centred on the returned site coordinates for every search.
- If free geocoding fails, known Irish place fallbacks and TII-counter coordinate fallbacks are used before the generic Ireland-centre fallback.
- Muckross / Killarney and Newmarket public-address fallbacks are included for reliable first-screen investor demos.

## Private demo deployment

This build includes an optional password gate for hosted demos.

Set these environment variables on the host:

- `DEMO_PASSWORD` — required to enable password protection
- `DEMO_SESSION_SECRET` — long random secret used to sign the session cookie
- `DISABLE_BROWSER_OPEN=1` — recommended for hosted deployment

When `DEMO_PASSWORD` is not set, the app runs openly for local development.

See `DEPLOY_TO_RENDER.md` for step-by-step deployment and deletion instructions.


## v35.7 final refinements
- Hidden scaled civils/electrical capex logic derived from Kempower reference costs.
- Lease term risk flag added to the Investment Case.
- AADT explanatory helper text added.
- Responsive compact layout for smaller laptop screens.
- Render deployment remains password-ready.


## v35.9 final model polish
- Added hidden ex-VAT ESB connection cost estimator by model MIC, derived from historical quotation bands.
- Improved battery augmentation to use year-by-year SOH-adjusted battery energy and incremental battery units.
- Expanded Annual Financials technical detail by default.
- Fixed AADT info popover behaviour.
- Highlighted Product Configuration as an interactive configuration area and added unit suffixes to editable numeric fields.
- Emphasised Investment Case summary windows using the existing design palette.


## v35.42 UI fix
- Portfolio Comparison table now hides the Model basis column to reduce noise.
- Full model basis is preserved in the status popover, selected-site detail card and XLSX audit export.
- The 9-column table now has protected desktop/tablet widths for Actual, Matched model, Variance and Status.


## v35.45 mapping/upload/Kempower update

- Corrects verified hardware mappings from ePower_Site_Data_Mapping.xlsx and user-confirmed overrides.
- Keeps Douglas Court as 4 active plugs.
- Sets Banner Plaza current live state to 1 active Kempower triple cabinet / 4 active plugs while preserving the full 2-triple-cabinet / 8-plug design metadata.
- Retires Anner Hotel from active portfolio calibration and keeps Killashee as a future-only hardware record.
- Adds live-data upload merge protection so missing, blank or zero uploaded actuals do not overwrite existing/static actuals.
- Adds a Kempower Triple Cabinet quantity selector allowing 1 or 2 triple cabinets without automatically increasing active satellites/plugs.

## v35.43 ZEVI funding database

This build embeds a ZEVI funding database from the matched site funding file and the wider ZEVI allocation reference file. Confirmed portfolio-site matches auto-populate Product Configuration → Grant support. Safe exact allocation matches can also auto-populate for future sites, while generic, duplicate or fuzzy allocation matches are shown as review suggestions only. Manual grant entries are preserved until a portfolio site is explicitly loaded or the grant is cleared.


## v35.47 Low-data and mixed-site exclusion update

- Portfolio variance badges now show **Low data** when actual kWh exists but operating volume is below the confidence threshold, instead of incorrectly showing **No actual**.
- Killashee House Hotel is kept out of active portfolio calibration/live-data promotion because it is a mixed AC/DC site and should not be modelled in the DC-only portfolio view.
- Killashee remains only as an excluded reference record for audit purposes.


## v35.54 active curator calibration

- Main Portfolio Comparison table now shows **Variance** and **Status** only.
- Variance always shows the mathematical matched model vs actual percentage whenever actual kWh exists.
- Variance badge colour carries the accuracy signal: green is within ±15%, amber is moderate, red is major.
- Clicking the variance badge opens the accuracy detail: Excellent, In benchmark, Moderate, High or Major variance, with actual/model values and model basis.
- Status remains the operational signal: ramp-up, pressure, under-capture, outperforming, review or monitor.
- Portfolio XLSX/PDF exports no longer show Model Accuracy as a separate column.

## v35.48 trailing 12-month actual comparison fix

- Updated the live-data server annualisation basis for Portfolio Calibration uploads.
- Mature sites now use true trailing 365-day actual kWh/sessions/net revenue instead of rolling 30-day annualised run-rate.
- Near-mature sites now use partial-year cumulative annualisation across all available live days instead of rolling 30-day annualised run-rate.
- Early/ramp-up sites continue to use cumulative daily annualisation.
- Added trailing365 actual fields to the live upload response for auditability.
- No demand target recalibration or AADT override changes were included in this build.


## v35.54 active curator calibration

- Removed the visible Status column from Portfolio Calibration so the table focuses on maturity and matched annual variance.
- Added a neutral curator framework audit with catchment, competition, destination and access/visibility modifiers defaulting to 1.00x. No demand output changes until a modifier is explicitly reviewed.
- Variance popover now shows the curator audit trail.
- Fixed stale actual-installed-power override behavior: changing charger hardware clears verified-site output overrides and recalculates from the selected hardware library.
