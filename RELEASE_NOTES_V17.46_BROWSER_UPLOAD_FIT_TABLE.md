# V17.46 release notes — browser-resilient upload and fit-to-width table

## Why this release exists

V17.45 correctly rejected a backend response with zero monthly histories, but the upload still depended on the hosted Python process being replaced successfully. In the user's deployed environment, the browser repeatedly received a partial legacy response even after new static files were deployed. This left the Portfolio Financials tab on stored fallback data.

The financial table also used a fixed 1,650 px canvas and synchronized horizontal scrollbars. That preserved column widths but did not meet the investor-view requirement to see the full financial row at once.

## Live-upload correction

V17.46 adds `js/liveUploadClientParser.js`, a self-contained browser parser for the calibration upload workflow.

The browser can now:

- expand the complete dashboard ZIP pack locally;
- ignore the pack's `Ignore` folder;
- parse XLSX shared strings, workbook relationships and sheet data;
- locate the daily charger columns by header name;
- aggregate charger rows into site actuals;
- calculate commercial start, operational days, rolling 30-day demand and annualised actuals;
- retain monthly kWh/session/revenue history with calendar-day denominators;
- return the same content contract used by the Python importer.

The app starts the browser parse and server import in parallel. A complete server result is accepted. When the hosted backend is incomplete or unavailable, a valid browser-parsed result is activated instead.

This restores the practical upload behaviour without accepting an incomplete zero-history dataset.

## Portfolio table correction

The previous fixed-width scrolling table has been removed.

V17.46 uses:

- a full-width Portfolio Financials workspace;
- 10 percentage-width columns totalling 100%;
- no top scrollbar;
- no bottom horizontal scrollbar;
- fixed table layout within the available page width;
- compact but readable main and secondary values;
- a wider Site, Performance and Run-rate payback allocation;
- responsive labelled row cards below 1,180 px.

The whole financial comparison is visible across one desktop screen.

## Production data replay

The exact `Funded_Overview_Data_10_07_26.zip` pack produced in the browser parser:

- 37,728 charger-level rows
- 45 site records
- 45 sites with monthly history
- 430 monthly observations
- latest actual date 2026-07-09

For the 37-site active clean portfolio, the UI retained:

- 37/37 matched sites
- 37/37 sites with monthly history
- 340 active-site monthly observations
- 8 sites outside the active portfolio, shown separately

The same production dataset selected as the nine individual Overview spreadsheets produced the same live-history result.

## Performance reconciliation

With the validated production data active, the Performance versus model cards and the 37 site-row badges reconciled to:

- In benchmark: 13
- Underperforming: 10
- Above benchmark: 14
- Review: 0

History quality remained independent of those classifications.
