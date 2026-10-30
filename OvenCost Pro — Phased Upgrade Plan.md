# OvenCost Pro — Phased Upgrade Plan

## PROMPT — START

You are working on **OvenCost Pro** (repo name `bakery-costing-app`). It is a local-first bakery costing and pricing app built with React + TypeScript + Vite, using `decimal.js` for all money math, IndexedDB for persistence, and Vitest for tests. The full specification is in `Bakery_Costing_App_Build_Prompt.md`. The current app is a working MVP that matches that spec.

Your job is to deliver the upgrade plan below **phase by phase**. After each phase you must stop, run the full test suite, report pass/fail per test, and wait for my confirmation before starting the next phase. Do not start a phase until I have confirmed the previous one.

### Global rules that apply to every phase

1. **The engine stays pure.** Nothing in `src/engine/` may import from React, the store, IndexedDB, `window`, `document`, or `fetch`. All calculation goes through `compute()`.
2. **All money uses `decimal.js`.** Never floats. Never `Number` arithmetic on money.
3. **Golden tests T1 and T2 must still pass unchanged** unless a phase explicitly says it changes an existing formula. If a phase changes a formula, it must update the golden fixture and the spec's §8 numbers together, and say so loudly in the report.
4. **Warnings, never silent zeros.** Any new code path that can miss data must emit a warning in the existing `Warning` shape and appear on the Data Health page.
5. **No data shape changes without a migration.** If `AppData` gains a field or a field changes meaning, bump `schema_version` and add a migration function so old exports still import cleanly. The round-trip test (T12) must still pass.
6. **Responsive by default.** Every new screen and every change to an existing screen must work on phone (≤480px), tablet (481–1024px), and desktop (>1024px). Use the existing CSS variables and utility classes in `src/index.css`. Do not introduce a second design system. Test the layout at 375px, 768px, and 1280px widths before declaring a phase done.
7. **Accessibility basics.** Every interactive control has a label, every icon-only button has an `aria-label`, form inputs have associated `<label>` elements, and modals trap focus and close on Escape.
8. **No new dependencies** without saying why in the phase report. Prefer what's already installed.
9. **One feature per phase.** Do not bundle phases.
10. **Stop at each phase boundary.** Report format at the end of every phase:

    ```
    PHASE <n> — <name>
    Files changed: <list>
    Tests added: <list>
    Tests run: <n> passed, <n> failed
    Golden tests T1/T2: PASS / FAIL
    Round-trip test T12: PASS / FAIL
    Responsive check: 375px PASS/FAIL, 768px PASS/FAIL, 1280px PASS/FAIL
    Migrations added: <list or none>
    New warnings added: <list or none>
    Known issues: <list or none>
    Waiting for confirmation to start Phase <n+1>.
    ```

Wait for me to reply "confirmed" (or "fix X first") before moving on.

---

## Phase 1 — Saved Quotes

**Goal:** Let the user save a quote, reopen it later, and choose to recalculate it with current prices.

**User-visible behaviour:**
- On the Quote page, add a "Save quote" button next to Reset. It opens a small dialog asking for a name (pre-filled with a default like "Quote 2026-10-07") and optional notes.
- A new "Saved Quotes" page is added to the sidebar (grouped under a new "Records" section, see Phase 9 for sidebar grouping).
- The Saved Quotes page lists all saved quotes: name, date saved, the total price at save time, and a "Recalculate with current prices" button on each row.
- Clicking a saved quote opens it: the tier and decoration inputs are loaded back into the Quote page, and a banner at the top says "Loaded from saved quote: <name> — <saved date>". A "Recalculate with current prices" button appears in that banner. Clicking it updates the displayed result without changing the saved snapshot.
- Deleting a saved quote asks for confirmation.
- Saved quotes are included in the full JSON export and import.

**Data model:** `SavedQuote` already exists in the spec. Store `input`, `result_snapshot` (the engine result at save time), `created_at`, `name`, and optional `notes`. Add `updated_at` too.

**Warnings:** none new.

**Tests:** add tests for save → export → import → load (round trip), and for "recalculate with current prices" producing the same numbers as a fresh compute on the same inputs.

**Responsive:** Saved Quotes page is a card list on mobile (one card per quote), a table on desktop.

---

## Phase 2 — Price Rounding

**Goal:** Show a rounded suggested selling price alongside the exact one.

**User-visible behaviour:**
- Add `price_rounding_step` to Settings (it already exists in the spec as an optional field). Default 0 = off.
- When > 0, the Quote page shows a second line under Total Price: "Suggested: BDT 7,320 (rounded to nearest 10)". Same for batch and assembled product prices.
- A small note explains that rounding is display-only and never used in calculations.

**Engine:** rounding is a *display helper* generated by the engine in the audit, not a change to any stored number. `margin_check` and `total_price` stay exact.

**Tests:** add tests for rounding at step 1, 10, 50, and 100; and a test asserting that rounding never changes `total_price`, `profit`, or `margin_check`.

**Responsive:** the rounded line is a second row on mobile, inline on desktop.

---

## Phase 3 — Editable Size Guide

**Goal:** Let the user edit pan sizes in Settings instead of using the fixed default.

**User-visible behaviour:**
- Settings gets a "Size Guide" card with a small editable table: label, kg, servings. Add / edit / delete rows. Drag to reorder.
- The Quote page's size pills read from this list (already do) and update live.
- Defaults are the Appendix B list.

**Data model:** `size_guide` already exists.

**Tests:** add tests for editing the guide and confirming the quote's size pills reflect the change.

**Responsive:** the settings table becomes stacked cards on mobile.

---

## Phase 4 — Customers and Orders

**Goal:** Attach a customer and an order date to a saved quote, and browse quotes by customer.

**User-visible behaviour:**
- A new entity **Customer**: name, phone, email, address, notes.
- A new entity **Order**: customer reference, quote reference, order date, due date, status (Draft / Confirmed / Delivered / Cancelled), notes.
- A new "Customers" page: list, search, add/edit/delete. Deleting a customer with orders is blocked and lists the orders.
- A new "Orders" page: list, filter by customer and status, add/edit/delete. Each order can be opened to see its linked quote.
- On the Save Quote dialog, add optional Customer and Order fields.
- Saved Quotes list shows the customer name and order status if set.

**Data model:** add `customers: Customer[]` and `orders: Order[]` to `AppData`. Bump `schema_version` to `1.1`. Add a migration that fills both with `[]` for old exports.

**Warnings:** add `W_ORDER_WITHOUT_QUOTE` (an order has no linked quote) and `W_ORDER_PAST_DUE` (due date is before today and status is not Delivered/Cancelled). Show both in Data Health.

**Tests:** round trip with customers and orders; delete-protection for a customer with orders; migration of an old v1.0 export.

**Responsive:** customers and orders are card lists on mobile, tables on desktop.

---

## Phase 5 — Ingredient Price History

**Goal:** Track how ingredient prices change over time and show the effect on quotes.

**User-visible behaviour:**
- Every ingredient gets a "Price history" panel (accessible from its edit dialog and from a small clock icon in the list).
- Each entry is: date, pack_quantity, pack_price, note.
- The ingredient's current `pack_price` and `pack_quantity` remain the editable source of truth; saving an edit that changes either automatically appends a history entry with today's date.
- A small sparkline or simple line chart of price-per-gram over time in the history panel.
- On the Quote page, if any ingredient used by the selected flavours/fillings changed price since the last save of a loaded saved quote, show an amber note: "Ingredient prices have changed since this quote was saved."

**Data model:** add `price_history?: { date: string; pack_quantity: number; pack_price: number; note?: string }[]` to `Ingredient`. This is additive; old exports without it just have no history. Bump `schema_version` to `1.2` and add a migration that leaves the field undefined.

**Tests:** appending a history entry on edit; comparing a saved quote's snapshot to current prices.

**Responsive:** the history panel is a modal on mobile, a side panel on desktop.

---

## Phase 6 — Recipe Scaling

**Goal:** Let the user scale a recipe on the fly (e.g. "make 2.5 batches") without editing its stored quantities.

**User-visible behaviour:**
- On the Recipes page, each row gets a "Scale" control (a small number input, default 1).
- The list shows the scaled cost, cwo, weight, and per-gram cost alongside the base figures when scale ≠ 1.
- On the Quote page, and in product editors, when a recipe is selected, a small "Batch multiplier" input appears next to it. Default 1.
- Scaled values are for preview only; the stored recipe is never mutated by scaling.

**Engine:** add an optional `batch_multiplier` on the relevant call sites. The engine computes the scaled values without mutating input. `compute()` keeps its signature; a new optional parameter carries multipliers keyed by recipe id.

**Tests:** scaling by 1 is a no-op; scaling by 0.5 and 2 produces exactly half/double the raw cost, cwo, and weight.

**Responsive:** the scale control is inline on desktop, a labelled field on mobile.

---

## Phase 7 — Bulk Price Update by Percentage

**Goal:** Raise or lower all ingredient (and optionally packaging) prices by a percentage in one action.

**User-visible behaviour:**
- On the Ingredients page, a "Bulk update prices" button opens a dialog: choose "Ingredients only" or "Ingredients and packaging", enter a percentage (positive or negative), and see a preview table of every affected item with old price → new price and the delta.
- Confirm applies the change in one atomic action and records one undo snapshot.
- A second button "Undo last bulk update" appears for the rest of the session.

**Store:** new action `BULK_PRICE_UPDATE` with a preview and apply, and an `UNDO_BULK_UPDATE` that restores the snapshot.

**Tests:** +10% on a fixture, -5% on a fixture, preview matches apply, undo restores exactly.

**Responsive:** the preview table becomes a stacked list on mobile.

---

## Phase 8 — Search, Filters, and Sorting Everywhere

**Goal:** Every list page (Ingredients, Packaging, Recipes, Flavours, Fillings, Products, Customers, Orders, Saved Quotes) has consistent search, filtering, and sorting.

**User-visible behaviour:**
- Each list page has a search box (where it doesn't already), one or more filter dropdowns appropriate to the entity, and clickable column headers to sort by any column (ascending / descending).
- Sort and filter choices persist per page in the session (React state is fine; no need to persist to disk).
- A "Clear filters" button appears when any filter is active.
- On mobile, filters collapse into a single "Filters" button that opens a sheet.

**Tests:** sorting by name, price, and date; filter combinations; clear resets to defaults.

**Responsive:** filters collapse on mobile as described; table columns are prioritised — low-priority columns drop on narrow screens.

---

## Phase 9 — Sidebar Grouping and Navigation Polish

**Goal:** Group the growing sidebar into sections and make navigation comfortable on every device.

**User-visible behaviour:**
- Sidebar sections: **Quote** (Quote, Saved Quotes), **Catalog** (Ingredients, Packaging, Recipes, Flavours & Fillings, Products), **Records** (Customers, Orders), **Tools** (Data Health, Import / Export, Settings).
- Section headings are collapsible; collapsed state persists in IndexedDB.
- Mobile: sidebar is a slide-in drawer with a backdrop. On open, focus moves to the first nav item; on close, focus returns to the menu button. Escape closes.
- The Data Health badge sits on the Data Health nav item.
- The autosave footer stays pinned to the bottom of the sidebar.

**Tests:** none for layout, but keep all existing tests green.

**Responsive:** verify drawer behaviour at 375px; verify section collapse at 768px and 1280px.

---

## Phase 10 — Print and PDF

**Goal:** Turn the Quote page into a printable, branded quote.

**User-visible behaviour:**
- "Print" on the Quote page produces a clean printed page: business name (new Settings field `business_name`), customer name and contact if set, the tier breakdown, decoration lines, totals, discount, effective margin, and a footer with the date and a thank-you line.
- A "Download PDF" button uses the browser's print-to-PDF (no new dependency) with a note explaining this.
- Print CSS is added so the sidebar, nav, buttons, and warnings are hidden in print.
- Sensitive internals (cost, overhead, profit, margin) are **not** shown on the customer-facing print; a second "Print (internal)" option shows everything for the baker.

**Data model:** add `business_name` and optional `business_contact` to `Settings`. Bump `schema_version` to `1.3` with a migration that leaves them blank.

**Tests:** snapshot test the customer-facing print output structure (not pixel-exact, just the presence of fields and absence of internal fields).

**Responsive:** print layout is A4; on-screen it stays the existing layout.

---

## Phase 11 — Multi-Currency Display

**Goal:** Store everything in one base currency, but display prices in another.

**User-visible behaviour:**
- Settings gets `base_currency_code` (existing `currency_code` becomes the display code) and `display_currency_code`, plus `fx_rate` (display = base × fx_rate).
- Every money display in the app reads from a single `formatMoney()` helper that respects the display currency.
- The engine still computes everything in the base currency. Only the display layer converts. The audit tree shows both base and display amounts.
- A small info tooltip explains this.

**Data model:** rename semantics carefully. Keep `currency_code` as the base to avoid breaking existing data; add `display_currency_code` and `fx_rate`. Bump `schema_version` to `1.4`.

**Tests:** changing `fx_rate` does not change any engine number; `formatMoney` respects both currencies.

**Responsive:** no layout change.

---

## Phase 12 — Tax / VAT

**Goal:** Add an optional tax on top of the discounted price.

**User-visible behaviour:**
- Settings gets `tax_pct` (default 0) and `tax_label` (default "VAT"), plus `tax_included_in_price` boolean.
- If `tax_included_in_price` is false, the quote shows: Subtotal (after discount) → Tax → Total. Tax is on the discounted subtotal.
- If true, the quote shows "Includes <label> of BDT X" below the Total, and the Total is unchanged.
- Tax is never part of the profit base and never part of the cost. It is a pure pass-through line.
- Data Health warns `W_TAX_LABEL_BLANK` if `tax_pct > 0` and `tax_label` is empty.

**Data model:** add the three fields to `Settings`. Bump `schema_version` to `1.5`.

**Tests:** tax off is a no-op; tax on adds the expected amount; tax included vs excluded; margin_check and effective_margin are unchanged by tax.

**Responsive:** the tax row sits between Subtotal and Total; same on all sizes.

---

## Phase 13 — Wastage and Spoilage Rate

**Goal:** Add a global wastage rate applied once to raw ingredient costs.

**User-visible behaviour:**
- Settings gets `wastage_pct` (default 0) with an explanation: "Applied once to raw ingredient costs to account for spoilage and trim loss."
- The recipe audit tree gains a "Wastage" step between raw cost and cwo. Overhead is applied on the post-wastage cost.
- Data Health shows the total impact of wastage across all recipes as a KPI card.

**Engine:** inside `computeRecipe`, apply `raw_cost_after_wastage = raw_cost * (1 + wastage_pct)` and use that everywhere `raw_cost` is currently used for overhead. `line_cost` values in the audit stay pre-wastage; a new step shows the adjustment.

**Tests:** wastage 0 is a no-op (T1 and T2 unchanged); wastage 5% raises every recipe's cwo by exactly 5% on the raw portion; a bought filling is unaffected (it isn't a recipe).

**Responsive:** no layout change.

---

## Phase 14 — Cost of Capital

**Goal:** Add a global "cost of capital" rate applied once to the total cost of a quote, for users who want to account for financing or opportunity cost.

**User-visible behaviour:**
- Settings gets `cost_of_capital_pct` (default 0) with a clear explanation that it is applied to `total_cost` before profit and is **not** profit and **not** tax.
- The quote audit tree gains a step "Cost of capital" between total cost and profit.
- The quote's Total Price reflects it.

**Engine:** in `computeQuote`, after `total_cost` is computed (including delivery), add `cost_of_capital = total_cost * cost_of_capital_pct` and include it in the base for profit: `profit_base = total_cost + cost_of_capital - delivery`.

**Tests:** cost 0 is a no-op (T1 and T2 unchanged); a positive rate raises profit proportionally and shows a new audit step; delivery is excluded from the cost-of-capital base.

**Responsive:** one extra row on the quote; no layout change.

---

## Phase 15 — Multi-Recipe Components

**Goal:** Allow a recipe to reference another recipe as a line (e.g. a cake recipe that uses a base sponge recipe, or a frosting that uses a caramel recipe).

**User-visible behaviour:**
- `RecipeLine` gains an optional alternative shape: `{ recipe_id: Id; quantity: number }` instead of `{ ingredient_id: Id; quantity; unit }`. The line editor lets the user pick either an ingredient or a recipe.
- When a recipe is picked, the line's quantity is in grams (or in "batches" — the editor lets the user choose). Cost per gram comes from `per_gram_cwo`; cost per batch comes from `cwo`.
- The engine resolves nested recipes depth-first, detects cycles, and emits `W_CIRCULAR_RECIPE` if a cycle is found.
- The audit tree nests sub-recipe audits under the line.
- `exclude_from_weight` and `piece_weight_g_override` do not apply to recipe lines.

**Data model:** extend `RecipeLine` with a discriminated union: `{ kind: 'ingredient', ... }` or `{ kind: 'recipe', ... }`. To avoid breaking existing exports, support the old shape on import and migrate it to the new shape internally. Bump `schema_version` to `1.6` with a migration that adds `kind: 'ingredient'` to every existing line.

**Warnings:** add `W_CIRCULAR_RECIPE`, `W_SUB_RECIPE_MISSING`.

**Tests:** nested recipe cost and weight; cycle detection; migration of a 1.5 export.

**Responsive:** the line editor becomes a two-row stacked layout on mobile.

---

## Phase 16 — PWA and Offline Install

**Goal:** Make the app installable and fully usable offline after first load.

**User-visible behaviour:**
- Add `vite-plugin-pwa` with a manifest: name "OvenCost Pro", theme colour matching the existing purple accent, existing favicon, standalone display.
- Cache the app shell and all assets. Serve a friendly offline fallback.
- When the browser supports install, show a subtle "Install app" button in the sidebar footer. Dismissing it hides it for the session.
- No push notifications, no analytics, no service-worker sync.

**Tests:** existing tests must still pass. Add a build-time check that the manifest is emitted.

**Responsive:** install button works on mobile (Android / iOS add-to-homescreen) and desktop.

---

## Phase 17 — Reporting Dashboard

**Goal:** A single page that summarises saved quotes, orders, and price trends.

**User-visible behaviour:**
- A new "Dashboard" page under **Tools**.
- KPI cards: total quotes saved, total confirmed orders, average margin after discount, average order value, top 5 flavours by usage, top 5 customers by order count.
- A simple line chart of average margin over the last 12 months of saved quotes.
- A small "recently changed ingredient prices" list (from Phase 5).
- Filters: date range, customer, flavour.
- All numbers are computed from saved quotes and orders using the pure engine where relevant.

**Data model:** none new. `SavedQuote` and `Order` already carry what's needed.

**Tests:** aggregate metrics on a fixture with several saved quotes.

**Responsive:** KPI cards stack 1-up on mobile, 2-up on tablet, 4-up on desktop. Chart scales to container width.

---

## Phase 18 — Responsive and Accessibility Audit

**Goal:** A final pass to guarantee the app feels right on every device and is accessible.

**User-visible behaviour:**
- Every page is verified at 320px, 375px, 480px, 768px, 1024px, 1280px, and 1920px widths. No horizontal scroll. No overlapping controls. No truncated button labels.
- All tables become card lists on screens < 640px unless they have ≤ 3 columns.
- All modals are scrollable on short screens and have a sticky footer.
- All form inputs are ≥ 44px tall on touch devices.
- Keyboard navigation works everywhere: Tab order is sensible, focus rings are visible, Escape closes modals, Enter submits forms.
- Screen-reader labels on all icon-only controls. `aria-live` regions announce "Saved", "Import applied", "Discount capped", and other transient states.
- Colour contrast on all text meets WCAG AA.
- A short `ACCESSIBILITY.md` is added describing the testing approach.

**Tests:** none automated for layout, but a checklist is added to the repo, and existing tests stay green.

**Responsive:** this phase is entirely about responsiveness.

---

## Phase 19 — Final Review and Documentation

**Goal:** Freeze the app at a clean state and update all documentation.

**User-visible behaviour:**
- `README.md` rewritten for a real user: what the app is, how to install, how to back up, how to deploy, how to add a feature.
- `PROJECT_HANDOFF.md` fully filled in (every placeholder section complete).
- `Bakery_Costing_App_Build_Prompt.md` updated: every phase is documented under a new "§10 — Extensions" section, with the final data model and the final `schema_version`.
- A `CHANGELOG.md` listing every phase with the date it landed.
- A `MIGRATIONS.md` listing every schema version and how to migrate forward.
- Golden test fixtures regenerated to reflect any intentional formula changes from Phases 12–15, with the change explained in the changelog.
- One final full test run: all tests pass, T1/T2 are green (or intentionally updated with a written justification), round-trip passes, and the app builds cleanly.

**Tests:** full suite.

**Responsive:** final manual check across the seven widths listed in Phase 18.

### Current documentation status (updated 2026-10-30)

This file records the original phased proposal and should not be read as a definitive inventory of shipped features. The app's current release is v1.5.0 with export schema `1.4`; consult `CHANGELOG.md`, `MIGRATIONS.md`, `README.md`, and `PROJECT_HANDOFF.md` for current release details and maintenance instructions. The current automated suite has 49 passing tests.

The v1.4.12 Settings validation fix and v1.4.13 Material Symbols font subset are release-series work outside the original feature-phase sequence. The v1.5.0 product pricing and quote upgrade is also release-series work outside these original phases. The subset uses the source font's `rlig` ligature feature and is reproducible from `scripts/material-symbols-manifest.txt` with `scripts/subset-material-symbols.sh`. See `MIGRATIONS.md` for current schema details.

---

## PROMPT — END

Historical kickoff instruction (superseded): start with **Phase 1 — Saved Quotes**, run the full test suite, and wait for confirmation before starting Phase 2. The current shipped release and completed work are documented above and in `CHANGELOG.md`.

---
