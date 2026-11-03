import { describe, expect, it } from 'vitest';
import { EMPTY_APP_DATA, type AppData, type Recipe } from '../../src/engine/types';
import { buildImportCandidate, parseImportFile, validateImportReferences } from '../../src/io/io';

const existingRecipe: Recipe = {
  id: 'existing-recipe',
  name: 'Existing recipe',
  kind: 'cake',
  lines: [],
  weight_adjustment_g: 0,
};

describe('R5 import reference validation across modes', () => {
  it('allows merge imports to reference recipes already in the current dataset', () => {
    const currentData: AppData = { ...EMPTY_APP_DATA, recipes: [existingRecipe] };
    const preview = parseImportFile(JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: '1.6',
      recipes: [{ id: 'incoming-recipe', name: 'Incoming', kind: 'cake', lines: [], weight_adjustment_g: 0 }],
      flavours: [{
        id: 'incoming-flavour',
        name: 'Incoming flavour',
        cost_model: { type: 'recipe', cake_recipe_id: existingRecipe.id, frosting_recipe_id: existingRecipe.id },
        addon_cost_per_kg: 0,
      }],
    }), currentData, { allowPartialIngredients: true, mode: 'merge' });

    expect({ valid: preview.valid, errors: preview.errors }).toEqual({ valid: true, errors: [] });
  });

  it('rechecks references after replace-selected applies only selected groups', () => {
    const preview = parseImportFile(JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: '1.6',
      recipes: [{ id: 'incoming-recipe', name: 'Incoming', kind: 'cake', lines: [], weight_adjustment_g: 0 }],
      batch_products: [{
        id: 'incoming-product',
        name: 'Incoming product',
        recipe_id: 'incoming-recipe',
        pieces_mode: 'fixed',
        fixed_pieces: 1,
        labour_hours_per_batch: 0,
        components: [],
        box_id: null,
        pieces_per_box: 1,
        show_each_including_box: true,
      }],
    }), EMPTY_APP_DATA, { mode: 'replace_selected' });

    expect(preview.valid).toBe(true);
    const candidate = buildImportCandidate(
      EMPTY_APP_DATA,
      { batch_products: preview.parsed.batch_products },
      'replace_selected',
      ['batch_products'],
    );
    expect(validateImportReferences(candidate)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'batch_product[incoming-product].recipe_id' }),
    ]));
  });
});
