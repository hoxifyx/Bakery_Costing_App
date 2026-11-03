import { describe, expect, it } from 'vitest';
import { EMPTY_APP_DATA, type AppData } from '../../src/engine/types';
import { reducer } from '../../src/store/store';

const blankState = {
  data: { ...EMPTY_APP_DATA },
  undoSnapshot: null,
  undoDescription: null,
  draftClearRevision: { quote: 0, product: 0 },
  quoteInput: { tiers: [], decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0, discount: 0 } },
  productQuoteInput: { lines: [], delivery: 0, discount: 0 },
  activeSavedQuote: null,
  loading: false,
  loadError: null,
  saving: false,
  lastSaved: null,
  cloud: { configured: false, signedIn: false, user: null, lastBackupAt: null, lastBackupFileId: null, busy: false, error: null },
};

describe('R7 saved quote reference deletion guards', () => {
  it('does not remove a referenced flavour or product through deletion actions', () => {
    const initial = {
      ...blankState,
      data: {
        ...EMPTY_APP_DATA,
        flavours: [{ id: 'flavour-1', name: 'Vanilla', cost_model: { type: 'average', of: [] }, addon_cost_per_kg: 0 }],
        batch_products: [{
          id: 'batch-1',
          name: 'Cookies',
          recipe_id: 'recipe-1',
          pieces_mode: 'fixed',
          fixed_pieces: 1,
          labour_hours_per_batch: 0,
          components: [],
          box_id: null,
          pieces_per_box: 1,
          show_each_including_box: true,
        }],
        saved_quotes: [{
          id: 'quote-1',
          name: 'Saved product quote',
          created_at: '2026-11-03T00:00:00.000Z',
          kind: 'products',
          input: { tiers: [{ size_kg: 1, flavour_id: 'flavour-1' }], decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 } },
          product_quote_input: {
            lines: [
              { product_kind: 'batch', product_id: 'batch-1', quantity: 1, unit: 'piece' },
              { product_kind: 'assembled', product_id: 'assembled-1', quantity: 1, unit: 'piece' },
            ],
            delivery: 0,
          },
          result_snapshot: null,
        }],
        assembled_products: [{
          id: 'assembled-1',
          name: 'Cake kit',
          components: [],
          labour_hours_per_batch: 0,
          pieces_per_batch: 1,
          box_id: null,
          pieces_per_box: 1,
        }],
      } as AppData,
      };
      const afterFlavourDelete = reducer(initial, { type: 'DELETE_FLAVOUR', id: 'flavour-1' });
      const afterProductDelete = reducer(initial, { type: 'DELETE_BATCH_PRODUCT', id: 'batch-1' });
      const afterAssembledDelete = reducer(initial, { type: 'DELETE_ASSEMBLED_PRODUCT', id: 'assembled-1' });

      expect({
        flavourRemains: afterFlavourDelete.data.flavours.some(item => item.id === 'flavour-1'),
        productRemains: afterProductDelete.data.batch_products.some(item => item.id === 'batch-1'),
        assembledRemains: afterAssembledDelete.data.assembled_products.some(item => item.id === 'assembled-1'),
      }).toEqual({ flavourRemains: true, productRemains: true, assembledRemains: true });
  });
});
