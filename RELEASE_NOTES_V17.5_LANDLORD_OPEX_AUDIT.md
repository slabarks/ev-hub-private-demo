# V17.5 Landlord OPEX Audit

## Why this release exists
The Portfolio Financials tab was applying landlord cost assumptions to active calibration sites even though the active site data does not contain verified site-level landlord terms. It also treated some percentage inputs as kWh-based charges and could apply landlord GP share and gross-sales share at the same time.

## Fixes
- Portfolio Financials no longer assumes landlord rent, landlord GP share, or landlord gross-sales share for active sites unless actual site-level landlord terms are provided.
- Portfolio OPEX now labels this clearly as excluding electricity and landlord costs where landlord terms are not available.
- Portfolio EBITDA/payback are now labelled as pre-landlord unless actual landlord terms are present.
- Transaction processing fee is calculated as a percentage of revenue, not kWh.
- Gross-sales share is calculated as a percentage of revenue, not kWh, where actual landlord terms are supplied.
- GP share and gross-sales share are mutually exclusive. If both are supplied in the core model, gross-sales share takes precedence to prevent double counting.
- OPEX cells show a tooltip explaining that model ground rent was excluded where no actual landlord data exists.

## Validation
- npm test passed.
- All MJS smoke/static tests passed.
- Comprehensive burn test passed: 417 scenario runs, 0 failures, 0 warnings.
- AADT regression passed: 24 passed, 0 failed.
