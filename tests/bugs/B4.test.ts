import { describe, expect, it } from 'vitest';
import { compute } from '../../src/engine/engine';
import { EMPTY_APP_DATA } from '../../src/engine/types';

describe('B4 piece-type ingredient must warn instead of silently pricing as grams', () => {
  it('emits a warning when an assembled product ingredient_grams component points at a piece-based ingredient', () => {
    const data = {
      ...EMPTY_APP_DATA,
      settings: {
        ...EMPTY_APP_DATA.settings,
        currency_code: 'BDT',
        labour_rate_per_hour: 12,
        overhead_pct: 0.25,
        target_margin: 0.3,
        packaging_allowance_pct: 0.1,
        cake_batches_per_kg: 1,
        frosting_batches_per_kg: 1,
        filling_grams_per_kg: 1000,
      },
      ingredients: [{
        id: 'egg',
        name: 'Egg',
        unit_type: 'piece',
        pack_quantity: 12,
        pack_price: 120,
      }],
      assembled_products: [{
        id: 'assembled-1',
        name: 'Egg treat',
        components: [{ type: 'ingredient_grams', ingredient_id: 'egg', grams: 100 }],
        labour_hours_per_batch: 0,
        pieces_per_batch: 1,
        box_id: null,
        pieces_per_box: 1,
        waste_pct: 0,
      }],
    };

    const result = compute(data);

    expect(result.all_warnings.some(w => w.code === 'W_UNIT_MISMATCH')).toBe(true);
  });
});
