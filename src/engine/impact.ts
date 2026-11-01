import Decimal from 'decimal.js';
import { compute } from './engine';
import type { AppData, Id, PriceHistoryEntry } from './types';

export interface ImpactMetric {
  label: string;
  oldValue: number;
  newValue: number;
  delta: number;
  percentageDelta: number | null;
}

export type ImpactCategory = 'Recipe' | 'Filling' | 'Batch product' | 'Assembled product';

export interface ImpactItem {
  id: Id;
  name: string;
  category: ImpactCategory;
  metrics: ImpactMetric[];
}

export interface IngredientPriceImpact {
  from: PriceHistoryEntry;
  to: PriceHistoryEntry;
  items: ImpactItem[];
}

function metric(label: string, oldValue: number, newValue: number): ImpactMetric | null {
  const oldAmount = new Decimal(oldValue);
  const newAmount = new Decimal(newValue);
  if (oldAmount.eq(newAmount)) return null;

  const delta = newAmount.minus(oldAmount);
  return {
    label,
    oldValue,
    newValue,
    delta: delta.toNumber(),
    percentageDelta: oldAmount.isZero() ? null : delta.div(oldAmount).mul(100).toNumber(),
  };
}

export function computeIngredientPriceImpact(
  data: AppData,
  ingredientId: Id,
  opts: { fromEntryIndex: number },
): IngredientPriceImpact | null {
  const ingredient = data.ingredients.find(item => item.id === ingredientId);
  if (!ingredient) return null;

  const history = ingredient.price_history ?? [];
  if (history.length < 2) return null;

  const { fromEntryIndex } = opts;
  if (!Number.isInteger(fromEntryIndex) || fromEntryIndex < 0 || fromEntryIndex >= history.length - 1) {
    throw new RangeError(`fromEntryIndex must identify a price history entry with a following entry for ingredient "${ingredientId}"`);
  }

  const from = history[fromEntryIndex];
  const to = history[fromEntryIndex + 1];
  const withPrice = (entry: PriceHistoryEntry): AppData => ({
    ...data,
    ingredients: data.ingredients.map(item => item.id === ingredientId
      ? { ...item, pack_price: entry.pack_price, pack_quantity: entry.pack_quantity }
      : item),
  });
  const oldResult = compute(withPrice(from));
  const newResult = compute(withPrice(to));

  const items: ImpactItem[] = [];
  const recipeIds = new Set(
    data.recipes
      .filter(recipe => recipe.lines.some(line => line.ingredient_id === ingredientId))
      .map(recipe => recipe.id),
  );
  const affectedRecipeIds = new Set(
    Object.keys(oldResult.recipes).filter(id => oldResult.recipes[id].per_gram_cwo !== newResult.recipes[id].per_gram_cwo),
  );

  for (const recipe of data.recipes) {
    const change = metric(
      'Cost per gram (with overhead)',
      oldResult.recipes[recipe.id].per_gram_cwo,
      newResult.recipes[recipe.id].per_gram_cwo,
    );
    if (change) items.push({ id: recipe.id, name: recipe.name ?? recipe.id, category: 'Recipe', metrics: [change] });
  }

  for (const filling of data.fillings) {
    const directlyAffected = filling.source.type === 'ingredient' && filling.source.ingredient_id === ingredientId;
    const recipeAffected = filling.source.type === 'recipe' && affectedRecipeIds.has(filling.source.recipe_id);
    if (!directlyAffected && !recipeAffected) continue;
    const change = metric(
      'Cost per kg',
      oldResult.fillings[filling.id].cost_per_kg,
      newResult.fillings[filling.id].cost_per_kg,
    );
    if (change) items.push({ id: filling.id, name: filling.name ?? filling.id, category: 'Filling', metrics: [change] });
  }

  for (const product of data.batch_products) {
    const usesAffectedRecipe = recipeIds.has(product.recipe_id) ||
      product.components.some(component => affectedRecipeIds.has(component.recipe_id));
    if (!usesAffectedRecipe) continue;

    const before = oldResult.batch_products[product.id];
    const after = newResult.batch_products[product.id];
    const metrics = [
      metric('Unit cost', before.unit_cost, after.unit_cost),
      metric('Each price', before.headline_each, after.headline_each),
      metric('Box price', before.box_price, after.box_price),
    ].filter((value): value is ImpactMetric => value !== null);
    if (metrics.length) items.push({ id: product.id, name: product.name ?? product.id, category: 'Batch product', metrics });
  }

  for (const product of data.assembled_products) {
    const usesAffectedRecipe = product.components.some(component =>
      component.type !== 'ingredient_grams' && affectedRecipeIds.has(component.recipe_id),
    );
    const directlyUsesIngredient = product.components.some(component =>
      component.type === 'ingredient_grams' && component.ingredient_id === ingredientId,
    );
    if (!usesAffectedRecipe && !directlyUsesIngredient) continue;

    const before = oldResult.assembled_products[product.id];
    const after = newResult.assembled_products[product.id];
    const metrics = [
      metric('Unit cost', before.unit_cost, after.unit_cost),
      metric('Each price', before.price_each, after.price_each),
    ].filter((value): value is ImpactMetric => value !== null);
    if (metrics.length) items.push({ id: product.id, name: product.name ?? product.id, category: 'Assembled product', metrics });
  }

  const categoryOrder: ImpactCategory[] = ['Recipe', 'Filling', 'Batch product', 'Assembled product'];
  items.sort((a, b) =>
    categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) ||
    a.name.localeCompare(b.name),
  );

  return { from, to, items };
}
