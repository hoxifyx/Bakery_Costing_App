/**
 * IndexedDB-backed store using React context + useReducer.
 * Autosaves on every change. Provides undo for import.
 */
import { createContext, useCallback, useContext, useReducer, useEffect, useRef, useState } from 'react';
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
  ProductQuoteInput,
  SizeGuideEntry,
  SavedQuote,
  Customer,
  Order,
  Id,
} from '../engine/types';
import { DEFAULT_SETTINGS, DEFAULT_SIZE_GUIDE, EMPTY_APP_DATA } from '../engine/types';
import { recordImportedIngredientPriceChanges, recordIngredientPriceChange } from './ingredientPriceHistory';

// ---------------------------------------------------------------------------
// IndexedDB persistence
// ---------------------------------------------------------------------------

const DB_NAME = 'bakery-costing';
const STORE_NAME = 'app-data';
const KEY = 'main';
const REVISION_KEY = 'main-revision';
const QUOTE_DRAFT_KEY = 'quote-input-draft';
const PRODUCT_QUOTE_DRAFT_KEY = 'product-quote-input-draft';
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      const db = req.result;
      const closeAndReset = () => {
        db.close();
        if (dbPromise === pending) dbPromise = null;
      };
      db.onversionchange = closeAndReset;
      db.onclose = () => {
        if (dbPromise === pending) dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      if (dbPromise === pending) dbPromise = null;
      reject(req.error);
    };
  });
  dbPromise = pending;
  return pending;
}

interface LoadedData {
  data: AppData | null;
  revision: number;
}

interface LoadedDrafts {
  quoteInput: unknown;
  productQuoteInput: unknown;
}

class DataRevisionConflictError extends Error {
  constructor() {
    super('Data changed in another tab');
    this.name = 'DataRevisionConflictError';
  }
}

async function loadFromDB(): Promise<LoadedData> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const dataReq = store.get(KEY);
    const revisionReq = store.get(REVISION_KEY);
    let data: AppData | null = null;
    let revision = 0;
    let completed = 0;
    let failed = false;
    const settle = () => {
      if (failed) return;
      if (completed >= 2) resolve({ data, revision });
    };
    const fail = (error: DOMException | null) => {
      if (failed) return;
      failed = true;
      reject(error ?? new Error('Database load failed'));
    };
    dataReq.onsuccess = () => {
      data = dataReq.result ?? null;
      completed += 1;
      settle();
    };
    revisionReq.onsuccess = () => {
      revision = Number.isSafeInteger(revisionReq.result) ? revisionReq.result : 0;
      completed += 1;
      settle();
    };
    dataReq.onerror = () => fail(dataReq.error as DOMException | null);
    revisionReq.onerror = () => fail(revisionReq.error as DOMException | null);
    tx.onerror = () => fail(tx.error as DOMException | null);
    tx.onabort = () => fail(tx.error as DOMException | null);
    tx.oncomplete = () => settle();
  });
}

async function loadDraftsFromDB(): Promise<LoadedDrafts> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const quoteReq = store.get(QUOTE_DRAFT_KEY);
    const productReq = store.get(PRODUCT_QUOTE_DRAFT_KEY);
    let quoteInput: unknown;
    let productQuoteInput: unknown;
    let completed = 0;
    const settle = () => {
      completed += 1;
      if (completed === 2) resolve({ quoteInput, productQuoteInput });
    };
    quoteReq.onsuccess = () => {
      quoteInput = quoteReq.result;
      settle();
    };
    productReq.onsuccess = () => {
      productQuoteInput = productReq.result;
      settle();
    };
    quoteReq.onerror = () => reject(quoteReq.error ?? new Error('Unable to load quote draft'));
    productReq.onerror = () => reject(productReq.error ?? new Error('Unable to load product quote draft'));
    tx.onerror = () => reject(tx.error ?? new Error('Unable to load quote drafts'));
    tx.onabort = () => reject(tx.error ?? new Error('Quote draft load aborted'));
  });
}

async function saveDraftToDB(key: string, value: QuoteInput | ProductQuoteInput): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to save quote draft'));
    tx.onabort = () => reject(tx.error ?? new Error('Quote draft save aborted'));
  });
}

async function clearDraftFromDB(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to clear quote draft'));
    tx.onabort = () => reject(tx.error ?? new Error('Quote draft clear aborted'));
  });
}

async function saveToDB(data: AppData, expectedRevision: number): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const revisionReq = store.get(REVISION_KEY);
    let nextRevision = expectedRevision + 1;
    let conflict: DataRevisionConflictError | null = null;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    revisionReq.onsuccess = () => {
      const currentRevision = Number.isSafeInteger(revisionReq.result) ? revisionReq.result : 0;
      if (currentRevision !== expectedRevision) {
        conflict = new DataRevisionConflictError();
        tx.abort();
        return;
      }
      nextRevision = currentRevision + 1;
      store.put(data, KEY);
      store.put(nextRevision, REVISION_KEY);
    };
    revisionReq.onerror = () => fail(revisionReq.error ?? new Error('Unable to verify data revision'));
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(nextRevision);
    };
    tx.onerror = () => fail(conflict ?? tx.error ?? new Error('Database save failed'));
    tx.onabort = () => fail(conflict ?? tx.error ?? new Error('Database save aborted'));
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
  draftClearRevision: { quote: number; product: number };
  quoteInput: QuoteInput;
  productQuoteInput: ProductQuoteInput;
  activeSavedQuote: ActiveSavedQuoteInfo | null;
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  saveError: string | null;
  dataConflict: boolean;
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

const DEFAULT_PRODUCT_QUOTE_INPUT: ProductQuoteInput = {
  lines: [],
  delivery: 0,
  discount: 0,
};

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

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function draftNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeQuoteDraft(raw: unknown, data: AppData): QuoteInput {
  const source = recordValue(raw);
  if (!source) return DEFAULT_QUOTE_INPUT;
  const tiers = Array.isArray(source.tiers) ? source.tiers : [];
  const flavourIds = new Set(data.flavours.map(item => item.id));
  const fillingIds = new Set(data.fillings.map(item => item.id));
  const decoration = recordValue(source.decoration) ?? {};
  return {
    tiers: Array.from({ length: 6 }, (_, index) => {
      const tier = recordValue(tiers[index]) ?? {};
      return {
        size_kg: draftNumber(tier.size_kg, 0),
        flavour_id: typeof tier.flavour_id === 'string' && flavourIds.has(tier.flavour_id)
          ? tier.flavour_id
          : null,
        filling_id: typeof tier.filling_id === 'string' && fillingIds.has(tier.filling_id)
          ? tier.filling_id
          : null,
      };
    }),
    decoration: {
      fondant_kg: draftNumber(decoration.fondant_kg, 0),
      prints: draftNumber(decoration.prints, 0),
      flowers: draftNumber(decoration.flowers, 0),
      toppers: draftNumber(decoration.toppers, 0),
      time_hours: draftNumber(decoration.time_hours, 0),
      others: draftNumber(decoration.others, 0),
      delivery: draftNumber(decoration.delivery, 0),
      discount: draftNumber(decoration.discount, 0),
    },
  };
}

function normalizeProductQuoteDraft(raw: unknown, data: AppData): ProductQuoteInput {
  const source = recordValue(raw);
  if (!source) return DEFAULT_PRODUCT_QUOTE_INPUT;
  const lines = Array.isArray(source.lines) ? source.lines : [];
  const batchIds = new Set(data.batch_products.map(item => item.id));
  const assembledIds = new Set(data.assembled_products.map(item => item.id));
  return {
    lines: lines.flatMap(lineValue => {
      const line = recordValue(lineValue);
      if (!line || (line.product_kind !== 'batch' && line.product_kind !== 'assembled')) return [];
      const ids = line.product_kind === 'batch' ? batchIds : assembledIds;
      if (typeof line.product_id !== 'string' || !ids.has(line.product_id)) return [];
      if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity < 0) return [];
      if (line.unit !== 'piece' && line.unit !== 'box') return [];
      if (line.product_kind === 'assembled' && line.unit !== 'piece') return [];
      const priceOverride = line.price_override;
      return [{
        product_kind: line.product_kind,
        product_id: line.product_id,
        quantity: line.quantity,
        unit: line.unit,
        price_override: priceOverride === null
          ? null
          : typeof priceOverride === 'number' && Number.isFinite(priceOverride) && priceOverride >= 0
            ? priceOverride
            : undefined,
      }];
    }),
    delivery: draftNumber(source.delivery, 0),
    discount: draftNumber(source.discount, 0),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: 'LOAD_STARTED' }
  | { type: 'LOADED'; data: AppData; quoteInput?: QuoteInput; productQuoteInput?: ProductQuoteInput }
  | { type: 'LOAD_FAILED'; error: string }
  | { type: 'SAVING' }
  | { type: 'SAVED'; at: Date }
  | { type: 'SAVE_FAILED'; error: string }
  | { type: 'DATA_CONFLICT' }
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
  | { type: 'SET_PRODUCT_QUOTE_INPUT'; input: ProductQuoteInput }
  | { type: 'RESET_PRODUCT_QUOTE' }
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

function quoteUsesFlavour(quote: SavedQuote, id: Id): boolean {
  return quote.input?.tiers?.some(tier => tier.flavour_id === id) ?? false;
}

function quoteUsesProduct(quote: SavedQuote, kind: 'batch' | 'assembled', id: Id): boolean {
  return quote.product_quote_input?.lines?.some(line => line.product_kind === kind && line.product_id === id) ?? false;
}

// oxlint-disable-next-line react/only-export-components -- exported for reducer unit tests
export function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'LOAD_STARTED':
      return { ...state, loading: true, loadError: null };
    case 'LOADED':
      return {
        ...state,
        data: action.data,
        quoteInput: action.quoteInput ?? state.quoteInput,
        productQuoteInput: action.productQuoteInput ?? state.productQuoteInput,
        loading: false,
        loadError: null,
        dataConflict: false,
      };
    case 'LOAD_FAILED':
      return { ...state, loading: false, loadError: action.error, saving: false };
    case 'SAVING':
      return { ...state, saving: true, saveError: null };
    case 'SAVED':
      return { ...state, saving: false, saveError: null, lastSaved: action.at };
    case 'SAVE_FAILED':
      return { ...state, saving: false, saveError: action.error };
    case 'DATA_CONFLICT':
      return { ...state, saving: false, saveError: null, dataConflict: true };
    case 'SET_SETTINGS':
      return { ...state, data: { ...state.data, settings: action.settings } };
    case 'ADD_INGREDIENT':
      return { ...state, data: { ...state.data, ingredients: upsert(state.data.ingredients, action.item) } };
    case 'UPDATE_INGREDIENT': {
      // Auto-append a price history entry if pack_price or pack_quantity changed
      const prev = state.data.ingredients.find(i => i.id === action.item.id);
      let updated = action.item;
      if (prev && (prev.pack_price !== action.item.pack_price || prev.pack_quantity !== action.item.pack_quantity)) {
        updated = recordIngredientPriceChange(prev, action.item);
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
      if (state.data.saved_quotes.some(quote => quoteUsesFlavour(quote, action.id))) return state;
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
      if (state.data.saved_quotes.some(quote => quoteUsesProduct(quote, 'batch', action.id))) return state;
      return { ...state, data: { ...state.data, batch_products: remove(state.data.batch_products, action.id) } };
    case 'ADD_ASSEMBLED_PRODUCT':
    case 'UPDATE_ASSEMBLED_PRODUCT':
      return { ...state, data: { ...state.data, assembled_products: upsert(state.data.assembled_products, action.item) } };
    case 'DELETE_ASSEMBLED_PRODUCT':
      if (state.data.saved_quotes.some(quote => quoteUsesProduct(quote, 'assembled', action.id))) return state;
      return { ...state, data: { ...state.data, assembled_products: remove(state.data.assembled_products, action.id) } };
    case 'SET_QUOTE_INPUT':
      return { ...state, quoteInput: action.input };
    case 'RESET_QUOTE':
      return {
        ...state,
        quoteInput: DEFAULT_QUOTE_INPUT,
        activeSavedQuote: null,
        draftClearRevision: { ...state.draftClearRevision, quote: state.draftClearRevision.quote + 1 },
      };
    case 'SET_PRODUCT_QUOTE_INPUT':
      return { ...state, productQuoteInput: action.input };
    case 'RESET_PRODUCT_QUOTE':
      return {
        ...state,
        productQuoteInput: DEFAULT_PRODUCT_QUOTE_INPUT,
        activeSavedQuote: null,
        draftClearRevision: { ...state.draftClearRevision, product: state.draftClearRevision.product + 1 },
      };
    case 'CLEAR_ACTIVE_SAVED_QUOTE':
      return { ...state, activeSavedQuote: null };
    case 'LOAD_SAVED_QUOTE':
      return {
        ...state,
        quoteInput: action.quote.input ?? DEFAULT_QUOTE_INPUT,
        productQuoteInput: action.quote.product_quote_input ?? DEFAULT_PRODUCT_QUOTE_INPUT,
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
      if (action.data.ingredients && action.mode !== 'replace') {
        next = {
          ...next,
          ingredients: recordImportedIngredientPriceChanges(state.data.ingredients, next.ingredients),
        };
      }
      return {
        ...state,
        data: next,
        undoSnapshot: snapshot,
      };
    }
    case 'UNDO_IMPORT':
      if (!state.undoSnapshot) return state;
      return { ...state, data: state.undoSnapshot, undoSnapshot: null };
    case 'ADD_SAVED_QUOTE':
      return {
        ...state,
        data: { ...state.data, saved_quotes: upsert(state.data.saved_quotes, action.item) },
        draftClearRevision: action.item.product_quote_input
          ? { ...state.draftClearRevision, product: state.draftClearRevision.product + 1 }
          : { ...state.draftClearRevision, quote: state.draftClearRevision.quote + 1 },
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
    case 'UPDATE_SAVED_QUOTE':
      return {
        ...state,
        data: { ...state.data, saved_quotes: upsert(state.data.saved_quotes, action.item) },
        draftClearRevision: action.item.product_quote_input
          ? { ...state.draftClearRevision, product: state.draftClearRevision.product + 1 }
          : { ...state.draftClearRevision, quote: state.draftClearRevision.quote + 1 },
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

function normalizeLoadedData(raw: Partial<AppData> | null | undefined): AppData {
  const settings = { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) } as Settings;
  return {
    settings,
    ingredients: raw?.ingredients ?? [],
    packaging_items: raw?.packaging_items ?? [],
    recipes: raw?.recipes ?? [],
    flavours: raw?.flavours ?? [],
    fillings: raw?.fillings ?? [],
    batch_products: raw?.batch_products ?? [],
    assembled_products: raw?.assembled_products ?? [],
    size_guide: Array.isArray(raw?.size_guide) && raw!.size_guide.length > 0 ? raw!.size_guide : [...DEFAULT_SIZE_GUIDE],
    saved_quotes: raw?.saved_quotes ?? [],
    customers: raw?.customers ?? [],
    orders: raw?.orders ?? [],
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface StoreContextValue {
  state: StoreState;
  dispatch: React.Dispatch<Action>;
  retryLoad: () => void;
  retrySave: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [state, dispatch] = useReducer(reducer, {
    data: { ...EMPTY_APP_DATA },
    undoSnapshot: null,
    draftClearRevision: { quote: 0, product: 0 },
    quoteInput: DEFAULT_QUOTE_INPUT,
    productQuoteInput: DEFAULT_PRODUCT_QUOTE_INPUT,
    activeSavedQuote: null,
    loading: true,
    loadError: null,
    saving: false,
    saveError: null,
    dataConflict: false,
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

  const retryLoad = useCallback(() => {
    dispatch({ type: 'LOAD_STARTED' });
    setLoadAttempt(attempt => attempt + 1);
  }, []);
  const retrySave = useCallback(() => setSaveAttempt(attempt => attempt + 1), []);
  const expectedRevision = useRef(0);
  const dataConflictRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Load from IndexedDB on mount and explicit retry
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadFromDB(),
      loadCloudStateDB(),
      loadDraftsFromDB().catch(() => null),
    ]).then(([loaded, cloudState, drafts]) => {
      if (cancelled) return;
      expectedRevision.current = loaded.revision;
      dataConflictRef.current = false;
      const loadedData = normalizeLoadedData(loaded.data ?? EMPTY_APP_DATA);
      dispatch({
        type: 'LOADED',
        data: loadedData,
        quoteInput: normalizeQuoteDraft(drafts?.quoteInput, loadedData),
        productQuoteInput: normalizeProductQuoteDraft(drafts?.productQuoteInput, loadedData),
      });
      import('../cloud/drive').then(drive => {
        if (cancelled) return;
        dispatch({
          type: 'CLOUD_STATUS_LOADED',
          configured: drive.isConfigured(),
          signedIn: drive.isSignedIn(),
          user: drive.getSignedInUser(),
          lastBackupAt: cloudState.lastBackupAt,
          lastBackupFileId: cloudState.lastBackupFileId
        });
      }).catch(() => undefined);
    }).catch((err) => {
      if (cancelled) return;
      dispatch({ type: 'LOAD_FAILED', error: err instanceof Error ? err.message : 'Database load failed' });
    });
    return () => { cancelled = true; };
  }, [loadAttempt]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('bakery-costing-data');
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type?: string; revision?: number }>) => {
      if (event.data?.type !== 'data-saved' || !Number.isSafeInteger(event.data.revision)) return;
      if ((event.data.revision ?? 0) <= expectedRevision.current) return;
      dataConflictRef.current = true;
      dispatch({ type: 'DATA_CONFLICT' });
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // Autosave on data change
  const prevData = useRef<AppData | null>(null);
  const prevSaveAttempt = useRef(0);
  useEffect(() => {
    if (state.loading || state.loadError || state.dataConflict || dataConflictRef.current) return;
    if (prevData.current === state.data && prevSaveAttempt.current === saveAttempt) return;
    prevData.current = state.data;
    prevSaveAttempt.current = saveAttempt;
    dispatch({ type: 'SAVING' });
    saveToDB(state.data, expectedRevision.current).then(revision => {
      expectedRevision.current = revision;
      channelRef.current?.postMessage({ type: 'data-saved', revision });
      dispatch({ type: 'SAVED', at: new Date() });
    }).catch(err => {
      if (err instanceof DataRevisionConflictError) {
        dataConflictRef.current = true;
        dispatch({ type: 'DATA_CONFLICT' });
      } else {
        dispatch({ type: 'SAVE_FAILED', error: err instanceof Error ? err.message : 'Database save failed' });
      }
    });
  }, [state.data, state.loading, state.loadError, state.dataConflict, saveAttempt]);

  const previousQuoteDraftClearRevision = useRef(0);
  useEffect(() => {
    if (state.loading) return;
    if (previousQuoteDraftClearRevision.current !== state.draftClearRevision.quote) {
      previousQuoteDraftClearRevision.current = state.draftClearRevision.quote;
      clearDraftFromDB(QUOTE_DRAFT_KEY).catch(error => console.error('Unable to clear quote draft', error));
      return;
    }
    const timer = setTimeout(() => {
      saveDraftToDB(QUOTE_DRAFT_KEY, state.quoteInput)
        .catch(error => console.error('Unable to save quote draft', error));
    }, 500);
    return () => clearTimeout(timer);
  }, [state.loading, state.quoteInput, state.draftClearRevision.quote]);

  const previousProductDraftClearRevision = useRef(0);
  useEffect(() => {
    if (state.loading) return;
    if (previousProductDraftClearRevision.current !== state.draftClearRevision.product) {
      previousProductDraftClearRevision.current = state.draftClearRevision.product;
      clearDraftFromDB(PRODUCT_QUOTE_DRAFT_KEY)
        .catch(error => console.error('Unable to clear product quote draft', error));
      return;
    }
    const timer = setTimeout(() => {
      saveDraftToDB(PRODUCT_QUOTE_DRAFT_KEY, state.productQuoteInput)
        .catch(error => console.error('Unable to save product quote draft', error));
    }, 500);
    return () => clearTimeout(timer);
  }, [state.loading, state.productQuoteInput, state.draftClearRevision.product]);

  // Autosave cloud backup metadata
  const prevCloud = useRef<{ at: string | null; id: string | null }>({ at: null, id: null });
  useEffect(() => {
    if (state.loading) return;
    if (prevCloud.current.at === state.cloud.lastBackupAt && prevCloud.current.id === state.cloud.lastBackupFileId) return;
    prevCloud.current = { at: state.cloud.lastBackupAt, id: state.cloud.lastBackupFileId };
    saveCloudStateDB({ lastBackupAt: state.cloud.lastBackupAt, lastBackupFileId: state.cloud.lastBackupFileId }).catch(console.error);
  }, [state.cloud.lastBackupAt, state.cloud.lastBackupFileId, state.loading]);

  return (
    <StoreContext.Provider value={{ state, dispatch, retryLoad, retrySave }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
