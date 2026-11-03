import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DataHealthPage } from '../../src/ui/pages/DataHealthPage';

const { warnings } = vi.hoisted(() => ({
  warnings: [
    { code: 'W_WASTE_HIGH', context: 'recipe warning', path: 'recipe[r1].waste_pct' },
    { code: 'W_WASTE_HIGH', context: 'flavour warning', path: 'flavour[f1]' },
    { code: 'W_WASTE_HIGH', context: 'filling warning', path: 'filling[fi1]' },
    { code: 'W_WASTE_HIGH', context: 'batch warning', path: 'batch_product[b1]' },
    { code: 'W_WASTE_HIGH', context: 'assembled-products warning', path: 'assembled_products[a1]' },
    { code: 'W_WASTE_HIGH', context: 'assembled warning', path: 'assembled[a2]' },
    { code: 'W_WASTE_HIGH', context: 'settings warning', path: 'settings.edible_print_item_id' },
    { code: 'W_WASTE_HIGH', context: 'order warning', path: 'order[o1]' },
    { code: 'W_WASTE_HIGH', context: 'product quote warning', path: 'lines[0].product_id' },
    { code: 'W_DISCOUNT_CAPPED', context: 'product quote discount warning', path: 'discount' },
  ],
}));

vi.mock('../../src/store/store', () => ({
  useStore: () => ({
    state: {
      data: {
        settings: { currency_code: 'BDT' },
        ingredients: [],
        recipes: [],
        flavours: [],
        batch_products: [],
        assembled_products: [],
      },
    },
  }),
}));

vi.mock('../../src/engine', () => ({
  compute: () => ({ all_warnings: warnings, recipes: {}, batch_products: {}, assembled_products: {} }),
  computeAllergens: () => ({ warnings: [] }),
  computeNutrition: () => ({ warnings: [] }),
}));

describe('R3 Data Health path routing', () => {
  it('routes every catalog and record path prefix emitted by the engine away from Quote', () => {
    const markup = renderToString(React.createElement(DataHealthPage, { onNavigate: vi.fn() }));
    for (const page of ['recipes', 'flavours', 'products', 'settings', 'orders', 'product_quote']) {
      expect(markup).toContain(`View <!-- -->${page}`);
    }
    const discountRow = markup.slice(markup.indexOf('product quote discount warning'));
    expect(discountRow.slice(0, 400)).toContain('View <!-- -->product_quote');
    expect(markup).not.toContain('View <!-- -->quote');
  });
});
