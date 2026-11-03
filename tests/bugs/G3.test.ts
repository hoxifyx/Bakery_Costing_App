import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { EMPTY_APP_DATA } from '../../src/engine/types';

const hookHarness = vi.hoisted(() => ({
  state: null as any,
  effects: [] as Array<() => void | (() => void)>,
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

import { StoreProvider } from '../../src/store/store';

function readStoredData(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bakery-costing', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('app-data', 'readonly').objectStore('app-data').get('main');
      get.onsuccess = () => {
        resolve(get.result);
        db.close();
      };
      get.onerror = () => reject(get.error);
    };
  });
}

function writeOtherTab(data: unknown, revision: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bakery-costing', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('app-data', 'readwrite');
      const store = tx.objectStore('app-data');
      store.put(data, 'main');
      store.put(revision, 'main-revision');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe('G3 multi-tab write protection', () => {
  beforeEach(() => {
    hookHarness.state = null;
    hookHarness.effects = [];
    hookHarness.refs = [];
    hookHarness.refCursor = 0;
    hookHarness.actions = [];
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('keeps tab A data when tab B saves with a stale revision and blocks B', async () => {
    const tabAData = {
      ...EMPTY_APP_DATA,
      settings: { ...EMPTY_APP_DATA.settings, currency_code: 'BDT' },
    };

    StoreProvider({ children: null });
    hookHarness.effects[0]();
    hookHarness.effects[2]();
    await vi.waitFor(() => expect(hookHarness.state.loading).toBe(false));

    await writeOtherTab(tabAData, 1);
    hookHarness.effects = [];
    hookHarness.refCursor = 0;
    StoreProvider({ children: null });
    hookHarness.effects[2]();
    await vi.waitFor(() => expect(hookHarness.state.dataConflict).toBe(true));

    expect(hookHarness.state.dataConflict).toBe(true);
    expect(hookHarness.actions).toContainEqual({ type: 'DATA_CONFLICT' });
    expect(await readStoredData()).toEqual(tabAData);
  });

  it('blocks the store when another tab broadcasts a newer saved revision', () => {
    class MockBroadcastChannel {
      static latest: MockBroadcastChannel;
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();

      constructor() {
        MockBroadcastChannel.latest = this;
      }
    }
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

    StoreProvider({ children: null });
    hookHarness.effects[1]();
    MockBroadcastChannel.latest.onmessage?.({
      data: { type: 'data-saved', revision: 1 },
    } as MessageEvent);

    expect(hookHarness.actions).toContainEqual({ type: 'DATA_CONFLICT' });
    expect(hookHarness.state.dataConflict).toBe(true);
  });
});
