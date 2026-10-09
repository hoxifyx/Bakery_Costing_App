/**
 * IndexedDB-backed store using React context + useReducer.
 * Autosaves on every change. Provides undo for import.
 */
import { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import type {
  AppData,
  Settings,
  Ingredient,
  PackagingItem,
  Recipe,
  Flavour,
  Filling,
  BatchProduct,
  AssembledProduct,
  QuoteInput,
  SizeGuideEntry,
  SavedQuote,
  Customer,
  Order,
  PriceHistoryEntry,
  Id,
} from '../engine/types';
import { EMPTY_APP_DATA } from '../engine/types';

// ---------------------------------------------------------------------------
// IndexedDB persistence
// ---------------------------------------------------------------------------

const DB_NAME = 'bakery-costing';
const STORE_NAME = 'app-data';
const KEY = 'main';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromDB(): Promise<AppData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveToDB(data: AppData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const CLOUD_KEY = 'ui-cloud-state';
async function loadCloudStateDB(): Promise<{ lastBackupAt: string | null; lastBackupFileId: string | null }> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(CLOUD_KEY);
    req.onsuccess = () => resolve(req.result ?? { lastBackupAt: null, lastBackupFileId: null });
    req.onerror = () => resolve({ lastBackupAt: null, lastBackupFileId: null });
  });
}

async function saveCloudStateDB(state: { lastBackupAt: string | null; lastBackupFileId: string | null }): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(state, CLOUD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ActiveSavedQuoteInfo {
  id: Id;
  name: string;
  created_at: string;
  updated_at?: string;
  notes?: string;
  snapshot: any;
  isRecalculated: boolean;
}

export interface StoreState {
  data: AppData;
  undoSnapshot: AppData | null;  // snapshot before last import
  quoteInput: QuoteInput;
  activeSavedQuote: ActiveSavedQuoteInfo | null;
  loading: boolean;
  saving: boolean;
  lastSaved: Date | null;
  cloud: {
    configured: boolean;
    signedIn: boolean;
    user: { email: string; name?: string } | null;
    lastBackupAt: string | null;
    lastBackupFileId: string | null;
    busy: boolean;
    error: string | null;
  };
}

const DEFAULT_QUOTE_INPUT: QuoteInput = {
  tiers: [
    { size_kg: 0, flavour_id: null, filling_id: null },
    { size_kg: 0, flavour_id: null, filling_id: null },
    { size_kg: 0, flavour_id: null, filling_id: null },
    { size_kg: 0, flavour_id: null, filling_id: null },
    { size_kg: 0, flavour_id: null, filling_id: null },
    { size_kg: 0, flavour_id: null, filling_id: null },
  ],
  decoration: {
    fondant_kg: 0,
    prints: 0,
    flowers: 0,
    toppers: 0,
    time_hours: 0,
    others: 0,
    delivery: 0,
    discount: 0,
  },
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: 'LOADED'; data: AppData }
  | { type: 'SAVING' }
  | { type: 'SAVED'; at: Date }
  | { type: 'SET_SETTINGS'; settings: Settings }
  | { type: 'ADD_INGREDIENT'; item: Ingredient }
  | { type: 'UPDATE_INGREDIENT'; item: Ingredient }
  | { type: 'DELETE_INGREDIENT'; id: Id }
  | { type: 'ADD_PACKAGING'; item: PackagingItem }
  | { type: 'UPDATE_PACKAGING'; item: PackagingItem }
  | { type: 'DELETE_PACKAGING'; id: Id }
  | { type: 'ADD_RECIPE'; item: Recipe }
  | { type: 'UPDATE_RECIPE'; item: Recipe }
  | { type: 'DELETE_RECIPE'; id: Id }
  | { type: 'ADD_FLAVOUR'; item: Flavour }
  | { type: 'UPDATE_FLAVOUR'; item: Flavour }
  | { type: 'DELETE_FLAVOUR'; id: Id }
  | { type: 'ADD_FILLING'; item: Filling }
  | { type: 'UPDATE_FILLING'; item: Filling }
  | { type: 'DELETE_FILLING'; id: Id }
  | { type: 'ADD_BATCH_PRODUCT'; item: BatchProduct }
  | { type: 'UPDATE_BATCH_PRODUCT'; item: BatchProduct }
  | { type: 'DELETE_BATCH_PRODUCT'; id: Id }
  | { type: 'ADD_ASSEMBLED_PRODUCT'; item: AssembledProduct }
  | { type: 'UPDATE_ASSEMBLED_PRODUCT'; item: AssembledProduct }
  | { type: 'DELETE_ASSEMBLED_PRODUCT'; id: Id }
  | { type: 'SET_QUOTE_INPUT'; input: QuoteInput }
  | { type: 'RESET_QUOTE' }
  | { type: 'IMPORT_DATA'; data: Partial<AppData>; mode: 'replace' | 'merge' | 'replace_selected' }
  | { type: 'UNDO_IMPORT' }
  | { type: 'ADD_SAVED_QUOTE'; item: SavedQuote }
  | { type: 'UPDATE_SAVED_QUOTE'; item: SavedQuote }
  | { type: 'DELETE_SAVED_QUOTE'; id: Id }
  | { type: 'LOAD_SAVED_QUOTE'; quote: SavedQuote; recalculate?: boolean }
  | { type: 'RECALCULATE_SAVED_QUOTE' }
  | { type: 'CLEAR_ACTIVE_SAVED_QUOTE' }
  | { type: 'SET_SIZE_GUIDE'; guide: SizeGuideEntry[] }
  | { type: 'ADD_CUSTOMER'; item: Customer }
  | { type: 'UPDATE_CUSTOMER'; item: Customer }
  | { type: 'DELETE_CUSTOMER'; id: Id }
  | { type: 'ADD_ORDER'; item: Order }
  | { type: 'UPDATE_ORDER'; item: Order }
  | { type: 'DELETE_ORDER'; id: Id }
  | { type: 'CLOUD_STATUS_LOADED'; configured: boolean; signedIn: boolean; user: { email: string; name?: string } | null; lastBackupAt: string | null; lastBackupFileId: string | null }
  | { type: 'CLOUD_SIGNED_IN'; user: { email: string; name?: string } }
  | { type: 'CLOUD_SIGNED_OUT' }
  | { type: 'CLOUD_BUSY' }
  | { type: 'CLOUD_IDLE' }
  | { type: 'CLOUD_ERROR'; error: string }
  | { type: 'CLOUD_BACKUP_DONE'; lastBackupAt: string; lastBackupFileId: string }
  | { type: 'CLOUD_RESTORE_APPLIED' };

function upsert<T extends { id: Id }>(list: T[], item: T): T[] {
  const idx = list.findIndex(x => x.id === item.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = item;
    return next;
  }
  return [...list, item];
}

function remove<T extends { id: Id }>(list: T[], id: Id): T[] {
  return list.filter(x => x.id !== id);
}

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'LOADED':
      return { ...state, data: action.data, loading: false };
    case 'SAVING':
      return { ...state, saving: true };
    case 'SAVED':
      return { ...state, saving: false, lastSaved: action.at };
    case 'SET_SETTINGS':
      return { ...state, data: { ...state.data, settings: action.settings } };
    case 'ADD_INGREDIENT':
      return { ...state, data: { ...state.data, ingredients: upsert(state.data.ingredients, action.item) } };
    case 'UPDATE_INGREDIENT': {
      // Auto-append a price history entry if pack_price or pack_quantity changed
      const prev = state.data.ingredients.find(i => i.id === action.item.id);
      let updated = action.item;
      if (prev && (prev.pack_price !== action.item.pack_price || prev.pack_quantity !== action.item.pack_quantity)) {
        const today = new Date().toISOString().split('T')[0];
        const entry: PriceHistoryEntry = {
          date: today,
          pack_quantity: action.item.pack_quantity,
          pack_price: action.item.pack_price,
        };
        updated = { ...action.item, price_history: [...(action.item.price_history ?? []), entry] };
      }
      return { ...state, data: { ...state.data, ingredients: upsert(state.data.ingredients, updated) } };
    }
    case 'DELETE_INGREDIENT':
      return { ...state, data: { ...state.data, ingredients: remove(state.data.ingredients, action.id) } };
    case 'ADD_PACKAGING':
    case 'UPDATE_PACKAGING':
      return { ...state, data: { ...state.data, packaging_items: upsert(state.data.packaging_items, action.item) } };
    case 'DELETE_PACKAGING':
      return { ...state, data: { ...state.data, packaging_items: remove(state.data.packaging_items, action.id) } };
    case 'ADD_RECIPE':
    case 'UPDATE_RECIPE':
      return { ...state, data: { ...state.data, recipes: upsert(state.data.recipes, action.item) } };
    case 'DELETE_RECIPE':
      return { ...state, data: { ...state.data, recipes: remove(state.data.recipes, action.id) } };
    case 'ADD_FLAVOUR':
    case 'UPDATE_FLAVOUR':
      return { ...state, data: { ...state.data, flavours: upsert(state.data.flavours, action.item) } };
    case 'DELETE_FLAVOUR':
      return { ...state, data: { ...state.data, flavours: remove(state.data.flavours, action.id) } };
    case 'ADD_FILLING':
    case 'UPDATE_FILLING':
      return { ...state, data: { ...state.data, fillings: upsert(state.data.fillings, action.item) } };
    case 'DELETE_FILLING':
      return { ...state, data: { ...state.data, fillings: remove(state.data.fillings, action.id) } };
    case 'ADD_BATCH_PRODUCT':
    case 'UPDATE_BATCH_PRODUCT':
      return { ...state, data: { ...state.data, batch_products: upsert(state.data.batch_products, action.item) } };
    case 'DELETE_BATCH_PRODUCT':
      return { ...state, data: { ...state.data, batch_products: remove(state.data.batch_products, action.id) } };
    case 'ADD_ASSEMBLED_PRODUCT':
    case 'UPDATE_ASSEMBLED_PRODUCT':
      return { ...state, data: { ...state.data, assembled_products: upsert(state.data.assembled_products, action.item) } };
    case 'DELETE_ASSEMBLED_PRODUCT':
      return { ...state, data: { ...state.data, assembled_products: remove(state.data.assembled_products, action.id) } };
    case 'SET_QUOTE_INPUT':
      return { ...state, quoteInput: action.input };
    case 'RESET_QUOTE':
      return { ...state, quoteInput: DEFAULT_QUOTE_INPUT, activeSavedQuote: null };
    case 'CLEAR_ACTIVE_SAVED_QUOTE':
      return { ...state, activeSavedQuote: null };
    case 'LOAD_SAVED_QUOTE':
      return {
        ...state,
        quoteInput: action.quote.input,
        activeSavedQuote: {
          id: action.quote.id,
          name: action.quote.name,
          created_at: action.quote.created_at,
          updated_at: action.quote.updated_at,
          notes: action.quote.notes,
          snapshot: action.quote.result_snapshot,
          isRecalculated: !!action.recalculate,
        },
      };
    case 'RECALCULATE_SAVED_QUOTE':
      if (!state.activeSavedQuote) return state;
      return {
        ...state,
        activeSavedQuote: {
          ...state.activeSavedQuote,
          isRecalculated: true,
        },
      };
    case 'IMPORT_DATA': {
      const snapshot = state.data;
      let next: AppData;
      if (action.mode === 'replace' || action.mode === 'replace_selected') {
        next = { ...state.data, ...action.data };
      } else {
        // merge: upsert each list
        const d = action.data;
        next = {
          ...state.data,
          settings: d.settings ?? state.data.settings,
          ingredients: mergeList(state.data.ingredients, d.ingredients),
          packaging_items: mergeList(state.data.packaging_items, d.packaging_items),
          recipes: mergeList(state.data.recipes, d.recipes),
          flavours: mergeList(state.data.flavours, d.flavours),
          fillings: mergeList(state.data.fillings, d.fillings),
          batch_products: mergeList(state.data.batch_products, d.batch_products),
          assembled_products: mergeList(state.data.assembled_products, d.assembled_products),
          size_guide: d.size_guide ?? state.data.size_guide,
          saved_quotes: mergeList(state.data.saved_quotes, d.saved_quotes),
          customers: mergeList(state.data.customers, d.customers),
          orders: mergeList(state.data.orders, d.orders),
        };
      }
      return { ...state, data: next, undoSnapshot: snapshot };
    }
    case 'UNDO_IMPORT':
      if (!state.undoSnapshot) return state;
      return { ...state, data: state.undoSnapshot, undoSnapshot: null };
    case 'ADD_SAVED_QUOTE':
    case 'UPDATE_SAVED_QUOTE':
      return {
        ...state,
        data: { ...state.data, saved_quotes: upsert(state.data.saved_quotes, action.item) },
        activeSavedQuote: {
          id: action.item.id,
          name: action.item.name,
          created_at: action.item.created_at,
          updated_at: action.item.updated_at,
          notes: action.item.notes,
          snapshot: action.item.result_snapshot,
          isRecalculated: false,
        },
      };
    case 'DELETE_SAVED_QUOTE': {
      const nextQuotes = remove(state.data.saved_quotes, action.id);
      const nextActive = state.activeSavedQuote?.id === action.id ? null : state.activeSavedQuote;
      return { ...state, data: { ...state.data, saved_quotes: nextQuotes }, activeSavedQuote: nextActive };
    }
    case 'SET_SIZE_GUIDE':
      return { ...state, data: { ...state.data, size_guide: action.guide } };
    case 'ADD_CUSTOMER':
    case 'UPDATE_CUSTOMER':
      return { ...state, data: { ...state.data, customers: upsert(state.data.customers, action.item) } };
    case 'DELETE_CUSTOMER':
      return { ...state, data: { ...state.data, customers: remove(state.data.customers, action.id) } };
    case 'ADD_ORDER':
    case 'UPDATE_ORDER':
      return { ...state, data: { ...state.data, orders: upsert(state.data.orders, action.item) } };
    case 'DELETE_ORDER':
      return { ...state, data: { ...state.data, orders: remove(state.data.orders, action.id) } };
    case 'CLOUD_STATUS_LOADED':
      return { ...state, cloud: { ...state.cloud, configured: action.configured, signedIn: action.signedIn, user: action.user, lastBackupAt: action.lastBackupAt, lastBackupFileId: action.lastBackupFileId } };
    case 'CLOUD_SIGNED_IN':
      return { ...state, cloud: { ...state.cloud, signedIn: true, user: action.user, error: null, busy: false } };
    case 'CLOUD_SIGNED_OUT':
      return { ...state, cloud: { ...state.cloud, signedIn: false, user: null, error: null, busy: false } };
    case 'CLOUD_BUSY':
      return { ...state, cloud: { ...state.cloud, busy: true, error: null } };
    case 'CLOUD_IDLE':
      return { ...state, cloud: { ...state.cloud, busy: false } };
    case 'CLOUD_ERROR':
      return { ...state, cloud: { ...state.cloud, error: action.error, busy: false } };
    case 'CLOUD_BACKUP_DONE':
      return { ...state, cloud: { ...state.cloud, lastBackupAt: action.lastBackupAt, lastBackupFileId: action.lastBackupFileId, busy: false, error: null } };
    case 'CLOUD_RESTORE_APPLIED':
      return { ...state, cloud: { ...state.cloud, error: null } };
    default:
      return state;
  }
}

function mergeList<T extends { id: Id }>(existing: T[], incoming?: T[]): T[] {
  if (!incoming) return existing;
  const map = new Map(existing.map(x => [x.id, x]));
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface StoreContextValue {
  state: StoreState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    data: { ...EMPTY_APP_DATA },
    undoSnapshot: null,
    quoteInput: DEFAULT_QUOTE_INPUT,
    activeSavedQuote: null,
    loading: true,
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
    }
  });

  // Load from IndexedDB on mount
  useEffect(() => {
    Promise.all([
      loadFromDB(),
      loadCloudStateDB()
    ]).then(([saved, cloudState]) => {
      // Merge on top of EMPTY_APP_DATA so new fields added in later phases
      // (e.g. customers, orders) always have defaults even if missing from stored data.
      if (saved) dispatch({ type: 'LOADED', data: { ...EMPTY_APP_DATA, ...saved } });
      else dispatch({ type: 'LOADED', data: { ...EMPTY_APP_DATA } });
      
      // Load cloud state
      import('../cloud/drive').then(drive => {
        dispatch({ 
          type: 'CLOUD_STATUS_LOADED', 
          configured: drive.isConfigured(), 
          signedIn: drive.isSignedIn(),
          user: drive.getSignedInUser(),
          lastBackupAt: cloudState.lastBackupAt,
          lastBackupFileId: cloudState.lastBackupFileId
        });
      });
    }).catch(() => {
      dispatch({ type: 'LOADED', data: { ...EMPTY_APP_DATA } });
    });
  }, []);

  // Autosave on data change
  const prevData = useRef<AppData | null>(null);
  useEffect(() => {
    if (state.loading) return;
    if (prevData.current === state.data) return;
    prevData.current = state.data;
    dispatch({ type: 'SAVING' });
    saveToDB(state.data).then(() => {
      dispatch({ type: 'SAVED', at: new Date() });
    }).catch(console.error);
  }, [state.data, state.loading]);

  // Autosave cloud backup metadata
  const prevCloud = useRef<{ at: string | null; id: string | null }>({ at: null, id: null });
  useEffect(() => {
    if (state.loading) return;
    if (prevCloud.current.at === state.cloud.lastBackupAt && prevCloud.current.id === state.cloud.lastBackupFileId) return;
    prevCloud.current = { at: state.cloud.lastBackupAt, id: state.cloud.lastBackupFileId };
    saveCloudStateDB({ lastBackupAt: state.cloud.lastBackupAt, lastBackupFileId: state.cloud.lastBackupFileId }).catch(console.error);
  }, [state.cloud.lastBackupAt, state.cloud.lastBackupFileId, state.loading]);

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
