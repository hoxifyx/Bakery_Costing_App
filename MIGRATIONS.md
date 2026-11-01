# Migrations

This file documents schema changes and how to migrate data from older versions.

## Current Schema Version: 1.5

The schema version is checked on import in `src/io/io.ts`. Files with a newer major schema version are rejected; versions with the same or an older major version are accepted and validated using the compatibility behavior described below. Missing settings fields are filled from `DEFAULT_SETTINGS`. Omitted entity arrays are not automatically cleared by a selective import.

### `1.5` (Recipe and product waste / spoilage)
*   **Added:** optional `waste_pct` on recipes, batch products, and assembled products. Older exports default the field to `0`; values must be finite and non-negative.
*   **Calculation:** waste applies only to ingredient-derived cost before overhead. Recipe waste and product-level waste are independent, multiplicative loss events: a recipe at 3% waste used by a product at 5% waste applies `(1 + 0.03) × (1 + 0.05)` to its raw ingredient cost, never an additive 8%.
*   **Compatibility:** imports without `waste_pct` remain valid and retain existing costs. Labour, other costs, and box costs are not subject to product-level waste.

### `1.4` (Product pricing overrides and product quotes)
*   **Added:** optional per-product pricing overrides on `BatchProduct` and `AssembledProduct` for `overhead_pct`, `target_margin`, `labour_rate_per_hour`, `other_cost_per_piece`, and `my_price_*` values.
*   **Added:** optional `product_quote_input` for saved product quotes, plus `kind?: 'cake' | 'products'` support on `SavedQuote`.
*   **Compatibility:** older exports without these fields continue to import cleanly and fall back to global settings. Existing quote behaviour remains unchanged when all new values are blank.

### `1.3` (Recipe labour)
*   **Added:** optional `labour_hours` field to `Recipe`.
*   **Compatibility:** older exports without the field import cleanly; recipes
    with no `labour_hours` are treated as 0 for display purposes. No engine
    behaviour changes.

### `1.2` (Phase 4 & 5)
*   **Added:** `customers` array to `AppData`.
*   **Added:** `orders` array to `AppData`.
*   **Added:** `price_history` array to `Ingredient`.
*   **Added:** `price_rounding_step` to `Settings` (Phase 2).
*   **Compatibility:** `price_rounding_step` defaults to `0` when absent. Importing schema `1.0` initializes `customers` and `orders` as empty arrays. For other omitted entity arrays, the importer leaves those categories out of the parsed import; they are not converted to empty arrays.

### `1.1`
*   Initial production schema version.

## Application releases without schema changes

These app releases did not change the exported data schema and require no data migration:

*   **v1.4.12:** Fixed native form validation on two Settings number fields.
*   **v1.4.13:** Subsetted the Material Symbols font; app data is unchanged.
*   **v1.4.15:** Design-consistency pass across list pages; app data is unchanged.
*   **v1.4.16:** Quote-page breakpoint and size-guide pill fixes; app data is unchanged.

**v1.5.0** adds the product-pricing and product-quote schema fields described above.

The current schema is `1.5`. UI redesigns, validation fixes, and static-asset changes do not by themselves require a schema-version bump.
