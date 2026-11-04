import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { renderToString } from 'react-dom/server';

const hookHarness = vi.hoisted(() => ({
  state: null as any,
  effects: [] as Array<() => void | (() => void)>,
  refs: [] as Array<{ current: unknown }>,
  refCursor: 0,
  stateSlots: [] as unknown[],
  stateCursor: 0,
  dispatch: null as null | ((action: any) => void),
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: (callback: (...args: any[]) => unknown) => callback,
    useState: (initialValue: unknown) => {
      const index = hookHarness.stateCursor++;
      hookHarness.stateSlots[index] ??= initialValue;
      return [
        hookHarness.stateSlots[index],
        (value: unknown) => {
          hookHarness.stateSlots[index] = typeof value === 'function'
            ? (value as (previous: unknown) => unknown)(hookHarness.stateSlots[index])
            : value;
        },
      ];
    },
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

import { StoreProvider } from '../../src/store/store';
import { Layout } from '../../src/ui/Layout';

describe('G7 IndexedDB lifecycle and save failure recovery', () => {
  beforeEach(() => {
    hookHarness.state = null;
    hookHarness.effects = [];
    hookHarness.refs = [];
    hookHarness.refCursor = 0;
    hookHarness.stateSlots = [];
    hookHarness.stateCursor = 0;
    hookHarness.dispatch = null;
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('BroadcastChannel', class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage() {}
      close() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reuses and reopens connections, surfaces a failed write, and retries successfully', async () => {
    const factory = new IDBFactory();
    const connections: IDBDatabase[] = [];
    const indexedDBProxy = new Proxy(factory, {
      get(target, property) {
        if (property === 'open') {
          return (...args: Parameters<IDBFactory['open']>) => {
            const request = target.open(...args);
            request.addEventListener('success', () => {
              if (request.result.name === 'bakery-costing') connections.push(request.result);
            });
            return request;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    vi.stubGlobal('indexedDB', indexedDBProxy);

    const renderProvider = () => {
      hookHarness.effects = [];
      hookHarness.refCursor = 0;
      hookHarness.stateCursor = 0;
      return StoreProvider({ children: null }) as React.ReactElement<{
        value: { retrySave: () => void };
      }>;
    };

    renderProvider();
    hookHarness.effects[0]();
    hookHarness.effects[2]();
    await vi.waitFor(() => {
      expect(hookHarness.state.loading).toBe(false);
      expect(connections).toHaveLength(1);
    }, { timeout: 2000 });
    expect(connections).toHaveLength(1);

    let failNextPut = true;
    const db = connections[0];
    const nativeTransaction = db.transaction.bind(db);
    db.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
      const tx = nativeTransaction(...args);
      if (args[1] !== 'readwrite') return tx;
      const nativeObjectStore = tx.objectStore.bind(tx);
      tx.objectStore = (name: string) => {
        const store = nativeObjectStore(name);
        const nativePut = store.put.bind(store);
        store.put = (value: unknown, key?: IDBValidKey) => {
          const request = nativePut(value, key);
          if (failNextPut && key === 'main') {
            failNextPut = false;
            queueMicrotask(() => tx.abort());
          }
          return request;
        };
        return store;
      };
      return tx;
    }) as IDBDatabase['transaction'];

    renderProvider();
    hookHarness.effects[2]();
    await vi.waitFor(() => {
      expect(hookHarness.state.saveError).toBeTruthy();
      expect(hookHarness.state.saving).toBe(false);
    }, { timeout: 2000 });
    expect(hookHarness.state.lastSaved).toBeNull();

    const html = renderToString(React.createElement(
      StoreProvider,
      null,
      React.createElement(Layout, { currentPage: 'quote', onNavigate: vi.fn() }, null),
    ));
    expect(html).toContain('Not saved');
    expect(html).toContain('Retry');
    expect(html).not.toContain('Saved:');

    renderProvider().props.value.retrySave();
    renderProvider();
    hookHarness.effects[2]();
    await vi.waitFor(() => {
      expect(hookHarness.state.saveError).toBeNull();
      expect(hookHarness.state.lastSaved).toBeInstanceOf(Date);
    }, { timeout: 2000 });
    expect(connections).toHaveLength(1);

    for (const currency_code of ['USD', 'EUR']) {
      const previousLastSaved = hookHarness.state.lastSaved;
      hookHarness.dispatch?.({
        type: 'SET_SETTINGS',
        settings: { ...hookHarness.state.data.settings, currency_code },
      });
      renderProvider();
      hookHarness.effects[2]();
      await vi.waitFor(() => {
        expect(hookHarness.state.lastSaved).not.toBe(previousLastSaved);
        expect(hookHarness.state.saving).toBe(false);
        expect(hookHarness.state.saveError).toBeNull();
      }, { timeout: 2000 });
    }
    expect(connections).toHaveLength(1);

    connections[0].onversionchange?.(new Event('versionchange') as IDBVersionChangeEvent);
    hookHarness.dispatch?.({
      type: 'SET_SETTINGS',
      settings: { ...hookHarness.state.data.settings, currency_code: 'CAD' },
    });
    renderProvider();
    hookHarness.effects[2]();
    await vi.waitFor(() => {
      expect(connections).toHaveLength(2);
    }, { timeout: 2000 });
    expect(connections).toHaveLength(2);

    const secondConnection = connections[1];
    secondConnection.close();
    secondConnection.onclose?.(new Event('close'));
    hookHarness.dispatch?.({
      type: 'SET_SETTINGS',
      settings: { ...hookHarness.state.data.settings, currency_code: 'GBP' },
    });
    renderProvider();
    hookHarness.effects[2]();
    await vi.waitFor(() => {
      expect(connections).toHaveLength(3);
    }, { timeout: 2000 });
    expect(connections).toHaveLength(3);
  });
});
