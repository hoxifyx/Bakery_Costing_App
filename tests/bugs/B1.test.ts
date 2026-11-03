import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { EMPTY_APP_DATA } from '../../src/engine/types';
import { QuotePage } from '../../src/ui/pages/QuotePage';

const baseData = {
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
  flavours: [],
  fillings: [],
  recipes: [],
  ingredients: [],
  packaging_items: [],
};

vi.mock('../../src/store/store', () => ({
  useStore: () => ({
    state: {
      data: baseData,
      quoteInput: { tiers: [], decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0, discount: 0 } },
      activeSavedQuote: null,
      loading: false,
      saving: false,
      lastSaved: null,
      cloud: { configured: false, signedIn: false, user: null, lastBackupAt: null, lastBackupFileId: null, busy: false, error: null },
    },
    dispatch: vi.fn(),
  }),
}));

describe('B1 saved product quote crash regression', () => {
  it('renders when a quote has zero cake tiers', () => {
    expect(() => renderToString(React.createElement(QuotePage))).not.toThrow();
  });
});
