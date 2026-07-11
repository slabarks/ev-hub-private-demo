# V17.45 — Portfolio performance, upload integrity and rendering correction

## Why this release was required

V17.44 could display a green live-upload state even when a legacy backend returned zero monthly histories. At the same time, the portfolio Performance versus model cards used history quality as a replacement bucket, so the cards could show all sites as early/limited even while individual rows visibly showed Above benchmark, In benchmark or Underperforming. The financial table also retained multiple conflicting CSS definitions.

## Live-history integrity

- Upload-first workflow retained; no pre-upload build gate.
- New preferred endpoint: `/api/import-live-calibration-v1745`.
- A supplied `Daily_Charger_kWh` file with zero returned monthly histories is rejected as an incomplete backend response.
- The last valid uploaded dataset is preserved when a replacement upload fails validation.
- Valid parsed data is not blocked solely because a backend omits build metadata.
- Live KPIs report active matched sites, active monthly histories, retained monthly observations and upload schema.
- Upload rows outside the active clean portfolio are separated from active matched sites.

## Performance versus model

- Performance bucket is now independent of history quality.
- Summary cards and site badges use the same variance classifier.
- Status filters use the same bucket as the visible site badge.
- Numerical variance remains visible whenever forecast and model benchmark are available.
- History quality is tracked separately as `History usable`, `Early operation`, `Limited monthly history`, `Monthly history unavailable`, or a genuine missing-data state.
- The legacy `low-missing-history` status filter is automatically discarded from old browser state.

## Financial-table rendering

- Replaced conflicting financial-table CSS with one canonical V17.45 block.
- Fixed 10-column widths and 1,650 px table canvas.
- Sticky header and sticky Site column retained.
- Top and bottom horizontal scrolling retained.
- Widened Performance and Run-rate payback columns.
- Removed whole-row opacity from early sites.
- Removed repeated `CAPEX missing` and `No payback` text.
- Shortened in-cell EBITDA reconciliation while keeping full detail in the tooltip.
- Added right-edge spacing so the final column is fully visible at maximum horizontal scroll.

## Investor-facing logic retained

- Day-one actual CAPEX versus complete modelled day-one CAPEX.
- CAPEX delta and delta percentage use red font when negative and green font when positive.
- Next 12 months remain actual-led and independent of maturity.
- Model benchmark covers the same forward 12-month period.
- Maturity enters only from month 13 for longer projections.
- Exact 1–20-year projection horizon remains available in one-year steps.
- Investor-facing revenue ranges remain hidden; the base revenue used in EBITDA is displayed.
