import { describe, expect, it } from 'vitest';
import { EMPTY_APP_DATA, type Ingredient } from '../../src/engine/types';
import { exportIngredientsCSV, importIngredientsCSV, parseCSV } from '../../src/io/io';

describe('B8 CSV import/export round trip for special characters', () => {
  it('preserves ingredient names containing commas, quotes, and newlines', () => {
    const ingredients: Ingredient[] = [{
      id: 'sugar',
      name: 'Sugar, "caster"\nblend',
      unit_type: 'g',
      pack_quantity: 1000,
      pack_price: 100,
    }, {
      id: 'butter',
      name: 'Butter',
      unit_type: 'g',
      pack_quantity: 500,
      pack_price: 90,
    }];

    const csv = exportIngredientsCSV(ingredients);
    const rows = parseCSV(csv);
    expect(rows.length).toBeGreaterThan(0);

    const imported = importIngredientsCSV(csv, EMPTY_APP_DATA.ingredients, false);
    expect(imported.errors).toEqual([]);
    expect(imported.items.map(item => item.name)).toEqual(ingredients.map(item => item.name));
  });
});
