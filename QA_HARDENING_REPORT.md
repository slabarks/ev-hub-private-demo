# EV Hub v35.11 hardening QA report

## Fixes applied

1. **Scenario optimiser no-candidate / impossible-demand hardening**
   - Replaced non-finite placeholder values (`Infinity`, `-Infinity`, `NaN`) with safe finite metrics or `null` where appropriate.
   - No-candidate scenarios now remain structured and render-safe.
   - Infeasible scenarios continue to show clear failure and suggested fix text.

2. **Invalid configuration lifecycle guard**
   - Financial lifecycle logic now checks configuration validity before triggering charger replacement.
   - Invalid standalone states such as `Autel Standalone + charger model N/A + charger count > 0` no longer create zero-capex replacement events.

## Validation run

- JS syntax checks passed for all JS files.
- Python server syntax check passed.
- Existing engine tests passed: `All EV Hub engine tests passed.`
- Full hardening regression script passed.

## Regression volumes

- 630 cross-platform model configurations tested.
- 168 intentionally invalid configuration states tested.
- 4 optimiser demand stress cases tested, including an extreme no-library-capacity case.
- 0 non-finite numeric outputs found in optimiser and financial summaries.
- 0 invalid zero-capex charger replacement triggers found.
- 0 battery envelope violations found.
- 0 SOH-adjusted battery energy violations found.

## Remaining limitation

This QA validates local model logic and structured outputs. It does not guarantee rooftop-level address accuracy for every Irish address, because that depends on external geocoder/provider coverage. The app remains protected by timeout and fallback behaviour.
