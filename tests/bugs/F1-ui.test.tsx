import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { EMPTY_APP_DATA } from '../../src/engine/types';
import App from '../../src/App';

const loadFailureState = vi.hoisted(() => ({
  data: null as unknown,
  loading: false,
  loadError: 'IndexedDB read rejected',
  quoteInput: {
    tiers: [],
    decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0, discount: 0 },
  },
  productQuoteInput: { lines: [], delivery: 0, discount: 0 },
  activeSavedQuote: null,
  saving: false,
  lastSaved: null,
  cloud: { configured: false, signedIn: false, user: null, lastBackupAt: null, lastBackupFileId: null, busy: false, error: null },
}));

vi.mock('../../src/store/store', () => ({
  StoreProvider: ({ children }: { children: React.ReactNode }) => children,
  useStore: () => ({ state: loadFailureState, dispatch: vi.fn() }),
}));

describe('F1 visible blocking load error', () => {
  it('offers Retry and Import / Export instead of rendering an empty-data page', () => {
    loadFailureState.data = EMPTY_APP_DATA;
    const markup = renderToString(React.createElement(App));
    expect.soft(markup).toContain('IndexedDB read rejected');
    expect.soft(markup).toContain('Retry');
    expect.soft(markup).toContain('Import / Export');
  });
});
