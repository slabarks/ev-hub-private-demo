# QA V35.24 – Responsive Layout Hardening

## Scope
- Added full responsive layout hardening for desktop, 14-inch laptop, tablet, and mobile screen sizes.
- Preserved the concise Portfolio Calibration layout.
- Added responsive table labels and mobile table-to-card behaviour to avoid unreadable horizontal overflow on phones.
- Added fluid grid behaviour for KPI cards, forms, advanced settings, portfolio panels, report cards, and configuration cards.
- Added viewport/cache-busting updates for the responsive build.

## Implementation notes
- Tables rendered by the shared table helper now include `data-label` attributes for mobile card layouts.
- Mobile breakpoints convert dense tables into readable stacked rows.
- Tablet/laptop breakpoints reduce padding, collapse grids, and keep the portfolio table within the available width.
- Map, header, tabs, filter menus, popovers, workflow stepper, and guide panel received responsive constraints.

## Verification
- `node --check js/app.js` passed.
- Core engine tests passed using module wrapper and explicit process exit.
- Portfolio benchmark smoke test passed across all 32 clean sites.
- Portfolio load-to-map static regression passed.
- Advanced settings visibility static regression passed.
- Portfolio status popover static regression passed.
- Portfolio filter layout static regression passed.
- Export XLSX and Portfolio PDF static regression passed.
- Responsive static regression passed.
- Python server compile passed using `/usr/bin/python3 -S -m py_compile`.
