import type { SavedQuote } from '../engine/types';

export function getFillingUsedIn(id: string, savedQuotes: SavedQuote[]): SavedQuote[] {
  return savedQuotes.filter(quote =>
    quote.input?.tiers?.some(tier => tier.filling_id === id),
  );
}
