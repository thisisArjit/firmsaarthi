# Tables and payment presentation

All current HTML tables use app/sortable-table.tsx (40 usages across 15 screens). The only native table remains inside that shared component. Each has a keyboard-focusable two-axis viewport, bounded to 65vh / 42rem with sticky headings. Previous outer wrappers retain spacing without nested scrollbars.

All headings have ascending/descending controls and aria-sort. Header inputs stay beside separate sort controls. Native buttons support Enter/Space without submitting forms. Sorting copies row elements and retains keys, callbacks and controlled inputs; it never mutates records or saves edits. Explicit data-sort-value metadata takes precedence; otherwise amounts, dates, natural identifiers and visible text are interpreted. Compound text columns include secondary references. Missing values stay last in either direction, with stable ties. Form controls use current values/checked state.

Business discovery supplies the full filtered set and paginates after sorting. Other tables sort currently loaded/filtered records; API limits and export ordering stay unchanged. Provide explicit sort metadata for new custom cells or different date formats. Action-only headings sort visible action text, retaining original callbacks.

lib/payment-display.ts presents stored legacy/manual method/source enums as Manually entered in receipt, supplier history and account statement views and related CSV exports. The generated paid-flag reference becomes Payment date not recorded. Raw enums/references, unknown dates, audit IDs, backups and financial amounts are not rewritten. User-authored free-text references remain intact.

Verification covers Indian/negative currency, dates, natural IDs, missing values, stable ties, controlled cells, compound references, accessible output and pagination. Browser checks cover numeric directions, correct edit action after sorting, unknown-date receipt wording, sorting all business pages, measured overflow on both axes, actual horizontal/vertical scrolling and sticky header position. No separate 390px emulator was available.
