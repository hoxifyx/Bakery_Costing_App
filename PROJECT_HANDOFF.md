# Project Handoff: bakery-costing-app

## What This Is
<!-- BEGIN AGENT:what_this_is -->
OvenCost Pro is a local-first bakery costing and pricing app. The app version is v1.6.0 (unreleased) with export schema 1.6; the latest published release is v1.5.0. See `CHANGELOG.md` and `MIGRATIONS.md` for release and data-format history. The phased plan and build prompt are original product documents, and their unimplemented planned phases are not a release-status checklist.
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
Google Drive backup is optional. To enable it, create a local `.env` file and set `VITE_GOOGLE_CLIENT_ID` to your Google OAuth 2.0 Client ID. See the README for setup details. Do not commit `.env`.
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
Run the automated Vitest suite:
```bash
npm test
```
<!-- END AGENT:test -->

## Project Structure
<!-- BEGIN SCRIPT:structure -->
- `public/` — static assets and fonts (includes the original and subset Material Symbols fonts)
- `scripts/` — Material Symbols icon manifest and reproducible subset script
- `src/` — application source
- `tests/` — Vitest suites
<!-- END SCRIPT:structure -->

## Entry Points
<!-- BEGIN SCRIPT:entry_points -->
- `index.html` — Vite HTML entry point
- `src/main.tsx` — React application entry point
- `src/engine/engine.ts` — calculation engine
<!-- END SCRIPT:entry_points -->

## Warnings
<!-- BEGIN SCRIPT:warnings -->
At v1.6.0, all 81 automated tests pass. Lint completes with 6 existing warnings; the production build succeeds with 2 existing warnings: an `INEFFECTIVE_DYNAMIC_IMPORT` warning for `src/cloud/drive.ts` and a bundle-size advisory. Runtime data warnings are surfaced in-app on the **Data Health** page.
<!-- END SCRIPT:warnings -->

## What's Excluded and Why
<!-- BEGIN SCRIPT:excluded -->
The current handoff bundle excludes 23 entries:
- `.DS_Store`: binary content (NUL byte detected)
- `.env`: local environment file; provide your own credentials
- `.git/` (623 files): repository metadata
- `.vscode/` (1 file): local editor settings
- `Ovencost_Pro_Costing_Final_Clean.xlsx`: source Excel workbook used to derive the spec; not required at runtime
- `dist/` (18 files): generated build output; regenerate with `npm run build`
- `node_modules/` (1047 files): dependency or build directory
- `public/.DS_Store`, `src/.DS_Store`, `src/ui/.DS_Store`: binary metadata files
- `public/fonts/`: 12 binary font files (Geist, JetBrains Mono, Material Symbols, and Outfit)
- `src/assets/hero.png`: binary file
<!-- END SCRIPT:excluded -->

## Secrets You Must Supply
<!-- BEGIN SCRIPT:secrets -->
Supply a local `.env` file with `VITE_GOOGLE_CLIENT_ID` if you want to enable optional Google Drive backup. See `README.md`; do not commit credentials.
<!-- END SCRIPT:secrets -->

## Potential Secrets Detected
<!-- BEGIN SCRIPT:potential_secrets -->
No potential secrets detected in included files. The excluded `.env` contains local credentials and must not be shared.
<!-- END SCRIPT:potential_secrets -->

## Suspicious Content
<!-- BEGIN AGENT:suspicious -->
No suspicious content detected.
<!-- END AGENT:suspicious -->

## Known Gotchas
<!-- BEGIN AGENT:gotchas -->
- Application data is stored in browser `IndexedDB`; private browsing may discard it when the session closes. Users should export backups regularly.
- Calculations use `decimal.js`; avoid binary floating-point arithmetic for monetary calculations.
- Material Symbols ligatures in the bundled font use the OpenType `rlig` feature. When regenerating the font, use the checked-in manifest and script; do not replace `rlig` with `liga`.
- `src/index.css` contains two Material Symbols `@font-face` declarations; keep both pointed at the active font asset.
<!-- END AGENT:gotchas -->

## How to Extend
<!-- BEGIN AGENT:extend -->
1.  **Data Model**: Add the new interface to `src/engine/types.ts` and update the `AppData` interface.
2.  **Engine**: If adding a computed property, update `src/engine/engine.ts`.
    - New pure helpers should follow the established pattern in `impact.ts`, `whatif.ts`, `shopping.ts`, and `nutrition.ts`: import only `./engine`, `./types`, and `decimal.js`, then re-export from `src/engine/index.ts`.
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
The v1.4.15 release is a UI-only design-consistency pass across the eight list
pages. The engine, IO, store, and data model are unchanged; schema remains 1.2
and no migration is required. Search state persistence across tabs in
Flavours/Fillings and Products is intentional. Saved quotes retain their
snapshot-based price display.

The v1.4.17 release added an optional `labour_hours` field to Recipe for
informational bookkeeping and bumped the schema to `1.3`. Old exports import
cleanly; recipes without the field are treated as 0 for display. No engine
calculation or warning behaviour changed, and no runtime migration is required.

The v1.5.0 release added product-level pricing overrides and product quotes,
including saved product-quote snapshots. The schema is now `1.4`; older exports
without the optional product fields remain valid and continue to use global
pricing defaults. Product quotes and cake quotes share the saved-quote archive.

The v1.6.0 series (tag `v1.6.0`; unreleased) adds ingredient price impact,
waste tracking (schema 1.4 → 1.5), an ephemeral what-if scratchpad, shopping
lists, and nutrition/allergen information (schema 1.5 → 1.6). It has 81 passing
automated tests and adds no dependencies. During Phase 5, recipe-to-recipe
composition was rolled back; allergen propagation uses existing product
composition instead.
<!-- END OWNER_NOTES -->

## When Not to Use This Bundle
<!-- BEGIN SCRIPT:when_not -->
If the recipient has filesystem access to the repo, use git clone.
This bundle is for: sending source to a chat AI with no filesystem,
sending a single file to a developer without repo access, or archiving
a snapshot.
<!-- END SCRIPT:when_not -->
