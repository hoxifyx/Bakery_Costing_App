import { describe, expect, it } from 'vitest';
import { compute } from '../../src/engine/engine';
import { EMPTY_APP_DATA } from '../../src/engine/types';

describe('B5 recipe multipliers leak into flavour and packaging cost metrics', () => {
  it('keeps flavour pricing independent from preview multipliers', () => {
    const ingredient = { id: 'flour', name: 'Flour', unit_type: 'g', pack_quantity: 1000, pack_price: 100 };
    const recipe = { id: 'recipe-1', name: 'Base cake', kind: 'cake', lines: [{ ingredient_id: 'flour', quantity: 1000, unit: 'g' }], weight_adjustment_g: 0, waste_pct: 0 };
    const flavour = { id: 'vanilla', name: 'Vanilla', cost_model: { type: 'recipe', cake_recipe_id: 'recipe-1', frosting_recipe_id: 'recipe-1' }, addon_cost_per_kg: 0 };

    const baseData = {
      ...EMPTY_APP_DATA,
      settings: { ...EMPTY_APP_DATA.settings, currency_code: 'BDT', labour_rate_per_hour: 10, overhead_pct: 0.25, target_margin: 0.3, packaging_allowance_pct: 0.1, cake_batches_per_kg: 1, frosting_batches_per_kg: 1, filling_grams_per_kg: 1000 },
      ingredients: [ingredient],
      recipes: [recipe],
      flavours: [flavour],
    };

    const base = compute(baseData);
    const scaled = compute(baseData, undefined, { 'recipe-1': 2 });

    expect(scaled.recipes['recipe-1'].cake_cost_per_kg).toBeCloseTo(base.recipes['recipe-1'].cake_cost_per_kg, 10);
    expect(scaled.flavours['vanilla'].base).toBeCloseTo(base.flavours['vanilla'].base, 10);
  });
});
