import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookHarness = vi.hoisted(() => ({
  state: null as any,
  effects: [] as Array<() => void>,
  refs: [] as Array<{ current: unknown }>,
  refCursor: 0,
  actions: [] as any[],
  loadAttempt: 0,
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: (callback: (...args: any[]) => unknown) => callback,
    useState: (initialValue: number) => [
      hookHarness.loadAttempt ?? initialValue,
      (value: number | ((previous: number) => number)) => {
        hookHarness.loadAttempt = typeof value === 'function'
          ? value(hookHarness.loadAttempt)
          : value;
      },
    ],
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

describe('F1 IndexedDB load failure recovery', () => {
  beforeEach(() => {
    hookHarness.state = null;
    hookHarness.effects = [];
    hookHarness.refs = [];
    hookHarness.refCursor = 0;
    hookHarness.actions = [];
    hookHarness.loadAttempt = 0;
  });

  it('does not write empty data after the persisted-data read rejects', async () => {
    const writes: unknown[][] = [];
    let openCount = 0;
    const db = {
      transaction: () => ({
        objectStore: () => ({
          get: (key: string) => {
            const request: Record<string, unknown> = { error: new Error('read rejected') };
            queueMicrotask(() => {
              if (key === 'main') (request.onerror as (() => void) | undefined)?.();
              else {
                request.result = null;
                (request.onsuccess as (() => void) | undefined)?.();
              }
            });
            return request;
          },
          put: (...args: unknown[]) => writes.push(args),
        }),
      }),
    };
    vi.stubGlobal('indexedDB', {
      open: () => {
        openCount += 1;
        const request: Record<string, unknown> = { result: db };
        queueMicrotask(() => (request.onsuccess as (() => void) | undefined)?.());
        return request;
      },
    });

    StoreProvider({ children: null });
    hookHarness.effects[0]();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(hookHarness.state.loadError).toBe('read rejected');

    hookHarness.effects = [];
    hookHarness.refCursor = 0;
    StoreProvider({ children: null });
    hookHarness.effects[1]();

    expect(openCount).toBe(1);
    expect(writes).toEqual([]);
    vi.unstubAllGlobals();
  });
});
