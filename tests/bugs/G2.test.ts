import { describe, expect, it } from 'vitest';
import { reducer, type StoreState } from '../../src/store/store';
import { EMPTY_APP_DATA } from '../../src/engine/types';

const initialState: StoreState = {
  data: { ...EMPTY_APP_DATA },
  undoSnapshot: null,
  undoDescription: null,
  draftClearRevision: { quote: 0, product: 0 },
  quoteInput: { tiers: [], decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 } },
  productQuoteInput: { lines: [], delivery: 0 },
  activeSavedQuote: null,
  loading: false,
  loadError: null,
  saving: false,
  lastSaved: null,
  cloud: {
    configured: false,
    signedIn: false,
    user: null,
    lastBackupAt: null,
    lastBackupFileId: null,
    busy: false,
    error: null,
  },
};

describe('G2 import undo safety', () => {
  it('invalidates the undo offer after a later data edit', () => {
    const imported = reducer(initialState, {
      type: 'IMPORT_DATA',
      data: { ingredients: [{ id: 'flour', name: 'Flour', unit_type: 'g', pack_quantity: 1000, pack_price: 50 }] },
      mode: 'merge',
    });
    const edited = reducer(imported, {
      type: 'SET_SETTINGS',
      settings: { ...imported.data.settings, currency_code: 'USD' },
    });
    const afterUndo = reducer(edited, { type: 'UNDO_IMPORT' });

    expect(afterUndo.data.settings.currency_code).toBe('USD');
    expect(afterUndo.data.ingredients).toHaveLength(1);
    expect(afterUndo.undoSnapshot).toBeNull();
    expect(afterUndo.undoDescription).toBeNull();
  });

  it('labels the most recent import and never offers undo after a later data mutation', () => {
    const first = reducer(initialState, {
      type: 'IMPORT_DATA',
      data: { ingredients: [{ id: 'flour', name: 'Flour', unit_type: 'g', pack_quantity: 1000, pack_price: 50 }] },
      mode: 'merge',
      description: 'CSV ingredient import',
    });
    const second = reducer(first, {
      type: 'IMPORT_DATA',
      data: { settings: { ...first.data.settings, currency_code: 'EUR' } },
      mode: 'replace_selected',
      description: 'settings import',
    });
    expect(second.undoDescription).toBe('settings import');
    expect(second.undoSnapshot).toBe(first.data);

    const changed = reducer(second, {
      type: 'ADD_INGREDIENT',
      item: { id: 'sugar', name: 'Sugar', unit_type: 'g', pack_quantity: 1000, pack_price: 40 },
    });
    expect(changed.undoSnapshot).toBeNull();
    expect(changed.undoDescription).toBeNull();
    expect(reducer(changed, { type: 'UNDO_IMPORT' }).data.ingredients).toHaveLength(2);
  });
});
