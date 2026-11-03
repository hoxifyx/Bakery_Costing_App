import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { EMPTY_APP_DATA } from '../../src/engine/types';
import { ProductQuotePage } from '../../src/ui/pages/ProductQuotePage';

const baseData = { ...EMPTY_APP_DATA };
const productQuoteInput = {
  lines: [{ product_kind: 'assembled' as const, product_id: 'assembled-1', quantity: 1, unit: 'box' as const, price_override: null }],
  delivery: 0,
  discount: 0,
};

vi.mock('../../src/store/store', () => ({
  useStore: () => ({
    state: { data: baseData, productQuoteInput },
    dispatch: vi.fn(),
  }),
}));

describe('R10 product quote unit after changing product kind', () => {
  it('renders assembled product lines with Piece selected rather than a disabled Box', () => {
    const markup = renderToString(React.createElement(ProductQuotePage));
    expect(markup).toMatch(/<option value="piece" selected="">Piece<\/option>/);
  });
});
