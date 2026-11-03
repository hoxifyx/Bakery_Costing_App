import { describe, expect, it } from 'vitest';
import { compute } from '../../src/engine/engine';
import { DEFAULT_SETTINGS, EMPTY_APP_DATA } from '../../src/engine/types';
import { parseImportFile } from '../../src/io/io';

describe('R6 missing reference warnings and import validation', () => {
  it('warns for missing flavour, product-component, assembled-component, and role references', () => {
    const data = {
      ...EMPTY_APP_DATA,
      settings: {
        ...DEFAULT_SETTINGS,
        fondant_ingredient_id: 'missing-fondant',
        edible_print_item_id: 'missing-print',
      },
      flavours: [{
        id: 'flavour-1',
        name: 'Flavour',
        cost_model: { type: 'recipe' as const, cake_recipe_id: 'missing-cake', frosting_recipe_id: 'missing-frosting' },
        addon_cost_per_kg: 1,
      }],
      batch_products: [{
        id: 'batch-1',
        name: 'Batch display name',
        recipe_id: 'missing-main',
        pieces_mode: 'fixed' as const,
        fixed_pieces: 1,
        labour_hours_per_batch: 1,
        components: [{ recipe_id: 'missing-batch-component', grams: 1 }],
        box_id: null,
        pieces_per_box: 1,
        show_each_including_box: true,
      }],
      assembled_products: [{
        id: 'assembled-1',
        name: 'Assembled display name',
        components: [
          { type: 'cake_recipe_grams' as const, recipe_id: 'missing-cake-component', grams: 1 },
          { type: 'recipe_per_gram' as const, recipe_id: 'missing-recipe-component', grams: 1 },
          { type: 'ingredient_grams' as const, ingredient_id: 'missing-ingredient-component', grams: 1 },
        ],
        labour_hours_per_batch: 1,
        pieces_per_batch: 1,
        box_id: null,
        pieces_per_box: 1,
      }],
    };
    const quoteInput = {
      tiers: [{ size_kg: 1 }],
      decoration: { fondant_kg: 1, prints: 1, flowers: 0, toppers: 0, time_hours: 1, others: 0, delivery: 0, discount: 0 },
    };
    const warnings = compute(data, quoteInput).all_warnings;

    const missingWarnings = [
      'missing-cake',
      'missing-frosting',
      'missing-main',
      'missing-batch-component',
      'missing-cake-component',
      'missing-recipe-component',
      'missing-ingredient-component',
      'missing-fondant',
      'missing-print',
    ].filter(missingId => !warnings.some(warning => warning.context.includes(missingId)));
    expect(missingWarnings.join(', ')).toBe('');
  });

  it('rejects invalid batch component and settings role references on import', () => {
    const preview = parseImportFile(JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: '1.6',
      settings: {
        ...DEFAULT_SETTINGS,
        fondant_ingredient_id: 'missing-fondant',
        edible_print_item_id: 'missing-print',
        cake_box_item_id: 'missing-cake-box',
        mdf_board_item_id: 'missing-mdf',
        standard_board_item_id: 'missing-board',
        wallpaper_item_id: 'missing-wallpaper',
      },
      recipes: [{ id: 'recipe-1', name: 'Recipe', kind: 'cake', lines: [], weight_adjustment_g: 0 }],
      batch_products: [{
        id: 'batch-1',
        name: 'Batch',
        recipe_id: 'recipe-1',
        pieces_mode: 'fixed',
        fixed_pieces: 1,
        labour_hours_per_batch: 1,
        components: [{ recipe_id: 'missing-component', grams: 1 }],
        box_id: null,
        pieces_per_box: 1,
        show_each_including_box: true,
      }],
    }), EMPTY_APP_DATA);

    expect(preview.valid).toBe(false);
    expect(preview.errors.length).toBeGreaterThan(0);
  });
});
