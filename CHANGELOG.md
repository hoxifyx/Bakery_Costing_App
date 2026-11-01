# Changelog

All notable changes to the Bakery Costing App (OvenCost Pro) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] — 2026-11-01

### Added
- **Ingredient price impact:** Review the cost effect of recorded ingredient price changes across recipes and products.
- **Waste / spoilage costing:** Recipes, batch products, and assembled products can apply waste percentages to ingredient-derived costs. Waste is calculated before overhead, product waste is independent and multiplicative, and high settings (50%+) are surfaced in Data Health.
- **What-if price scratchpad:** Test temporary quantity and pricing overrides for recipes and products without saving them to app data.
- **Shopping and production lists:** Generate and export aggregated ingredient requirements from saved cake or product quotes and orders, with separate piece counts and warnings for deleted items.
- **Nutrition and allergen labels:** Review approximate recipe nutrition and inherited allergens from ingredient data, with warnings for missing information.

### Changed
- **Component row labels:** Both product editors (batch and assembled) now render component rows through a shared `ComponentRow` that shows an explicit type badge (`Cake` / `Recipe` / `Ingredient`), a labeled picker (`Recipe:` / `Ingredient:` prefix), a `×`-labeled batch multiplier for recipe-based rows only, and a `Grams per piece` labeled input. Ingredient rows correctly omit the multiplier.
- **Preview-only multipliers:** The batch product's main recipe multiplier, and the three recipe-source multipliers in Flavours & Fillings (cake recipe, frosting recipe, filling source), now carry `×` plus an accessible `Batch multiplier (preview only, not stored)` label and tooltip.
- **Recipe-line quantity:** The recipe editor's quantity input gained `aria-label="Quantity"`; the five-column line grid is unchanged.

## [1.5.0] — 2026-10-30

### Added
- **Product pricing upgrades:** Batch and assembled products now support per-product overhead, margin, labour rate, extra piece costs, custom selling prices, and live profit/margin tracking.
- **Product quote workflow:** Added a product-quote calculator and saved-quote support for product bundles, with export/import compatibility and quote-kind handling.
- **Recipe pickers:** Product recipe selectors list every recipe, not only matching kinds, while leaving catalog filtering unchanged.

### Changed
- Schema version bumped from 1.3 to 1.4. Older exports remain compatible.

### Validation
- 49 automated tests pass. Lint completes with existing warnings; the production build succeeds with the known dynamic-import and bundle-size warnings.

### Fixed
- Import/export now displays the current schema version and supports customers and orders in selective exports and selected-group imports.
- Corrected handoff exclusion details and the ingredient price-history and round-trip test fixtures.

## [1.4.17] — 2026-10-12

### Added
- **Recipe labour hours:** Bakers can record optional hands-on labour hours per recipe batch. This is informational only and does not affect costing calculations or warnings.

### Notes
- Schema version bumped from 1.2 to 1.3. Older exports without `labour_hours` continue to import cleanly.

## [1.4.16] — 2026-10-11

### Fixed
- **Quote page on iPad landscape:** The two-column layout (Tier Structure + sticky summary) was activating at 1024px, which is too narrow once the 250px sidebar is accounted for. The summary column was cramped and the flavour/filling dropdowns were truncated. The two-column layout and sticky summary now activate at 1280px; iPad landscape uses the single-column stacked layout.
- **Size guide pills in the Tier Structure card:** The quick-pick size pills were hardcoded to the first four entries of the size guide, and on narrower widths the pills overflowed the tier card boundary. All size guide entries are now shown, and the pill row wraps inside its container instead of overflowing.

### Notes
- UI-only; engine, IO, store, and schema unchanged (still 1.2). No migration required.


## [1.4.15] — 2026-10-11

### Changed
- **Design consistency pass across list pages.** Unified the layout, search, and table presentation of Ingredients, Packaging, Recipes, Flavours & Fillings, Products, Customers, Orders, and Saved Quotes.
- Moved search into the catalog card on every list page (previously some pages had search in a separate card, some had none).
- Added search to Flavours, Fillings, Batch Products, Assembled Products, Orders, and Saved Quotes.
- Converted the Recipes kind filter from chip buttons to the same tab styling used by Products and Flavours.
- Standardised table headers to Title Case across all list pages.
- Standardised table row actions (history / explain / edit / duplicate / delete) and added a duplicate action to Flavours, Fillings, Batch Products, and Assembled Products.

### Fixed
- **Empty-state copy** on Customers and Orders now distinguishes "no records yet" from "no matches for your search". Previously a search with zero matches showed the no-records copy.

### Notes
- Search queries persist when switching between the Flavours / Fillings tabs and between the Batch / Assembled Products tabs. This is intentional.
- Money display precision is now consistent: headline values use 2 decimals, unit rates (per gram, per kg, per piece) use 4 decimals. No calculation results changed.
- No data-model, engine, IO, store, or cloud changes. Schema remains 1.2; no migration required.

## [1.4.14] — 2026-10-11

### Changed
- Refreshed `README.md`, `PROJECT_HANDOFF.md`, and `MIGRATIONS.md` to reflect the current v1.4.13 implementation (47 tests, Material Symbols font subsetting, current schema behavior).
- Added historical-status notes to `Bakery_Costing_App_Build_Prompt.md` and `OvenCost Pro — Phased Upgrade Plan.md` to clarify their role as original specifications rather than current-state descriptions.

## [1.4.13] - 2026-10-10

### Changed
- Subsetted Material Symbols from 4.0 MB to 73 KB using the 72 icon names audited from the application (about 98% smaller).

### Notes
- The original font remains in `public/fonts/` as a rollback. The manifest and regeneration command are in `scripts/material-symbols-manifest.txt` and `scripts/subset-material-symbols.sh`.
- The source font uses the `rlig` feature for icon-name ligatures, so the subset retains `rlig` rather than `liga`.

## [1.4.12] - 2026-10-10

### Fixed
- **Settings:** Changed the minimum for Cake Batches per kg and Frosting Batches per kg to zero. Their previous `min={0.01}` with `step={0.05}` made the default values invalid under native form validation, blocking Settings submission.

## [1.4.11] - 2026-10-10

### Added
*   Unified page headers, breadcrumbs, section cards, toolbars, and Material Symbols across the redesigned application pages.

### Changed
*   Restyled the Flavours and Products tabs to match the current visual design.
*   Replaced the SearchBar emoji with the `search` Material Symbol.
*   Removed unused CSS left over from the previous design.
*   Verified the assembled-product suggested-price line with rounding enabled. The batch-product suggested-price line was reviewed in code only because no batch recipes were available for a live row check.

### Fixed
*   **Data Health:** Unpriced-ingredient warnings now navigate to Ingredients, where the price can be edited. Singular recipe-line warning paths also route to Recipes.
*   **Orders:** Delivered and Cancelled order badges now use the existing green and red badge classes.
*   **Settings:** Removed the Target Gross Margin field's HTML `max` constraint so the existing validation handler can report invalid values.
*   **Data Health:** Warning badges now use the defined `badge-amber` class.
*   **Import / Export:** Import preview badges now use the defined `badge-green` and `badge-red` classes. CSV status banners now reflect success, warning, or error states.

## [1.4.10] - 2026-10-10

### Changed
*   Redesigned the Import / Export page to match the shared visual design.

## [1.4.9] - 2026-10-10

### Changed
*   Redesigned the Data Health page to match the shared visual design.

## [1.4.8] - 2026-10-10

### Changed
*   Redesigned the Settings page to match the shared visual design.

### Fixed
*   Removed the Target Gross Margin field's HTML `max` constraint so the existing validation handler can report invalid values.

## [1.4.7] - 2026-10-10

### Changed
*   Redesigned the Saved Quotes page to match the shared visual design.
*   Replaced the gradient page title with the standard solid page title.

## [1.4.6] - 2026-10-10

### Changed
*   Redesigned the Customers page to match the shared visual design.

## [1.4.5] - 2026-10-10

### Changed
*   Redesigned the Orders page to match the shared visual design.

### Fixed
*   Delivered and Cancelled order badges now use the existing green and red badge classes.

## [1.4.4] - 2026-10-10

### Changed
*   Redesigned the Products page to match the shared visual design.

## [1.4.3] - 2026-10-10

### Changed
*   Redesigned the Flavours & Fillings page to match the shared visual design.

## [1.4.2] - 2026-10-10

### Changed
*   Redesigned the Recipes page to match the shared visual design.

## [1.4.1] - 2026-10-10

### Changed
*   Redesigned the Packaging page to match the shared visual design.

## [1.4.0] - 2026-10-10

### Changed
*   Redesigned the Ingredients page to match the shared visual design.
*   Established the shared page shell and visual patterns for the catalog pages.

## [1.3.3] - 2026-10-10

### Changed
*   Redesigned the Quote page and sidebar to establish the visual language used by subsequent pages.

## [1.3.2] and earlier

See Git tags for historical details.

## [1.1.4] - 2026-10-09

*   **Fix Google Drive backup hang:** The "Back up now" button was permanently disabled after sign-in because the `CLOUD_SIGNED_IN` and `CLOUD_SIGNED_OUT` reducer cases did not reset `cloud.busy` to `false`. Sign-in now correctly clears the busy flag, so the button enables and the backup can be triggered. The underlying Google Drive upload was working the whole time — the UI just wouldn't let the user start it.
*   **Remove redundant intermediate variable:** Simplified `createBackup()` in `src/cloud/backupManager.ts` to return the timeout-wrapped promise directly.

## [1.1.3] - 2026-10-08

*   **Lockfile sync:** Updated `package-lock.json` root `version` field from `0.0.0` to `1.1.3` to match `package.json`. No dependency versions changed. `npm ci` now works on a fresh clone without warnings.
*   **Timeout safety net:** Added a 30‑second timeout wrapper to `createBackup` and `restoreBackup` to prevent UI hangs when network calls stall.

## [1.1.2] - 2026-10-08

*   **Version drift fix:** Bumped `package.json` version from 1.1.0 to 1.1.2 to match the git tag history.

## [1.1.1] - 2026-10-08

*   **Post-audit cleanup:**
    *   Fixed `rounding_rule` → `price_rounding_step` in `MIGRATIONS.md` and `Bakery_Costing_App_Build_Prompt.md` §10.
    *   Regenerated `blank_import_template.json` at schema 1.2 (adds `customers`, `orders`, `price_rounding_step`).
    *   Tightened T27 to test what its title claims (real fixture IDs, asserts `tiers_used`).
    *   Unified `generateId` on `engine/utils.ts` across 5 UI pages.

## [1.1.0] - 2026-10-07

*   **Phase 21 — Google Drive Manual Backup & Restore:**
    *   Added manual backup and restore functionality using Google Drive's hidden `appDataFolder`.
    *   Added `VITE_GOOGLE_CLIENT_ID` configuration requirement.
    *   Integrated UI controls in the Settings and Import/Export pages.

## [1.0.0] - 2026-10-07

### Added / Implemented Phases

*   **Phase 1 — Core Architecture & Dependency Setup:** 
    *   Validated React, Vite, vitest, and decimal.js integration.
    *   Verified strict engine purity and exact mathematics.
*   **Phase 2 — Price Rounding:** 
    *   Added configurable price rounding options (nearest $1, $10, $50, $100).
    *   Provided suggested prices for Quotes, Batch Products, and Assembled Products alongside exact calculation without mutating inputs.
*   **Phase 3 — Configurable Size Guide:**
    *   Replaced hardcoded sizes with a customizable list in `Settings`.
    *   Allowed adding, editing, reordering, and deleting sizes.
*   **Phase 4 — Order and Customer Management:**
    *   Added a lightweight CRM with `customers` and `orders`.
    *   Allowed linking Saved Quotes directly to Orders.
    *   Added order status (pending, paid, completed, cancelled) and due dates.
*   **Phase 5 — Historical Pricing Data:**
    *   Added historical price tracking for ingredients.
    *   Engine automatically logs price changes when catalogue prices are updated.
*   **Phase 6 — Recipe Scaling:**
    *   Added batch multipliers to Recipes page and product editors for previewing the effects of different batch sizes.
    *   Scaling is done purely without mutating the underlying data model.
*   **Phase 9 — Sidebar Grouping and Navigation Polish:**
    *   Grouped sidebar navigation into Quote, Catalog, Records, and Tools sections.
    *   Made sidebar sections collapsible, with state persisting in IndexedDB.
    *   Added mobile drawer behaviour with correct focus management and keyboard accessibility.
*   **Phase 19 — Final Review and Documentation:**
    *   Updated `README.md`, `PROJECT_HANDOFF.md`, created `CHANGELOG.md` and `MIGRATIONS.md`.

### Skipped Phases
*   Phases 7, 8, and 10 through 18 were intentionally skipped by the user to fast-track finalization.
