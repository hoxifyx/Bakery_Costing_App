import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMPTY_APP_DATA } from '../../src/engine/types';
import { DEFAULT_PRODUCT_QUOTE_INPUT, reducer } from '../../src/store/store';
import type { StoreState } from '../../src/store/store';

describe('G7 IndexedDB lifecycle and save failure recovery', () => {
  it('reuses and reopens its connection, and exposes failed saves with Retry', () => {
    const store = readFileSync(new URL('../../src/store/store.tsx', import.meta.url), 'utf8');
    const layout = readFileSync(new URL('../../src/ui/Layout.tsx', import.meta.url), 'utf8');

    expect(/cachedDb|dbConnection|connectionPromise|dbPromise/i.test(store)).toBe(true);
    expect(/onversionchange/.test(store)).toBe(true);
    expect(/onclose/.test(store)).toBe(true);
    expect(/SAVE_FAILED/.test(store)).toBe(true);
    expect(/Not saved/.test(layout)).toBe(true);
    expect(/Retry/.test(layout)).toBe(true);
  });

  it('does not report a failed write as saved and clears the error after a successful retry', () => {
    const state: StoreState = {
      data: EMPTY_APP_DATA,
      undoSnapshot: null,
      quoteInput: {
        tiers: [],
        decoration: {
          fondant_kg: 0,
          prints: 0,
          flowers: 0,
          toppers: 0,
          time_hours: 0,
          others: 0,
          delivery: 0,
        },
      },
      productQuoteInput: DEFAULT_PRODUCT_QUOTE_INPUT,
      activeSavedQuote: null,
      loading: false,
      loadError: null,
      saving: true,
      saveError: null,
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
    const failed = reducer(state, { type: 'SAVE_FAILED', error: 'Quota exceeded' });
    expect(failed.saving).toBe(false);
    expect(failed.saveError).toBe('Quota exceeded');
    expect(failed.lastSaved).toBeNull();

    const retrying = reducer(failed, { type: 'SAVING' });
    const saved = reducer(retrying, { type: 'SAVED', at: new Date() });
    expect(saved.saveError).toBeNull();
    expect(saved.saving).toBe(false);
  });
});
