# Changelog

All notable changes to the Bakery Costing App (OvenCost Pro) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
