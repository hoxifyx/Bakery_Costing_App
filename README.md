# 🎂 OvenCost Pro

OvenCost Pro is a high-precision, offline-first web application designed for bakeries, custom cake studios, and confectioners. It helps you accurately calculate recipe costs, price your products, and generate complex multi-tier cake quotes without ever relying on error-prone spreadsheets.

## 🌟 Key Features

- **Multi-Tier Cake Quoting:** Cost out cakes up to 6 tiers, automatically applying overhead, delivery, decoration costs, and your target profit margin.
- **Accurate Recipe Costing:** Input ingredients in grams or pieces, build recipes, and let the engine instantly calculate batch yields and raw costs.
- **Scale on the Fly:** Instantly preview what scaling a recipe by 2x, 3x, or 0.5x does to your raw costs and yields.
- **Flavours & Fillings:** Mix and match recipes into base Flavours (like a Vanilla Cake + Buttercream) to cost out cake per kg.
- **Order & Customer Tracking:** Keep a basic CRM of your customers, associate quotes with orders, and track due dates and payment statuses.
- **Offline First & Private:** Your data stays on your device. The app runs completely offline using your browser's IndexedDB.

## 🚀 Installation & Deployment

OvenCost Pro is a static React application built with Vite. It requires no backend or database.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (v9 or higher)

### Run Locally
1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173` in your browser.

### Deploy to Production
To build the application for deployment (e.g., Netlify, Vercel, or GitHub Pages):
```bash
npm run build
```
Upload the contents of the `dist/` directory to any static file host. 

*(Note for developers: If deploying to a subdirectory like GitHub Pages, ensure you configure the `base` path in `vite.config.ts` prior to building!)*

## 💾 Backup & Data Management

Because OvenCost Pro is offline-first, your data lives in your browser. **You must back up your data regularly.**

1. Go to the **Import / Export** tab in the sidebar.
2. Click **Export All Data (Backup)** to save a JSON file to your computer.
3. Keep this file safe. You can restore your entire bakery setup at any time by dropping this file back into the app.

### Cloud Backup (Google Drive)
You can configure OvenCost Pro to manually backup and restore from a hidden app-specific folder in your Google Drive. 
To enable this:
1. Create a Google Cloud project and enable the **Google Drive API**.
2. Create an OAuth 2.0 Client ID for a Web Application.
3. Register your redirect URI (`http://localhost:5173` for local dev, or your production URL).
4. Create a `.env` file at the root of the project and set `VITE_GOOGLE_CLIENT_ID` to your Client ID:
   ```env
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```
5. Ensure you request the `https://www.googleapis.com/auth/drive.appdata` scope during consent. This is a hidden per-app folder the user cannot see or accidentally delete, and the app cannot see anything else in their Drive.

## 🛠️ How to Add a Feature (For Developers)

The app is built on a strict, pure calculation engine to prevent rounding drift. If you want to add a new feature or data type:

1. **Update Data Model**: Add your interface to `src/engine/types.ts` and attach it to `AppData`.
2. **Update Core Engine**: Add mathematical rules inside `src/engine/engine.ts`.
3. **Migration & IO**: Bump `CURRENT_SCHEMA_VERSION` in `src/io/io.ts` and write validation/fallback logic for old backups.
4. **Build UI**: Add your screens to `src/ui/pages/` and wire them into `App.tsx` and the sidebar (`Layout.tsx`).

_Built with React 19, Vite, and Decimal.js for mathematical precision._
