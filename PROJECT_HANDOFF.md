# Project Handoff: bakery-costing-app

## What This Is
<!-- BEGIN AGENT:what_this_is -->
OvenCost Pro is a local-first bakery costing and pricing app. The current release is v1.4.13; see CHANGELOG.md for shipped changes. The phased plan and build prompt are original product documents, and their unimplemented planned phases are not a release-status checklist.
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
At v1.4.13, the automated suite has 47 passing tests. The production build emits a known `INEFFECTIVE_DYNAMIC_IMPORT` warning for `src/cloud/drive.ts`; lint emits existing warnings in `tests/cloud.test.ts`, `src/store/store.tsx`, and `src/ui/pages/QuotePage.tsx`. Runtime data warnings are surfaced in-app on the **Data Health** page.
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
- Application data is stored in browser `IndexedDB`; private browsing may discard it when the session closes. Users should export backups regularly.
- Calculations use `decimal.js`; avoid binary floating-point arithmetic for monetary calculations.
- Material Symbols ligatures in the bundled font use the OpenType `rlig` feature. When regenerating the font, use the checked-in manifest and script; do not replace `rlig` with `liga`.
- `src/index.css` contains two Material Symbols `@font-face` declarations; keep both pointed at the active font asset.
<!-- END AGENT:gotchas -->

## How to Extend
<!-- BEGIN AGENT:extend -->
1.  **Data Model**: Add the new interface to `src/engine/types.ts` and update the `AppData` interface.
2.  **Engine**: If adding a computed property, update `src/engine/engine.ts`.
3.  **IO / Migrations**: Update `src/io/io.ts` to validate the new field and bump the `CURRENT_SCHEMA_VERSION`. Update `MIGRATIONS.md` with instructions.
4.  **UI**: Create a new page under `src/ui/pages/`, register it in `App.tsx`, and add a navigation link in `Layout.tsx`.
<!-- END AGENT:extend -->

## Bundle-specific notes

The source repository does not include project-bundle reconstruction utilities. If a separate bundle archive is supplied with its own verification and extraction scripts, follow that archive's instructions; otherwise, use Git to clone or copy the repository.

## Owner Notes
<!-- BEGIN OWNER_NOTES -->
The shipped release is v1.4.13. Recent releases include the page redesigns, the v1.4.12 Settings native-validation fix, and the v1.4.13 Material Symbols font subset. The latest verified test suite contains 47 passing tests.

The application data schema remains version 1.2. The v1.4.12 and v1.4.13 changes did not require data migrations; see `MIGRATIONS.md`.

The original `OvenCost Pro — Phased Upgrade Plan.md` describes proposed product phases, including phases not implemented. Consult the actual source and `CHANGELOG.md` before treating any plan item as current behavior.
<!-- END OWNER_NOTES -->

## When Not to Use This Bundle
<!-- BEGIN SCRIPT:when_not -->
If the recipient has filesystem access to the repo, use git clone.
This bundle is for: sending source to a chat AI with no filesystem,
sending a single file to a developer without repo access, or archiving
a snapshot.
<!-- END SCRIPT:when_not -->
