# Changelog

All notable changes to the Bakery Costing App (OvenCost Pro) will be documented in this file.

## [1.1.3] - 2026-10-08

*   **Lockfile sync:** Updated `package-lock.json` root `version` field from `0.0.0` to `1.1.2` to match `package.json`. No dependency versions changed. `npm ci` now works on a fresh clone without warnings.

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
