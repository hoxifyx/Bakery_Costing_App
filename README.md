# OvenCost Pro

OvenCost Pro is an offline-first costing and pricing app for bakeries, cake studios, and confectioners. Build ingredient and packaging catalogs, calculate recipe and product costs, prepare multi-tier cake quotes, and track customers and orders. Application data is stored locally in the browser.

The latest release is **v1.5.0**. See [CHANGELOG.md](./CHANGELOG.md) for release history.

## Features

- **Cake quotes:** Price cakes of up to six tiers, including recipes, fillings, decorations, labour, packaging, delivery, overhead, and target margin.
- **Product quotes:** Price batch and assembled products by quantity or box, with optional line overrides, delivery, discount, and saved product quote snapshots.
- **Catalog and costing:** Manage ingredients, packaging, recipes, flavours, fillings, batch products, and assembled products with per-product pricing overrides and live profit/margin tracking.
- **Recipe scaling and price suggestions:** Preview scaled recipe costs and optional rounded suggested prices without changing exact calculation results.
- **Size guide:** Maintain the pan-size and serving guide used to help fill quote weights.
- **Customers and orders:** Keep customer records and track order dates, due dates, and payment status.
- **Data Health:** Review warnings about missing or invalid data and navigate to the relevant records.
- **Import and export:** Create full or selective JSON exports, import validated datasets and ingredient CSVs, export ingredient and packaging CSVs, and download a blank JSON template.
- **Optional Google Drive backup:** Connect Google Drive to back up and restore data in the app-specific Drive folder.
- **Local-first storage:** App data is persisted in the browser's IndexedDB; no app server or account is required.

## Run locally

### Requirements

- Node.js `^20.19.0` or `>=22.12.0` (required by Vite 8)
- npm 9 or later

### Development

```bash
git clone https://github.com/hoxifyx/Bakery_Costing_App.git
cd Bakery_Costing_App
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

### Test, lint, and build

```bash
npm test
npm run lint
npm run build
```

To serve the production build locally:

```bash
npm run preview
```

The production site is static: deploy the contents of `dist/` to a static web host. If deploying under a URL subdirectory, configure Vite's `base` path before building.

## Back up your data

Your catalog, settings, and records are kept in the current browser profile. Export them regularly from **Import / Export** and store the downloaded JSON file somewhere safe. The page also supports selective JSON export, validated JSON import with preview and undo, CSV workflows, and blank-template downloads.

Private/incognito browsing may discard locally stored data when the private session ends. Clearing browser site data can also remove the app's local database; keep an export outside the browser.

### Optional Google Drive backup

Google Drive backup is configured at build time and requires a Google OAuth web client:

1. Enable the Google Drive API in a Google Cloud project and create an OAuth 2.0 Client ID for a web application.
2. Add the local development URL and deployed site URL to the client's authorized JavaScript origins.
3. Set `VITE_GOOGLE_CLIENT_ID` in a local `.env` file before starting or building the app:

   ```env
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

4. Use the **Import / Export** page to connect and manage backups.

The app requests the `drive.appdata` scope for its hidden, app-specific folder. Do not commit your `.env` file or credentials.

## Developer notes

- `src/engine/` contains the calculation logic. Preserve its pure-engine boundary and use `decimal.js` for monetary calculations.
- `src/io/` validates imports and exports; update it and [MIGRATIONS.md](./MIGRATIONS.md) when changing the data schema.
- `src/ui/` contains the React application and pages.
- `tests/` contains the Vitest suites.
- [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md) has maintainer notes; [OvenCost Pro — Phased Upgrade Plan.md](./OvenCost%20Pro%20%E2%80%94%20Phased%20Upgrade%20Plan.md) and [Bakery_Costing_App_Build_Prompt.md](./Bakery_Costing_App_Build_Prompt.md) are the original product specifications and plans.

### Material Symbols font

The app ships a subsetted Material Symbols Outlined font to reduce the icon-font payload. The original font is retained as a rollback. The authoritative icon list is [scripts/material-symbols-manifest.txt](./scripts/material-symbols-manifest.txt), and [scripts/subset-material-symbols.sh](./scripts/subset-material-symbols.sh) regenerates and validates the subset.

The script requires Python with `fontTools` and Brotli support. Install the local tooling with:

```bash
python3 -m pip install --user fonttools brotli
```

Then run:

```bash
scripts/subset-material-symbols.sh
```

The subset preserves the source font's `rlig` icon-name ligature feature and variable axes. If the manifest changes, regenerate the subset and verify icons in the development and production preview builds before release.

## Add a feature

1. Update the data types in `src/engine/types.ts` when a new data shape is needed.
2. Update pure calculations in `src/engine/engine.ts`, with tests for changed behavior.
3. Update import/export validation and migrations if the persisted schema changes.
4. Add or update UI under `src/ui/`, including responsive and accessible interaction states.
5. Run `npm test`, `npm run lint`, and `npm run build`; update the changelog and relevant docs.

Built with React, TypeScript, Vite, and Decimal.js.
