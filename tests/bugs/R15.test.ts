/**
 * R15 — Drive restore validated with the wrong import mode.
 *
 * `restoreBackup` parsed the downloaded backup without a mode, which defaults to
 * "replace". The restore dialog then offers two buttons — "Merge into current
 * data" and "Replace all with this backup" — both gated on that single preview.
 *
 * The two modes validate different datasets, so the preview could disagree with
 * the button it was guarding:
 *
 *  - A backup whose recipe lines reference ingredients that are missing from the
 *    backup file was rejected, even though merging it into the current data keeps
 *    those ingredients and is perfectly safe.
 *  - The reverse: a preview judged valid as "replace" was also used to enable
 *    merge, without ever checking the merge result.
 *
 * The fix makes the mode an explicit parameter of `restoreBackup`, so each button
 * is gated on the preview for the mode it applies.
 */
import { describe, expect, it, vi } from 'vitest';
import * as driveModule from '../../src/cloud/drive';
import * as backupManager from '../../src/cloud/backupManager';
import { DEFAULT_SETTINGS, EMPTY_APP_DATA } from '../../src/engine/types';
import type { AppData } from '../../src/engine/types';

const ingredient = (id: string) => ({
  id,
  name: id,
  unit_type: 'g' as const,
  pack_quantity: 1000,
  pack_price: 100,
  grams_per_tsp: null,
  calories_per_100g: 0,
  protein_per_100g: 0,
  carbs_per_100g: 0,
  fat_per_100g: 0,
  fiber_per_100g: 0,
  sodium_per_100g: 0,
  allergens: [],
  density_g_per_ml: null,
});

const recipe = (id: string, ingredientId: string) => ({
  id,
  name: id,
  kind: 'cake' as const,
  lines: [{ ingredient_id: ingredientId, quantity: 100, unit: 'g' as const }],
  weight_adjustment_g: 0,
});

/** Current data holds flour + butter; the recipe on the counter uses butter. */
const currentData: AppData = {
  ...EMPTY_APP_DATA,
  settings: { ...DEFAULT_SETTINGS },
  ingredients: [ingredient('flour'), ingredient('butter')] as AppData['ingredients'],
  recipes: [recipe('cake', 'butter')] as AppData['recipes'],
};

/**
 * A backup that only contains flour, plus a recipe that needs butter. Applied as
 * "replace" it would orphan the recipe; merged into `currentData` it is harmless
 * because butter is already here.
 */
const partialBackup = JSON.stringify({
  format: 'bakery-costing-data',
  schema_version: '1.6',
  ingredients: [ingredient('flour')],
  recipes: [recipe('sponge', 'butter')],
});

function mockDownload(json: string) {
  vi.spyOn(driveModule, 'downloadBackup').mockResolvedValue(json);
}

describe('R15 backup restore validates with the mode it applies', () => {
  it('accepts a partial backup in merge mode', async () => {
    mockDownload(partialBackup);
    const preview = await backupManager.restoreBackup('f1', currentData, 'merge');
    expect(preview.valid).toBe(true);
    expect(preview.errors).toEqual([]);
  });

  it('rejects the same backup in replace mode, naming the orphaned reference', async () => {
    mockDownload(partialBackup);
    const preview = await backupManager.restoreBackup('f1', currentData, 'replace');
    expect(preview.valid).toBe(false);
    expect(preview.errors.some(e => /butter/.test(e.message))).toBe(true);
  });

  it('passes the requested mode through to reference validation', async () => {
    mockDownload(partialBackup);
    const [asMerge, asReplace] = await Promise.all([
      backupManager.restoreBackup('f1', currentData, 'merge'),
      backupManager.restoreBackup('f1', currentData, 'replace'),
    ]);
    // Same file, same current data — the mode alone decides validity.
    expect(asMerge.valid).not.toBe(asReplace.valid);
  });

  it('allows partial ingredient records only in merge mode', async () => {
    const partialRecord = JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: '1.6',
      ingredients: [{ id: 'butter', pack_price: 250 }],
    });
    mockDownload(partialRecord);

    const asMerge = await backupManager.restoreBackup('f1', currentData, 'merge');
    expect(asMerge.valid).toBe(true);
    expect(asMerge.partialIngredients).toBe(1);

    const asReplace = await backupManager.restoreBackup('f1', currentData, 'replace');
    expect(asReplace.valid).toBe(false);
  });
});
