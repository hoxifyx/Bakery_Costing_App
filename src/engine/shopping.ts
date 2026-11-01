import Decimal from 'decimal.js';
import { compute, computeProductQuote } from './engine';
import type { AppData, Id, SavedQuote } from './types';

export interface ShoppingIngredientRow {
  id: Id;
  name: string;
  grams: number;
  pieces: number;
  gramEquivalent: number;
  teaspoons: number;
  converted: boolean;
}

export interface ShoppingPackagingRow {
  id: Id;
  name: string;
  quantity: number;
}

export interface ShoppingProductionRow {
  id: Id;
  name: string;
  productKind: 'batch' | 'assembled';
  pieces: number;
}

export interface ShoppingWarningRow {
  id: string;
  name: string;
  message: string;
  category: 'ingredient' | 'packaging' | 'general';
}

export interface ShoppingList {
  ingredients: ShoppingIngredientRow[];
  packaging: ShoppingPackagingRow[];
  production: ShoppingProductionRow[];
  warnings: ShoppingWarningRow[];
}

const D = (value: number | string): Decimal => new Decimal(value);
const toNumber = (value: Decimal): number => value.toNumber();
const wasteMultiplier = (wastePct: number | undefined): Decimal => D(1).plus(wastePct ?? 0);

function stableSort<T extends { name: string; id: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function computeShoppingList(data: AppData, savedQuote: SavedQuote): ShoppingList {
  const ingredientMap = new Map(data.ingredients.map(item => [item.id, item]));
  const packagingMap = new Map(data.packaging_items.map(item => [item.id, item]));
  const recipeMap = new Map(data.recipes.map(item => [item.id, item]));
  const flavourMap = new Map(data.flavours.map(item => [item.id, item]));
  const fillingMap = new Map(data.fillings.map(item => [item.id, item]));
  const batchProductMap = new Map(data.batch_products.map(item => [item.id, item]));
  const assembledProductMap = new Map(data.assembled_products.map(item => [item.id, item]));
  const engineResult = compute(data, savedQuote.kind === 'products' ? null : savedQuote.input);
  const recipeResults = engineResult.recipes;

  const ingredientTotals = new Map<Id, {
    grams: Decimal;
    pieces: Decimal;
    gramEquivalent: Decimal;
    teaspoons: Decimal;
    converted: boolean;
  }>();
  const packagingTotals = new Map<Id, Decimal>();
  const productionTotals = new Map<string, {
    id: Id;
    name: string;
    productKind: 'batch' | 'assembled';
    pieces: Decimal;
  }>();
  const warningRows = new Map<string, ShoppingWarningRow>();

  const warn = (key: string, name: string, message: string, category: ShoppingWarningRow['category'] = 'general') => {
    warningRows.set(key, { id: key, name, message, category });
  };

  const addIngredient = (
    ingredientId: Id | null,
    amount: Decimal,
    unit: 'g' | 'piece' | 'tsp',
    pieceWeightOverride?: number | null,
  ) => {
    if (amount.isZero()) return;
    if (!ingredientId) {
      warn(`ingredient:unlinked:${savedQuote.id}`, 'Unlinked ingredient', 'A recipe line has no ingredient ID and cannot be added to the shopping list.', 'ingredient');
      return;
    }

    const ingredient = ingredientMap.get(ingredientId);
    if (!ingredient) {
      warn(`ingredient:${ingredientId}`, `Missing ingredient (${ingredientId})`, `Ingredient "${ingredientId}" is referenced by the quote but no longer exists.`, 'ingredient');
      return;
    }

    const total = ingredientTotals.get(ingredientId) ?? {
      grams: D(0),
      pieces: D(0),
      gramEquivalent: D(0),
      teaspoons: D(0),
      converted: false,
    };

    if (unit === 'g') {
      total.grams = total.grams.plus(amount);
    } else if (unit === 'piece') {
      total.pieces = total.pieces.plus(amount);
      const pieceWeight = pieceWeightOverride ?? ingredient.piece_weight_g;
      if (pieceWeight !== null && pieceWeight !== undefined && pieceWeight > 0) {
        total.gramEquivalent = total.gramEquivalent.plus(amount.mul(D(pieceWeight)));
      }
    } else {
      const gramsPerTsp = ingredient.grams_per_tsp;
      if (gramsPerTsp !== null && gramsPerTsp !== undefined && gramsPerTsp > 0) {
        total.grams = total.grams.plus(amount.mul(D(gramsPerTsp)));
        total.converted = true;
      } else {
        total.teaspoons = total.teaspoons.plus(amount);
        warn(`tsp:${ingredientId}`, ingredient.name, `Cannot convert ${ingredient.name} from teaspoons because grams_per_tsp is not set.`, 'ingredient');
      }
    }
    ingredientTotals.set(ingredientId, total);
  };

  const addPackaging = (packagingId: Id | null, quantity: Decimal, label: string, requiredWhenUnassigned = false) => {
    if (quantity.lte(0)) return;
    if (!packagingId) {
      if (requiredWhenUnassigned) {
        warn(`packaging:unassigned:${label}`, label, `${label} is required by the quote but has no packaging item assigned.`, 'packaging');
      }
      return;
    }
    if (!packagingMap.has(packagingId)) {
      warn(`packaging:${packagingId}`, `Missing packaging (${packagingId})`, `Packaging item "${packagingId}" is referenced by the quote but no longer exists.`, 'packaging');
      return;
    }
    packagingTotals.set(packagingId, (packagingTotals.get(packagingId) ?? D(0)).plus(quantity));
  };

  const addRecipe = (recipeId: Id, multiplier: Decimal, productWastePct = 0) => {
    const recipe = recipeMap.get(recipeId);
    if (!recipe) {
      warn(`recipe:${recipeId}`, `Missing recipe (${recipeId})`, `Recipe "${recipeId}" is required by the quote but no longer exists.`);
      return;
    }
    const combinedWaste = wasteMultiplier(recipe.waste_pct).mul(wasteMultiplier(productWastePct));
    for (const line of recipe.lines) {
      addIngredient(line.ingredient_id, D(line.quantity).mul(multiplier).mul(combinedWaste), line.unit, line.piece_weight_g_override);
    }
  };

  const addFlavour = (flavourId: Id, sizeKg: Decimal, visited = new Set<Id>()) => {
    const flavour = flavourMap.get(flavourId);
    if (!flavour) {
      warn(`flavour:${flavourId}`, `Missing flavour (${flavourId})`, `Flavour "${flavourId}" is referenced by the quote but no longer exists.`);
      return;
    }
    if (visited.has(flavourId)) {
      warn(`flavour-cycle:${flavourId}`, flavour.name, `Circular averaged flavour reference at "${flavour.name}" cannot be expanded.`);
      return;
    }

    if (flavour.cost_model.type === 'recipe') {
      addRecipe(
        flavour.cost_model.cake_recipe_id,
        sizeKg.mul(D(data.settings.cake_batches_per_kg)),
      );
      addRecipe(
        flavour.cost_model.frosting_recipe_id,
        sizeKg.mul(D(data.settings.frosting_batches_per_kg)),
      );
      return;
    }

    const references = flavour.cost_model.of.filter(id => flavourMap.has(id));
    if (references.length === 0) {
      warn(`flavour-average:${flavourId}`, flavour.name, `Average flavour "${flavour.name}" has no available recipe-backed flavours.`);
      return;
    }
    const share = sizeKg.div(D(references.length));
    const nextVisited = new Set(visited).add(flavourId);
    for (const reference of references) addFlavour(reference, share, nextVisited);
  };

  const addFilling = (fillingId: Id, sizeKg: Decimal) => {
    const filling = fillingMap.get(fillingId);
    if (!filling) {
      warn(`filling:${fillingId}`, `Missing filling (${fillingId})`, `Filling "${fillingId}" is referenced by the quote but no longer exists.`);
      return;
    }
    const grams = sizeKg.mul(D(data.settings.filling_grams_per_kg));
    if (filling.source.type === 'ingredient') {
      addIngredient(filling.source.ingredient_id, grams, 'g');
      return;
    }
    const recipe = recipeMap.get(filling.source.recipe_id);
    const recipeWeight = recipeResults[filling.source.recipe_id]?.weight ?? 0;
    if (!recipe || recipeWeight <= 0) {
      warn(`filling-recipe:${filling.source.recipe_id}`, recipe?.name ?? `Missing recipe (${filling.source.recipe_id})`, `Filling recipe "${filling.source.recipe_id}" is missing or has zero weight.`);
      return;
    }
    addRecipe(filling.source.recipe_id, grams.div(D(recipeWeight)));
  };

  const addProduction = (kind: 'batch' | 'assembled', id: Id, name: string | undefined, pieces: Decimal) => {
    const key = `${kind}:${id}`;
    const total = productionTotals.get(key) ?? {
      id,
      name: name || id,
      productKind: kind,
      pieces: D(0),
    };
    total.pieces = total.pieces.plus(pieces);
    productionTotals.set(key, total);
  };

  if (savedQuote.kind === 'products') {
    if (!savedQuote.product_quote_input) {
      warn(`product-quote:${savedQuote.id}`, savedQuote.name, 'Saved product quote has no product quote input.');
    } else {
      const productQuote = computeProductQuote(data, savedQuote.product_quote_input);
      for (const warning of productQuote.warnings) {
        if (warning.code === 'W_UNKNOWN_PRODUCT') {
          warn(`quote:${warning.path ?? warning.context}`, 'Missing product', warning.context);
        }
      }
      for (const line of savedQuote.product_quote_input.lines) {
        if (line.product_kind === 'batch') {
          const product = batchProductMap.get(line.product_id);
          if (!product) continue;
          const piecesPerBox = D(product.pieces_per_box > 0 ? product.pieces_per_box : 1);
          const orderedPieces = line.unit === 'box'
            ? D(line.quantity).mul(piecesPerBox)
            : D(line.quantity);
          addProduction('batch', product.id, product.name, orderedPieces);

          const recipe = recipeMap.get(product.recipe_id);
          const producedPieces = engineResult.batch_products[product.id]?.pieces ?? 0;
          if (!recipe || producedPieces <= 0) {
            warn(`product-recipe:${product.id}`, product.name || product.id, `Product recipe "${product.recipe_id}" is missing or has zero yield.`);
          } else {
            addRecipe(product.recipe_id, orderedPieces.div(D(producedPieces)), product.waste_pct ?? 0);
          }
          for (const component of product.components) {
            const componentWeight = recipeResults[component.recipe_id]?.weight ?? 0;
            if (componentWeight <= 0 || !recipeMap.has(component.recipe_id)) {
              warn(`product-component:${product.id}:${component.recipe_id}`, product.name || product.id, `Component recipe "${component.recipe_id}" is missing or has zero weight.`);
              continue;
            }
            addRecipe(component.recipe_id, D(component.grams).mul(orderedPieces).div(D(componentWeight)), product.waste_pct ?? 0);
          }

          if (product.box_id) {
            const boxCount = line.unit === 'box'
              ? D(line.quantity)
              : orderedPieces.div(piecesPerBox).ceil();
            addPackaging(product.box_id, boxCount, `${product.name || product.id} box`);
          }
          continue;
        }

        const product = assembledProductMap.get(line.product_id);
        if (!product) {
          continue;
        }
        if (line.unit === 'box') {
          warn(`unit:assembled-box:${product.id}`, product.name || product.id, 'Assembled products support piece quantities only; this saved line is treated as pieces.');
        }
        const piecesPerBox = D(product.pieces_per_box > 0 ? product.pieces_per_box : 1);
        const orderedPieces = D(line.quantity);
        addProduction('assembled', product.id, product.name, orderedPieces);
        for (const component of product.components) {
          if (component.type === 'ingredient_grams') {
            addIngredient(
              component.ingredient_id,
              D(component.grams).mul(orderedPieces).mul(wasteMultiplier(product.waste_pct)),
              'g',
            );
            continue;
          }
          const componentRecipe = recipeMap.get(component.recipe_id);
          const componentWeight = recipeResults[component.recipe_id]?.weight ?? 0;
          if (!componentRecipe || componentWeight <= 0) {
            warn(`product-component:${product.id}:${component.recipe_id}`, product.name || product.id, `Component recipe "${component.recipe_id}" is missing or has zero weight.`);
            continue;
          }
          const multiplier = component.type === 'cake_recipe_grams'
            ? D(component.grams).mul(D(data.settings.cake_batches_per_kg)).div(D(1000))
            : D(component.grams).div(D(componentWeight));
          addRecipe(component.recipe_id, multiplier.mul(orderedPieces), product.waste_pct ?? 0);
        }
        if (product.box_id) {
          addPackaging(product.box_id, orderedPieces.div(piecesPerBox).ceil(), `${product.name || product.id} box`);
        }
      }
    }
  } else {
    const cakeInput = savedQuote.input;
    const activeTiers = cakeInput.tiers.filter(tier => tier.size_kg > 0);
    for (const tier of activeTiers) {
      const sizeKg = D(tier.size_kg);
      if (tier.flavour_id) addFlavour(tier.flavour_id, sizeKg);
      if (tier.filling_id) addFilling(tier.filling_id, sizeKg);
    }

    const decoration = cakeInput.decoration;
    if (decoration.fondant_kg > 0) {
      if (data.settings.fondant_ingredient_id) {
        addIngredient(data.settings.fondant_ingredient_id, D(decoration.fondant_kg).mul(D(1000)), 'g');
      } else {
        warn('fondant:unassigned', 'Fondant', 'Fondant is included in the quote but no ingredient is assigned in Settings.');
      }
    }
    if (decoration.prints > 0) {
      addPackaging(data.settings.edible_print_item_id, D(decoration.prints), 'Edible print', true);
    }
    if (activeTiers.length > 0) {
      addPackaging(data.settings.cake_box_item_id, D(1), 'Cake box');
      addPackaging(data.settings.mdf_board_item_id, D(1), 'MDF board');
      addPackaging(data.settings.wallpaper_item_id, D(1), 'Wallpaper');
      addPackaging(data.settings.standard_board_item_id, D(activeTiers.length), 'Standard board');
    }
  }

  const ingredients = stableSort([...ingredientTotals].map(([id, total]) => ({
    id,
    name: ingredientMap.get(id)?.name ?? id,
    grams: toNumber(total.grams),
    pieces: toNumber(total.pieces),
    gramEquivalent: toNumber(total.gramEquivalent),
    teaspoons: toNumber(total.teaspoons),
    converted: total.converted,
  })));
  const packaging = stableSort([...packagingTotals].map(([id, quantity]) => ({
    id,
    name: packagingMap.get(id)?.name ?? id,
    quantity: toNumber(quantity),
  })));
  const production = stableSort([...productionTotals.values()].map(total => ({
    id: total.id,
    name: total.name,
    productKind: total.productKind,
    pieces: toNumber(total.pieces),
  })));

  return {
    ingredients,
    packaging,
    production,
    warnings: stableSort([...warningRows.values()]),
  };
}
