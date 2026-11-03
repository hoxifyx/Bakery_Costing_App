import { describe, expect, it } from 'vitest';
import { compute } from '../../src/engine/engine';
import { EMPTY_APP_DATA } from '../../src/engine/types';

describe('R12 product warnings use display names', () => {
  it('uses product names instead of internal IDs in warning contexts', () => {
    const result = compute({
      ...EMPTY_APP_DATA,
      batch_products: [{
        id: 'batch-internal-id',
        name: 'Batch Display Name',
        recipe_id: 'missing-recipe',
        pieces_mode: 'fixed',
        fixed_pieces: 0,
        labour_hours_per_batch: 0,
        components: [],
        box_id: null,
        pieces_per_box: 0,
        show_each_including_box: true,
        other_cost_per_piece: 1,
        my_price_each: 0,
        target_margin: 0.5,
      }],
      assembled_products: [{
        id: 'assembled-internal-id',
        name: 'Assembled Display Name',
        components: [],
        labour_hours_per_batch: 0,
        pieces_per_batch: 1,
        box_id: null,
        pieces_per_box: 0,
        other_cost_per_piece: 1,
        my_price_each: 0,
        target_margin: 0.5,
      }],
    });
    const relevantWarnings = [
      ...result.batch_products['batch-internal-id'].warnings,
      ...result.assembled_products['assembled-internal-id'].warnings,
    ].filter(warning => [
      'W_ZERO_PIECES',
      'W_NO_LABOUR_HOURS',
      'W_ZERO_PACK_SIZE',
      'W_PRICE_BELOW_COST',
      'W_PRICE_BELOW_TARGET',
    ].includes(warning.code));

    expect(relevantWarnings.length).toBeGreaterThanOrEqual(6);
    expect(relevantWarnings.every(warning =>
      warning.context.includes('Batch Display Name') || warning.context.includes('Assembled Display Name'),
    )).toBe(true);
  });
});
