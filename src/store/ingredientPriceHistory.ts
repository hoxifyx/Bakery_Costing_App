import { localDateString } from '../engine/utils';
import type { Ingredient, PriceHistoryEntry } from '../engine/types';

export function recordIngredientPriceChange(previous: Ingredient, incoming: Ingredient): Ingredient {
  const history = [...(incoming.price_history ?? previous.price_history ?? [])];
  if (history.length === 0) {
    history.push({
      date: '',
      pack_quantity: previous.pack_quantity,
      pack_price: previous.pack_price,
    });
  }
  const last = history[history.length - 1];
  if (last.pack_price !== incoming.pack_price || last.pack_quantity !== incoming.pack_quantity) {
    history.push({
      date: localDateString(),
      pack_quantity: incoming.pack_quantity,
      pack_price: incoming.pack_price,
    });
  }
  return { ...incoming, price_history: history };
}

export function displayPriceHistoryDate(date: string | undefined): string {
  return date?.trim() ? date : 'Earlier';
}

export function recordImportedIngredientPriceChanges(
  existing: Ingredient[],
  imported: Ingredient[],
): Ingredient[] {
  const existingById = new Map(existing.map(item => [item.id, item]));
  return imported.map(item => {
    const previous = existingById.get(item.id);
    if (!previous || (previous.pack_price === item.pack_price && previous.pack_quantity === item.pack_quantity)) {
      return item;
    }

    const history = [...(item.price_history ?? previous.price_history ?? [])];
    const last: PriceHistoryEntry | undefined = history.at(-1);
    if (last?.pack_price === item.pack_price && last.pack_quantity === item.pack_quantity) return item;
    return {
      ...item,
      price_history: [...history, {
        date: localDateString(),
        pack_quantity: item.pack_quantity,
        pack_price: item.pack_price,
      }],
    };
  });
}
