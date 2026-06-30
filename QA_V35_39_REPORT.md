# EV Hub v35.39 QA Report — AADT Relevance Engine

## Scope

This revision improves AADT selection without changing demand, product configuration, hardware costs, battery costs, ESB costs, Scenario Ranking, or financial model logic.

## Implemented changes

1. Added curated TII AADT mapping for known operating/portfolio sites using `Charger_Sites_to_AADT_Mapping.xlsx` as the reviewed source.
2. Replaced known-site zero/weak/untraceable AADT values with explicit TII counter IDs and 2026 AADT values.
3. Added AADT metadata per portfolio site: counter IDs, aggregation method, and basis note.
4. Updated Site Screening AADT engine for new/future locations:
   - rank candidate counters by distance, route/address relevance and data quality;
   - reject abnormal very-low counters when better candidates exist;
   - select one best counter unless candidates are same-corridor;
   - average only same-corridor candidates with plausible relative AADT values;
   - preserve automatic/manual point flow and manual AADT override.
5. Updated AADT candidate wording from “Used in average” to “Selected” to avoid implying every selected counter is averaged.
6. Portfolio traffic detail now shows AADT method and basis note for selected hubs.

## Key corrected AADT examples

| Site | v35.39 AADT | Basis |
|---|---:|---|
| Supervalu Tipperary | 7,093 | TII 000000001241, N24 Bansha–Tipperary Town |
| The Brehon Hotel | 14,326 | Average of TII 000000001222 / 000000001223, N22 Killarney counters |
| The Rhu Glenn Hotel | 9,080 | Average of selected N25/N24 Waterford approach counters |
| Douglas Court | 49,079 | TII 000000001283, N28 N40–Rochestown counter |
| Banner Plaza Ennis | 30,589 | TII 000000020182, Ennis South / Junction 12 counter |
| Texaco Newcastle | 88,622 | TII 000000200723, N07 Newcastle/Kilteel counter |
| The Cope Shopping Centre | 3,526 | TII 000000020562 only; excludes abnormal 12-AADT CMU row |
| SCG Dundalk Golf Club | 8,343 | TII 000000020525, N52 Dundalk Southlink local proxy |
| Corrib Oil Cork City | 17,056 | Average of selected N22 Cork/Model Farm corridor counters |

## Regression tests passed

- `npm test`
- all static `.mjs` regression tests
- new `aadtMappingStatic.mjs` regression test
- JS syntax checks
- Python syntax check
- curated AADT engine smoke test for Douglas, Brehon, Supervalu, Cope, SCG Dundalk, Texaco Newcastle and Corrib Cork
- XLSX export generation smoke test
- XLSX ZIP/OOXML structural validation
- no `NaN`, `Infinity`, `null`, `#REF!`, `#VALUE!`, or `#DIV/0!` markers in generated XLSX

## Notes

For known portfolio sites, the curated AADT table is the source of truth. For new Site Screening addresses or manual map points, the app still runs the automatic TII selection engine. The automatic engine now avoids the old closest-3 blind average and only averages candidates when they are demonstrably same-corridor.

Where the local environment cannot reach TII counter-location services, the app still falls back to the local TII AADT Excel text matching and/or clearly labelled fallback values. In hosted/online use, the coordinate-enriched TII ranking path is preferred.
