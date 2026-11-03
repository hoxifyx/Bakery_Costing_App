import { describe, expect, it } from 'vitest';
import { compute } from '../../src/engine/engine';
import { computeWhatIf } from '../../src/engine/whatif';
import { DEFAULT_SETTINGS, EMPTY_APP_DATA } from '../../src/engine/types';

describe('F2 recipe preview multiplier isolation across pricing surfaces', () => {
  it('keeps per-kg and per-item prices independent of multiplier 2', () => {
    const data = {
      ...EMPTY_APP_DATA,
      settings: { ...DEFAULT_SETTINGS, price_rounding_step: 1 },
      ingredients: [{
        id: 'flour',
        name: 'Flour',
        unit_type: 'g' as const,
        pack_quantity: 1000,
        pack_price: 100,
      }],
      recipes: [{
        id: 'cake',
        name: 'Cake',
        kind: 'cake' as const,
        lines: [{ ingredient_id: 'flour', quantity: 1000, unit: 'g' as const }],
        weight_adjustment_g: 0,
      }],
      flavours: [{
        id: 'vanilla',
        name: 'Vanilla',
        cost_model: { type: 'recipe' as const, cake_recipe_id: 'cake', frosting_recipe_id: 'cake' },
        addon_cost_per_kg: 0,
      }],
      batch_products: [
        {
          id: 'fixed',
          name: 'Fixed-count cakes',
          recipe_id: 'cake',
          pieces_mode: 'fixed' as const,
          fixed_pieces: 10,
          labour_hours_per_batch: 0,
          components: [],
          box_id: null,
          pieces_per_box: 1,
          show_each_including_box: true,
        },
        {
          id: 'weight',
          name: 'By-weight cakes',
          recipe_id: 'cake',
          pieces_mode: 'by_weight' as const,
          piece_weight_g: 100,
          labour_hours_per_batch: 0,
          components: [],
          box_id: null,
          pieces_per_box: 1,
          show_each_including_box: true,
        },
      ],
      assembled_products: [{
        id: 'assembled',
        name: 'Assembled cake kit',
        components: [{ type: 'cake_recipe_grams' as const, recipe_id: 'cake', grams: 100 }],
        labour_hours_per_batch: 0,
        pieces_per_batch: 1,
        box_id: null,
        pieces_per_box: 1,
      }],
    };
    const baseline = compute(data);
    const scaled = compute(data, undefined, { cake: 2 });
    const whatIfBase = computeWhatIf(data, { source: 'recipe', itemId: 'cake', quantity: 1, unit: 'kg' });
    const whatIfScaled = computeWhatIf(data, { source: 'recipe', itemId: 'cake', quantity: 1, unit: 'kg', batchMultiplier: 2 });

    expect(scaled.recipes.cake.raw).toBeCloseTo(baseline.recipes.cake.raw * 2);
    expect(scaled.recipes.cake.cwo).toBeCloseTo(baseline.recipes.cake.cwo * 2);
    expect(scaled.recipes.cake.weight).toBeCloseTo(baseline.recipes.cake.weight * 2);
    expect.soft(scaled.recipes.cake.cake_cost_per_kg).toBeCloseTo(baseline.recipes.cake.cake_cost_per_kg);
    expect.soft(scaled.flavours.vanilla.price_per_kg).toBeCloseTo(baseline.flavours.vanilla.price_per_kg);
    expect.soft(scaled.batch_products.fixed.cost_each).toBeCloseTo(baseline.batch_products.fixed.cost_each);
    expect.soft(scaled.batch_products.fixed.suggested_headline_each).toBe(baseline.batch_products.fixed.suggested_headline_each);
    expect.soft(scaled.assembled_products.assembled.cost_each).toBeCloseTo(baseline.assembled_products.assembled.cost_each);
    expect.soft(whatIfScaled.unitCost).toBeCloseTo(whatIfBase.unitCost);
    expect.soft(scaled.batch_products.weight.cost_each).toBeCloseTo(baseline.batch_products.weight.cost_each);
  });
});
