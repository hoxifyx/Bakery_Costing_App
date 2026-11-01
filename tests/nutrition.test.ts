import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { computeAllergens, computeNutrition, computeShoppingList } from '../src/engine';
import { EMPTY_APP_DATA, type AppData, type QuoteInput, type Recipe, type SavedQuote } from '../src/engine/types';
import { exportAllData, parseImportFile } from '../src/io/io';

function ingredient(
  id: string,
  name: string,
  nutrition?: NonNullable<AppData['ingredients'][number]['nutrition_per_100g']>,
  allergens?: AppData['ingredients'][number]['allergens'],
) {
  return {
    id,
    name,
    unit_type: 'g' as const,
    pack_quantity: 1000,
    pack_price: 10,
    nutrition_per_100g: nutrition,
    allergens,
  };
}

function recipe(id: string, lines: Recipe['lines'], kind: Recipe['kind'] = 'other'): Recipe {
  return { id, name: id, kind, lines, weight_adjustment_g: 0 };
}

function dataWith(recipes: Recipe[], ingredients = [] as AppData['ingredients']): AppData {
  return { ...EMPTY_APP_DATA, recipes, ingredients };
}

describe('nutrition and allergens', () => {
  it('does not mutate deeply frozen app data', () => {
    const data = dataWith([
      recipe('mix', [{ ingredient_id: 'flour', quantity: 100, unit: 'g' }]),
    ], [ingredient('flour', 'Flour', { kcal: 364, protein_g: 10, fat_g: 1, carbs_g: 76 }, ['gluten'])]);
    const freezeDeep = <T>(value: T): T => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) freezeDeep(child);
      }
      return value;
    };

    const frozen = freezeDeep(data);
    expect(() => computeNutrition(frozen, 'mix')).not.toThrow();
    expect(() => computeAllergens(frozen, 'mix')).not.toThrow();
  });

  it('T-NUT-1: sums complete nutrition data for the whole recipe and per 100 g', () => {
    const data = dataWith([
      recipe('mix', [
        { ingredient_id: 'flour', quantity: 100, unit: 'g' },
        { ingredient_id: 'sugar', quantity: 50, unit: 'g' },
      ]),
    ], [
      ingredient('flour', 'Flour', { kcal: 364, protein_g: 10, fat_g: 1, carbs_g: 76, fibre_g: 2, sodium_mg: 2 }),
      ingredient('sugar', 'Sugar', { kcal: 400, protein_g: 0, fat_g: 0, carbs_g: 100, fibre_g: 0, sodium_mg: 0 }),
    ]);

    const result = computeNutrition(data, 'mix');
    expect(result.total).toEqual({
      kcal: 564,
      protein_g: 10,
      fat_g: 1,
      carbs_g: 126,
      fibre_g: 2,
      sodium_mg: 2,
    });
    expect(result.per_100g).toEqual({
      kcal: 376,
      protein_g: 6.666666666666667,
      fat_g: 0.6666666666666666,
      carbs_g: 84,
      fibre_g: 1.3333333333333333,
      sodium_mg: 1.3333333333333333,
    });
    expect(result.warnings).toEqual([]);
  });

  it('T-NUT-2: warns on missing nutrition data and contributes zero for that ingredient', () => {
    const data = dataWith([
      recipe('mix', [{ ingredient_id: 'unknown-nutrition', quantity: 100, unit: 'g' }]),
    ], [ingredient('unknown-nutrition', 'Unknown nutrition')]);

    const result = computeNutrition(data, 'mix');
    expect(result.total).toEqual({ kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fibre_g: 0, sodium_mg: 0 });
    expect(result.warnings.some(warning => warning.code === 'W_NUTRITION_PARTIAL')).toBe(true);
  });

  it('T-NUT-3: propagates recipe allergens through a quoted batch product', () => {
    const data = dataWith([
      recipe('dough', [{ ingredient_id: 'flour', quantity: 100, unit: 'g' }]),
    ], [
      ingredient('flour', 'Flour', undefined, ['gluten', 'soy']),
    ]);
    data.batch_products = [{
      id: 'donut',
      name: 'Donut',
      recipe_id: 'dough',
      pieces_mode: 'fixed',
      fixed_pieces: 12,
      labour_hours_per_batch: 1,
      components: [],
      box_id: null,
      pieces_per_box: 1,
      show_each_including_box: false,
    }];
    const savedQuote: SavedQuote = {
      id: 'donut-order',
      name: 'Donut order',
      created_at: '2026-01-01',
      kind: 'products',
      input: { tiers: [], decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 } },
      product_quote_input: {
        lines: [{ product_kind: 'batch', product_id: 'donut', quantity: 12, unit: 'piece' }],
        delivery: 0,
      },
      result_snapshot: null,
    };

    expect(computeAllergens(data, 'donut').allergens).toEqual(['gluten', 'soy']);
    expect(computeAllergens(data, savedQuote).allergens).toEqual(['gluten', 'soy']);
  });

  it('warns when allergen data has not been recorded', () => {
    const data = dataWith([
      recipe('mix', [{ ingredient_id: 'flour', quantity: 100, unit: 'g' }]),
    ], [ingredient('flour', 'Flour')]);

    expect(computeAllergens(data, 'mix').warnings).toEqual([expect.objectContaining({
      code: 'W_ALLERGEN_UNKNOWN',
      path: 'ingredients[flour]',
    })]);
  });

  it('T-NUT-4: retains Phase 4 shopping-list aggregation and missing-ingredient warnings', () => {
    const data = dataWith([
      recipe('cake', [
        { ingredient_id: 'flour', quantity: 100, unit: 'g' },
        { ingredient_id: 'flour', quantity: 50, unit: 'g' },
        { ingredient_id: 'deleted-ing', quantity: 10, unit: 'g' },
      ], 'cake'),
      recipe('frosting', []),
    ], [ingredient('flour', 'Flour')]);
    data.flavours = [{
      id: 'plain',
      name: 'Plain',
      cost_model: { type: 'recipe', cake_recipe_id: 'cake', frosting_recipe_id: 'frosting' },
      addon_cost_per_kg: 0,
    }];
    const input: QuoteInput = {
      tiers: [{ size_kg: 1, flavour_id: 'plain' }, ...Array.from({ length: 5 }, () => ({ size_kg: 0 }))],
      decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 },
    };
    const savedQuote: SavedQuote = {
      id: 'shopping-test',
      name: 'Shopping test',
      created_at: '2026-01-01',
      kind: 'cake',
      input,
      result_snapshot: null,
    };

    const list = computeShoppingList(data, savedQuote);
    expect(list.ingredients.find(row => row.id === 'flour')?.grams).toBe(150);
    expect(list.warnings.some(row => row.id === 'ingredient:deleted-ing')).toBe(true);
  });

  it('T-NUT-5: keeps fractional macro arithmetic within 1e-9 using Decimal', () => {
    const data = dataWith([
      recipe('fractional', [{ ingredient_id: 'sample', quantity: 33.333, unit: 'g' }]),
    ], [ingredient('sample', 'Sample', { kcal: 123.456, protein_g: 1.234, fat_g: 2.345, carbs_g: 3.456 })]);
    const result = computeNutrition(data, 'fractional');
    const expected = new Decimal('33.333').div(100).mul('123.456');

    expect(Math.abs(result.total.kcal - expected.toNumber())).toBeLessThan(1e-9);
  });

  it('T-NUT-6: round-trips nutrition and allergen fields and imports older exports', () => {
    const data = dataWith([], [
      ingredient('flour', 'Flour', { kcal: 364, protein_g: 10, fat_g: 1, carbs_g: 76, fibre_g: 2, sodium_mg: 2 }, ['gluten']),
    ]);
    const exported = exportAllData(data);
    const roundTrip = parseImportFile(exported, EMPTY_APP_DATA);

    expect(roundTrip.valid).toBe(true);
    expect(roundTrip.parsed.ingredients?.[0].nutrition_per_100g).toEqual(data.ingredients[0].nutrition_per_100g);
    expect(roundTrip.parsed.ingredients?.[0].allergens).toEqual(['gluten']);

    const older = parseImportFile(JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: '1.5',
      ingredients: [{ id: 'old', name: 'Old ingredient', unit_type: 'g', pack_quantity: 100, pack_price: 5 }],
      recipes: [{ id: 'old-recipe', name: 'Old recipe', kind: 'cake', lines: [{ ingredient_id: 'old', quantity: 100, unit: 'g' }], weight_adjustment_g: 0 }],
    }), EMPTY_APP_DATA);
    expect(older.valid).toBe(true);
    expect(older.parsed.ingredients?.[0].nutrition_per_100g).toBeUndefined();
    expect(older.parsed.ingredients?.[0].allergens).toBeUndefined();
    expect(older.parsed.recipes?.[0].lines[0].ingredient_id).toBe('old');

    const invalid = parseImportFile(JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: '1.6',
      ingredients: [{
        id: 'invalid',
        name: 'Invalid ingredient',
        unit_type: 'g',
        pack_quantity: 100,
        pack_price: 5,
        nutrition_per_100g: { kcal: -1, protein_g: 0, fat_g: 0, carbs_g: 0 },
        allergens: ['unknown'],
      }],
    }), EMPTY_APP_DATA);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.some(error => error.path.endsWith('.kcal'))).toBe(true);
    expect(invalid.errors.some(error => error.path.endsWith('.allergens[0]'))).toBe(true);
  });
});
