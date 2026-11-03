import type { ShoppingList } from '../engine/shopping';
import { csvEscape, neutralizeCsvText } from './io';

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function shoppingListToCsv(list: ShoppingList): string {
  const headers = [
    'type', 'name', 'grams', 'pieces', 'gram_equivalent', 'teaspoons',
    'converted_from_tsp', 'packaging_quantity', 'production_pieces', 'warning',
  ];
  const rows: unknown[][] = [
    ...list.ingredients.map(item => [
      'ingredient',
      neutralizeCsvText(item.name),
      formatQuantity(item.grams),
      formatQuantity(item.pieces),
      formatQuantity(item.gramEquivalent),
      formatQuantity(item.teaspoons),
      item.converted ? 'yes' : 'no',
      '',
      '',
      '',
    ]),
    ...list.packaging.map(item => ['packaging', neutralizeCsvText(item.name), '', '', '', '', '', formatQuantity(item.quantity), '', '']),
    ...list.production.map(item => ['production', neutralizeCsvText(item.name), '', '', '', '', '', '', formatQuantity(item.pieces), '']),
    ...list.warnings.map(item => ['warning', neutralizeCsvText(item.name), '', '', '', '', '', '', '', neutralizeCsvText(item.message)]),
  ];
  return [headers.join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\n');
}
