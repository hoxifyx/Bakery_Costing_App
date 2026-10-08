# Migrations

This file documents schema changes and how to migrate data from older versions.

## Current Schema Version: 1.2

The schema version is checked on import in `src/io/io.ts`.
Major version mismatches are rejected. Minor version mismatches are accepted, and defaults are applied for any missing fields.

### `1.2` (Phase 4 & 5)
*   **Added:** `customers` array to `AppData`.
*   **Added:** `orders` array to `AppData`.
*   **Added:** `price_history` array to `Ingredient`.
*   **Added:** `price_rounding_step` to `Settings` (Phase 2).
*   **Migration:** When importing a `1.1` file, the import validator will automatically initialize the new `customers`, `orders`, and `price_history` fields to empty arrays, and `price_rounding_step` to `none`.

### `1.1`
*   Initial production schema version.
