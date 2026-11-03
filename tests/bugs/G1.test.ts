import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DEFAULT_SETTINGS, EMPTY_APP_DATA } from '../../src/engine/types';
import type { AppData, ProductQuoteInput, QuoteInput } from '../../src/engine/types';

const hookHarness = vi.hoisted(() => ({
  state: null as any,
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  refs: [] as Array<{ current: unknown }>,
  refCursor: 0,
  dispatch: null as null | ((action: any) => void),
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: (callback: (...args: any[]) => unknown) => callback,
    useState: (initialValue: unknown) => [initialValue, () => undefined],
    useReducer: (reducer: (state: any, action: any) => any, initialState: any) => {
      if (hookHarness.state === null) hookHarness.state = initialState;
      const dispatch = (action: any) => {
        hookHarness.state = reducer(hookHarness.state, action);
      };
      hookHarness.dispatch = dispatch;
      return [hookHarness.state, dispatch];
    },
    useEffect: (effect: () => void | (() => void)) => {
      hookHarness.effects.push(effect);
    },
    useRef: (initialValue: unknown) => {
      const index = hookHarness.refCursor++;
      hookHarness.refs[index] ??= { current: initialValue };
      return hookHarness.refs[index];
    },
  };
});

const QUOTE_DRAFT_KEY = 'quote-input-draft';
const PRODUCT_DRAFT_KEY = 'product-quote-input-draft';

function seedDatabase(factory: IDBFactory, values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open('bakery-costing', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('app-data');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('app-data', 'readwrite');
      for (const [key, value] of Object.entries(values)) tx.objectStore('app-data').put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function readKey(key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bakery-costing', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('app-data', 'readonly').objectStore('app-data').get(key);
      get.onsuccess = () => {
        resolve(get.result);
        db.close();
      };
      get.onerror = () => reject(get.error);
    };
  });
}

describe('G1 in-progress quote drafts', () => {
  beforeEach(() => {
    hookHarness.state = null;
    hookHarness.effects = [];
    hookHarness.cleanups = [];
    hookHarness.refs = [];
    hookHarness.refCursor = 0;
    hookHarness.dispatch = null;
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.useRealTimers();
    vi.resetModules();
  });

  it('debounces separate drafts, restores validated input, and clears on save and reset', async () => {
    const storedData = {
      ...EMPTY_APP_DATA,
      settings: { ...DEFAULT_SETTINGS },
      flavours: [{ id: 'flavour-1', name: 'Vanilla' }],
      batch_products: [{ id: 'batch-1', name: 'Box' }],
    } as AppData;
    const quoteDraft = {
      tiers: [{ size_kg: 2, flavour_id: 'flavour-1', filling_id: 'missing-filling' }],
      decoration: { fondant_kg: 1, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 },
    };
    const productDraft = {
      lines: [
        { product_kind: 'batch', product_id: 'batch-1', quantity: 2, unit: 'box' },
        { product_kind: 'assembled', product_id: 'deleted-product', quantity: 1, unit: 'piece' },
      ],
      delivery: 3,
    };
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    await seedDatabase(factory, {
      main: storedData,
      'main-revision': 0,
      [QUOTE_DRAFT_KEY]: quoteDraft,
      [PRODUCT_DRAFT_KEY]: productDraft,
    });

    const { StoreProvider } = await import('../../src/store/store');
    const renderDraftEffects = () => {
      for (const cleanup of hookHarness.cleanups) cleanup();
      hookHarness.cleanups = [];
      hookHarness.effects = [];
      hookHarness.refCursor = 0;
      StoreProvider({ children: null });
      for (const index of [3, 4]) {
        const cleanup = hookHarness.effects[index]();
        if (typeof cleanup === 'function') hookHarness.cleanups.push(cleanup);
      }
    };

    StoreProvider({ children: null });
    hookHarness.effects[0]();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(hookHarness.state.loading).toBe(false);
    expect(hookHarness.state.quoteInput.tiers).toHaveLength(6);
    expect(hookHarness.state.quoteInput.tiers[0]).toMatchObject({
      size_kg: 2,
      flavour_id: 'flavour-1',
      filling_id: null,
    });
    expect(hookHarness.state.productQuoteInput.lines).toEqual([{
      product_kind: 'batch',
      product_id: 'batch-1',
      quantity: 2,
      unit: 'box',
      price_override: undefined,
    }]);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderDraftEffects();
    const nextQuote: QuoteInput = {
      ...hookHarness.state.quoteInput,
      tiers: hookHarness.state.quoteInput.tiers.map((tier: QuoteInput['tiers'][number], index: number) =>
        index === 0 ? { ...tier, size_kg: 3.5 } : tier),
    };
    const nextProduct: ProductQuoteInput = {
      lines: [],
      delivery: 9,
    };
    hookHarness.dispatch?.({ type: 'SET_QUOTE_INPUT', input: nextQuote });
    hookHarness.dispatch?.({ type: 'SET_PRODUCT_QUOTE_INPUT', input: nextProduct });
    renderDraftEffects();
    await vi.advanceTimersByTimeAsync(499);
    expect((await readKey(QUOTE_DRAFT_KEY) as QuoteInput).tiers[0].size_kg).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect((await readKey(QUOTE_DRAFT_KEY) as QuoteInput).tiers[0].size_kg).toBe(3.5);
    expect(await readKey(PRODUCT_DRAFT_KEY)).toMatchObject({ delivery: 9, lines: [] });
    expect(await readKey('main')).not.toHaveProperty('quoteInput');

    hookHarness.dispatch?.({ type: 'RESET_QUOTE' });
    renderDraftEffects();
    await vi.advanceTimersByTimeAsync(0);
    expect(await readKey(QUOTE_DRAFT_KEY)).toBeUndefined();

    hookHarness.dispatch?.({
      type: 'ADD_SAVED_QUOTE',
      item: { id: 'saved-quote', name: 'Saved', created_at: '2026-01-01', input: nextQuote },
    });
    renderDraftEffects();
    await vi.advanceTimersByTimeAsync(0);
    expect(await readKey(QUOTE_DRAFT_KEY)).toBeUndefined();

    hookHarness.dispatch?.({ type: 'RESET_PRODUCT_QUOTE' });
    renderDraftEffects();
    await vi.advanceTimersByTimeAsync(0);
    expect(await readKey(PRODUCT_DRAFT_KEY)).toBeUndefined();
    vi.useRealTimers();
  });

  it('ignores a corrupt draft without blocking a successful data load', async () => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    await seedDatabase(factory, {
      main: EMPTY_APP_DATA,
      'main-revision': 0,
      [QUOTE_DRAFT_KEY]: { tiers: 'not-an-array', decoration: null },
      [PRODUCT_DRAFT_KEY]: { lines: 'not-an-array', delivery: Infinity },
    });

    const { StoreProvider } = await import('../../src/store/store');
    StoreProvider({ children: null });
    hookHarness.effects[0]();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(hookHarness.state.loading).toBe(false);
    expect(hookHarness.state.loadError).toBeNull();
    expect(hookHarness.state.quoteInput.tiers).toHaveLength(6);
    expect(hookHarness.state.productQuoteInput.lines).toEqual([]);
    expect(hookHarness.state.productQuoteInput.delivery).toBe(0);
  });
});
