# v35.1 Address Search Reliability Fix

Implemented:
- Browser-side hard timeout guard for `/api/search` using AbortController plus Promise.race.
- Search button is reset in all success/failure/timeout paths.
- Clear live status text under the address search field.
- Safe fallback response shape when the server/API is unavailable.
- Newmarket, Co. Cork fallback coverage for common public searches and P51 examples.
- Local geocoder now checks curated validation entries before slow external providers.
- External provider timeouts reduced and live charger lookup skipped when the search time budget is reached.

Validation:
- JS syntax passed.
- Python server syntax passed.
- Existing JS engine tests passed.
- Browser timeout guard test passed.
- Newmarket public examples passed with fast local fallback.
