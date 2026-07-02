# QA Report — v35.55 Active Curator Key Fix

## Scope

Fixed the curator profile lookup bug that prevented reviewed Portfolio Calibration modifiers from applying to matching site names.

## Fix

- Added `portfolioCuratorSlug()` in `js/app.js`.
- `portfolioSiteCuratorKey(site)` now converts site names such as `The Cope Shopping Centre` and `Corrib Oil - Cork City` into the same underscore slug keys used by `PORTFOLIO_CURATED_SITE_PROFILES`.
- Export engine already used slug matching and was retained.

## Expected visible changes

- The Cope Shopping Centre: curator 1.30× applies.
- Greenhills Hotel: curator 1.25× applies.
- Walsh’s Centra Service Station Roscommon: curator 1.25× applies.
- Corrib Oil - Cork City: curator 1.50× applies.
- Corrib Oil - Swinford: curator 1.50× applies.

## Regression coverage

- Active curator static regression checks that the app uses slugged curator lookup.
- Full npm/static regression suite was run from the final package folder before zipping.
