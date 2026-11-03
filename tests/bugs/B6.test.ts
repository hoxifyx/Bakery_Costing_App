import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compute } from '../../src/engine/engine';
import { DEFAULT_SETTINGS } from '../../src/engine/types';

const hookHarness = vi.hoisted(() => ({
  state: null as any,
  effects: [] as Array<() => void>,
  refs: [] as Array<{ current: unknown }>,
  refCursor: 0,
  actions: [] as any[],
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: (callback: (...args: any[]) => unknown) => callback,
    useState: (initialValue: unknown) => [initialValue, () => undefined],
    useReducer: (reducer: (state: any, action: any) => any, initialState: any) => {
      if (hookHarness.state === null) hookHarness.state = initialState;
      return [
        hookHarness.state,
        (action: any) => {
          hookHarness.actions.push(action);
          hookHarness.state = reducer(hookHarness.state, action);
        },
      ];
    },
    useEffect: (effect: () => void) => {
      hookHarness.effects.push(effect);
    },
    useRef: (initialValue: unknown) => {
      const index = hookHarness.refCursor++;
      hookHarness.refs[index] ??= { current: initialValue };
      return hookHarness.refs[index];
    },
  };
});

import { StoreProvider } from '../../src/store/store';

function requestWithResult(result: unknown) {
  const request: Record<string, unknown> = { result };
  queueMicrotask(() => (request.onsuccess as (() => void) | undefined)?.());
  return request;
}

describe('B6 loading older stored settings', () => {
  beforeEach(() => {
    hookHarness.state = null;
    hookHarness.effects = [];
    hookHarness.refs = [];
    hookHarness.refCursor = 0;
    hookHarness.actions = [];
  });

  it('merges missing setting defaults and initializes absent collections before compute', async () => {
    const stored = { settings: { currency_code: 'BDT', labour_rate_per_hour: 10, overhead_pct: 0.25, target_margin: 0.3 } };
    const db = {
      transaction: () => ({
        objectStore: () => ({
          get: (key: string) => requestWithResult(key === 'main' ? stored : null),
        }),
      }),
    };
    vi.stubGlobal('indexedDB', {
      open: () => requestWithResult(db),
    });

    StoreProvider({ children: null });
    hookHarness.effects[0]();
    await new Promise(resolve => setTimeout(resolve, 0));

    const loaded = hookHarness.actions.find(action => action.type === 'LOADED')?.data;
    expect(loaded.settings.packaging_allowance_pct).toBe(DEFAULT_SETTINGS.packaging_allowance_pct);
    for (const key of [
      'ingredients', 'packaging_items', 'recipes', 'flavours', 'fillings',
      'batch_products', 'assembled_products', 'saved_quotes', 'customers', 'orders',
    ] as const) {
      expect(loaded[key]).toEqual([]);
    }

    const quoteInput = {
      tiers: [{ size_kg: 1, flavour_id: null, filling_id: null }],
      decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 },
    };
    expect(() => compute(loaded, quoteInput)).not.toThrow();
    vi.unstubAllGlobals();
  });
});
