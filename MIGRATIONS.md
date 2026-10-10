# Migrations

This file documents schema changes and how to migrate data from older versions.

## Current Schema Version: 1.2

The schema version is checked on import in `src/io/io.ts`. Files with a newer major schema version are rejected; older major versions are accepted with the compatibility behavior described below. Missing settings fields are filled from `DEFAULT_SETTINGS`. Omitted entity arrays are not automatically cleared by a selective import.

### `1.2` (Phase 4 & 5)
*   **Added:** `customers` array to `AppData`.
*   **Added:** `orders` array to `AppData`.
*   **Added:** `price_history` array to `Ingredient`.
*   **Added:** `price_rounding_step` to `Settings` (Phase 2).
*   **Compatibility:** `price_rounding_step` defaults to `0` when absent. Importing schema `1.0` initializes `customers` and `orders` as empty arrays. For other omitted entity arrays, the importer leaves those categories out of the parsed import; they are not converted to empty arrays.

### `1.1`
*   Initial production schema version.

## Application releases without schema changes

These app releases do not change the exported data schema and require no data migration:

*   **v1.4.12:** Fixed native form validation on two Settings number fields.
*   **v1.4.13:** Subsetted the Material Symbols font; app data is unchanged.

The current schema remains `1.2`. UI redesigns, validation fixes, and static-asset changes do not by themselves require a schema-version bump.
