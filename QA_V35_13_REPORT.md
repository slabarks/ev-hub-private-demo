# v35.13 Portfolio Calibration QA Summary

## Changes validated
- Portfolio Calibration uses a fixed 2025 back-test start year.
- Portfolio matrix includes base model and site-type calibrated model columns.
- Portfolio filters added for maturity, category, variance band, AADT confidence and MIC band.
- Portfolio table headers are sortable ascending/descending.
- Current filtered-view overview cards now use the active filters, so near-mature sites such as Roscommon can appear in best-match summaries when included.
- Site-type categories and traffic-capture factors are shown in the matrix: relevance, capture and actual sessions per 1,000 AADT.
- Mature-only accuracy cards remain separated from filtered-view cards.

## Checks run
- JavaScript syntax check passed.
- Existing engine test suite passed.
- Python server syntax check passed.

## Notes
- Site-type calibration is a modelling layer for portfolio back-testing. It does not change the standard new-site workflow unless a portfolio site is explicitly loaded.
- The calibrated model is intended to demonstrate the movement from generic AADT assumptions to site-type-aware calibration, not to claim perfect historical reconstruction of every site.
