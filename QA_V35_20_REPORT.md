# QA Report — v35.20 Advanced Settings Simplification

## Scope
This update simplifies the Advanced Model Settings tab so it only exposes the agreed active advanced factors.

## UI changes
The Advanced Model Settings tab now shows only these category panels when they contain active inputs:

- Traffic & demand defaults
- Peak window & power defaults
- Battery technical assumptions
- Commercial, service & warranty assumptions

The following empty/non-active panels were removed from the visual Advanced Settings tab:

- Grid & connection assumptions
- Lifecycle assumptions
- Approved MIC library panel
- Scenario comparison rule panel

## Visible advanced inputs retained

- Annual traffic growth rate
- Site relevance factor
- On-road BEV share at COD
- BEV share cap
- Fast-charge propensity
- Ramp-up Year 1
- Ramp-up Year 2
- Plug-in / overstay overhead hours
- Design peak floor sessions
- Tech uplift early phase rate
- Tech uplift middle phase rate
- Tech uplift cap
- Duration response factor
- Power factor
- Battery dispatch fraction usable
- Battery base degradation rate
- Battery cycling degradation factor
- Overnight recharge window duration
- Annual tariff escalation
- Annual electricity cost escalation
- Discount rate
- Transaction processing fee % revenue
- Flat transaction fee per session
- Managed service fee per charger asset
- Autel charger warranty annual rate
- Kempower charger warranty annual rate
- Autel battery warranty annual rate
- Polarium battery warranty annual rate

## Hidden / removed from Advanced visual tab

- Model horizon
- Gross selling price incl. VAT
- Grid threshold modelling
- ESB connection application fee
- Annual failure rate starting
- Downtime impact factor
- Operating hours per day
- Battery augmentation trigger deficit kW
- Peak intensity factor cap
- Battery reserve %
- Overnight recharge window start
- Overnight recharge window end

These values may remain as internal defaults/constants where the engines or legacy state require them, but they are no longer user-facing Advanced Settings inputs.

## Validation performed

- `node --check js/app.js` passed.
- `node tests/runTests.js` passed.
- `node tests/portfolioBenchmarkSmoke.mjs` passed across all 32 clean ROI operating sites.
- `node tests/portfolioLoadSearchStatic.mjs` passed.
- `node tests/advancedSettingsVisibilityStatic.mjs` passed.
- `/usr/bin/python3 -m py_compile local_site_location_server.py` passed.

## Notes
This update is a UI simplification only. It does not change calculation engines, portfolio calibration logic, map search behaviour, or financial modelling logic.
