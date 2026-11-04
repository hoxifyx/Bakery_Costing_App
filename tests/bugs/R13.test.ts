import { describe, expect, it } from 'vitest';
import { buildImportCandidate, parseImportFile, resolveImportMode, CURRENT_SCHEMA_VERSION } from '../../src/io/io';
import { reducer } from '../../src/store/store';
import { EMPTY_APP_DATA, DEFAULT_SETTINGS, type AppData } from '../../src/engine/types';

const currentData: AppData = {
  ...EMPTY_APP_DATA,
  settings: { ...DEFAULT_SETTINGS },
  ingredients: [
    { id: 'flour', name: 'Flour', unit_type: 'g', pack_quantity: 1000, pack_price: 100 },
    { id: 'butter', name: 'Butter', unit_type: 'g', pack_quantity: 200, pack_price: 300 },
  ],
  recipes: [
    { id: 'cake', name: 'Cake', kind: 'cake', lines: [{ ingredient_id: 'flour', quantity: 100, unit: 'g' }], weight_adjustment_g: 0 },
    { id: 'cream', name: 'Cream', kind: 'frosting_filling', lines: [{ ingredient_id: 'butter', quantity: 100, unit: 'g' }], weight_adjustment_g: 0 },
  ],
  packaging_items: [{ id: 'box', name: 'Cake box', price: 30 }],
};

function partialExport(data: AppData, groups: (keyof AppData)[]): string {
  const partial: Partial<AppData> = {};
  for (const group of groups) (partial as Record<string, unknown>)[group] = data[group];
  return JSON.stringify({
    format: 'bakery-costing-data',
    schema_version: CURRENT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    app_version: '1.6.5',
    ...partial,
  });
}

const stateWith = (data: AppData) => ({ data } as Parameters<typeof reducer>[0]);

describe('R13 replace-mode imports validate the data that is actually applied', () => {
  it('accepts a partial "recipes only" export in replace mode (absent groups are retained)', () => {
    const preview = parseImportFile(partialExport(currentData, ['recipes']), currentData, { mode: 'replace' });

    expect({ valid: preview.valid, errors: preview.errors }).toEqual({ valid: true, errors: [] });
    expect(preview.counts.ingredients).toEqual({ add: 0, update: 0, unchanged: 0 });
  });

  it('applies exactly what the validated candidate describes in replace mode', () => {
    const preview = parseImportFile(partialExport(currentData, ['packaging_items']), currentData, { mode: 'replace' });
    expect(preview.valid).toBe(true);

    const candidate = buildImportCandidate(currentData, preview.parsed, 'replace');
    const applied = reducer(stateWith(currentData), {
      type: 'IMPORT_DATA',
      data: preview.parsed,
      mode: 'replace',
    });

    expect(applied.data.packaging_items).toEqual(candidate.packaging_items);
    expect(applied.data.ingredients).toEqual(candidate.ingredients);
    expect(applied.data.recipes).toEqual(candidate.recipes);
  });

  it('rejects a replace-mode file that orphans records which are retained', () => {
    // Replacing only the ingredients leaves the current recipes behind, and their
    // flour/butter references no longer resolve.
    const file = JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: CURRENT_SCHEMA_VERSION,
      ingredients: [{ id: 'sugar', name: 'Sugar', unit_type: 'g', pack_quantity: 1000, pack_price: 120 }],
    });
    const preview = parseImportFile(file, currentData, { mode: 'replace' });

    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'recipe[cake].lines[0].ingredient_id' }),
      expect.objectContaining({ path: 'recipe[cream].lines[0].ingredient_id' }),
    ]));
  });

  it('infers merge mode for partial-record imports that do not name a mode', () => {
    expect(resolveImportMode({ allowPartialIngredients: true })).toBe('merge');
    expect(resolveImportMode({ allowPartialIngredients: false })).toBe('replace');
    expect(resolveImportMode({ mode: 'replace_selected', allowPartialIngredients: true })).toBe('replace_selected');

    const file = JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: CURRENT_SCHEMA_VERSION,
      ingredients: [{ id: 'flour', allergens: ['gluten'] }],
    });
    const preview = parseImportFile(file, currentData, { allowPartialIngredients: true });

    expect(preview.valid).toBe(true);
    expect(preview.parsed.ingredients?.[0]).toMatchObject({ id: 'flour', name: 'Flour', allergens: ['gluten'] });
  });
});
