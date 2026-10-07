/**
 * Shared utility helpers for OvenCost Pro.
 * No imports from React, the store, IndexedDB, window, document, or fetch.
 */

/**
 * Generate a time-based unique ID with an optional prefix.
 * e.g. generateId('cust') → 'cust_1728289012345_abc12'
 */
export function generateId(prefix = 'id'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${ts}_${rand}`;
}
