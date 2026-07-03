# V17.6 Landlord Default-Zero Update

## Change

- Set default `landlordGpShare` to `0`.
- Set default `landlordGrossSalesShare` to `0`.
- Clarified UI helper text: landlord share inputs are optional and should be populated only with actual/commercial terms.
- Kept mutually exclusive logic: if both GP share and gross-sales share are populated, gross-sales share takes precedence and GP share is not added.
- Updated cache-busting string to force browsers to load the corrected app build.

## Rationale

The base model should not assume landlord participation where no actual landlord terms have been entered. This prevents default OPEX/payback from being distorted by non-verified commercial assumptions.
