import { describe, expect, it } from 'vitest';
import { EMPTY_APP_DATA, type AppData } from '../../src/engine/types';
import { reducer } from '../../src/store/store';

const blankState = {
  data: { ...EMPTY_APP_DATA },
  undoSnapshot: null,
  undoDescription: null,
  draftClearRevision: { quote: 0, product: 0 },
  quoteInput: { tiers: [{ size_kg: 1, flavour_id: null, filling_id: null }], decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0, discount: 0 } },
  productQuoteInput: { lines: [], delivery: 0, discount: 0 },
  activeSavedQuote: null,
  loading: false,
  loadError: null,
  saving: false,
  lastSaved: null,
  cloud: { configured: false, signedIn: false, user: null, lastBackupAt: null, lastBackupFileId: null, busy: false, error: null },
};

describe('B2 saved quote deletion', () => {
  it('does not cascade changes to an order when a quote is deleted', () => {
    const initial = {
      ...blankState,
      data: {
        ...EMPTY_APP_DATA,
        saved_quotes: [{
          id: 'quote-1',
          name: 'Cake quote',
          created_at: '2026-11-01T00:00:00.000Z',
          kind: 'cake',
          input: { tiers: [{ size_kg: 1, flavour_id: null, filling_id: null }], decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0, discount: 0 } },
          result_snapshot: { total_price: 100 },
        }],
        orders: [{ id: 'order-1', customer_id: null, quote_id: 'quote-1', status: 'Draft' }],
      } as AppData,
    };

    const next = reducer(initial, { type: 'DELETE_SAVED_QUOTE', id: 'quote-1' });

    expect(next.data.saved_quotes).toHaveLength(0);
    expect(next.data.orders[0]?.quote_id).toBe('quote-1');
  });
});

// Manual UI repro: with an order linked to a saved quote, click Delete Quote and confirm.
// The page should alert with the referencing order ID and leave the quote undeleted.
