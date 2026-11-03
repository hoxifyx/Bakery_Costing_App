import { describe, expect, it } from 'vitest';
import { compute } from '../../src/engine/engine';
import { EMPTY_APP_DATA } from '../../src/engine/types';

describe('R8 recipe line and ingredient unit mismatch', () => {
  it('warns when a recipe line unit is incompatible with its ingredient unit type', () => {
    const result = compute({
      ...EMPTY_APP_DATA,
      ingredients: [{
        id: 'egg',
        name: 'Egg',
        unit_type: 'piece',
        pack_quantity: 12,
        pack_price: 120,
      }],
      recipes: [{
        id: 'recipe-1',
        name: 'Recipe',
        kind: 'cake',
        lines: [{ ingredient_id: 'egg', quantity: 100, unit: 'g' }],
        weight_adjustment_g: 0,
      }],
    });

    expect(result.recipes['recipe-1'].warnings.some(warning => warning.code === 'W_UNIT_MISMATCH')).toBe(true);
  });
});
