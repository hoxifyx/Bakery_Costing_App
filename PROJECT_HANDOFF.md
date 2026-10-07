# Project Handoff: bakery-costing-app

## What This Is
<!-- BEGIN AGENT:what_this_is -->
OvenCost Pro is a local-first bakery costing app feature-complete through Phase 9 of the upgrade plan. See CHANGELOG.md for what's in and what's skipped.
<!-- END AGENT:what_this_is -->

## Quick Start

### Prerequisites
<!-- BEGIN AGENT:prerequisites -->
- Node.js v18.0.0 or higher
- npm v9.0.0 or higher
<!-- END AGENT:prerequisites -->

### Install
<!-- BEGIN AGENT:install -->
Run the following command to install dependencies:
```bash
npm install
```
<!-- END AGENT:install -->

### Configure
<!-- BEGIN SCRIPT:configure -->
For Cloud Backup functionality, copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` to your Google OAuth 2.0 Client ID.
<!-- END SCRIPT:configure -->

### Run
<!-- BEGIN AGENT:run -->
Run the local development server:
```bash
npm run dev
```
<!-- END AGENT:run -->

### Test
<!-- BEGIN AGENT:test -->
Run the automated test suite (including all golden tests):
```bash
npm test
```
<!-- END AGENT:test -->

## Project Structure
<!-- BEGIN SCRIPT:structure -->
- `public/`
- `src/`
- `tests/`
<!-- END SCRIPT:structure -->

## Entry Points
<!-- BEGIN SCRIPT:entry_points -->
- `index.html`
<!-- END SCRIPT:entry_points -->

## Warnings
<!-- BEGIN SCRIPT:warnings -->
No build or test warnings were detected at generation time. Runtime warnings (unpriced ingredients, missing flavour/filling on a tier, discount capped to profit, orders past due, etc.) are surfaced in-app on the **Data Health** page.
<!-- END SCRIPT:warnings -->

## What's Excluded and Why
<!-- BEGIN SCRIPT:excluded -->
- `.DS_Store`: binary content (NUL byte detected)
- `Ovencost_Pro_Costing_Final_Clean.xlsx`: source Excel workbook used to derive the spec; not required at runtime
- `dist/` (5 files): dependency or build directory
- `node_modules/` (1047 files): dependency or build directory
- `src/assets/hero.png`: binary file
<!-- END SCRIPT:excluded -->

## Secrets You Must Supply
<!-- BEGIN SCRIPT:secrets -->
No secrets excluded by name.
<!-- END SCRIPT:secrets -->

## Potential Secrets Detected
<!-- BEGIN SCRIPT:potential_secrets -->
No potential secrets detected.
<!-- END SCRIPT:potential_secrets -->

## Suspicious Content
<!-- BEGIN AGENT:suspicious -->
No suspicious content detected.
<!-- END AGENT:suspicious -->

## Known Gotchas
<!-- BEGIN AGENT:gotchas -->
- The application relies heavily on `IndexedDB` for persistence. If users use Incognito/Private Browsing, their data will be wiped when the window closes.
- Calculations use `decimal.js` exclusively; avoid using standard JavaScript floating point arithmetic for any monetary or weight updates.
<!-- END AGENT:gotchas -->

## How to Extend
<!-- BEGIN AGENT:extend -->
1.  **Data Model**: Add the new interface to `src/engine/types.ts` and update the `AppData` interface.
2.  **Engine**: If adding a computed property, update `src/engine/engine.ts`.
3.  **IO / Migrations**: Update `src/io/io.ts` to validate the new field and bump the `CURRENT_SCHEMA_VERSION`. Update `MIGRATIONS.md` with instructions.
4.  **UI**: Create a new page under `src/ui/pages/`, register it in `App.tsx`, and add a navigation link in `Layout.tsx`.
<!-- END AGENT:extend -->

## How to Reconstruct
<!-- BEGIN SCRIPT:reconstruct -->
To verify:
    python3 verify_bundle.py PROJECT_BUNDLE.json

To extract:
    python3 extract_bundle.py PROJECT_BUNDLE.json <output_dir>
<!-- END SCRIPT:reconstruct -->

## Owner Notes
<!-- BEGIN OWNER_NOTES -->
The application is feature-complete up to Phase 9 of the Phased Upgrade Plan.
Core calculations (Phase 1), price rounding (Phase 2), configurable size guides (Phase 3), order management (Phase 4), historical pricing (Phase 5), recipe scaling (Phase 6), and sidebar navigation (Phase 9) are all implemented and rigorously tested.

The test suite consists of 33 passing tests with complete coverage for the added functionality. The UI is fully responsive with an accessible slide-out mobile drawer.

The user intentionally skipped Phases 7, 8, and 10 through 18. The next maintainer should review the `OvenCost Pro — Phased Upgrade Plan.md` document and implement these skipped phases if requested.
<!-- END OWNER_NOTES -->

## When Not to Use This Bundle
<!-- BEGIN SCRIPT:when_not -->
If the recipient has filesystem access to the repo, use git clone.
This bundle is for: sending source to a chat AI with no filesystem,
sending a single file to a developer without repo access, or archiving
a snapshot.
<!-- END SCRIPT:when_not -->
