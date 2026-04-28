# EV Charging Hub Investment Tool — v34.2 Design Verified

This clean build includes the agreed design refinements, cache-busted CSS/JS, the redesigned workflow guide, refreshed icons, and Scenario Ranking layout polish.

# EV Charging Hub Investment Tool — HTML/JavaScript Demo v33

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

This package includes a local JSON database generated from `AADT Summary Report Public sites 04-2025 2019 to 2026.xlsx`.

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
