import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { EMPTY_APP_DATA } from '../../src/engine/types';
import { QuotePage } from '../../src/ui/pages/QuotePage';

const baseData = { ...EMPTY_APP_DATA };

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

describe('R1 saved product quote reopen crash', () => {
  it('renders without crashing when the saved quote has no cake tiers', () => {
    expect(() => renderToString(React.createElement(QuotePage))).not.toThrow();
  });
});
