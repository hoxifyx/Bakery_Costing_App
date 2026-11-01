import Decimal from 'decimal.js';
import { compute } from './engine';
import type { AllergenCode, AppData, Id, RecipeLine, SavedQuote, Warning } from './types';

export interface NutritionValues {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fibre_g: number;
  sodium_mg: number;
}

export interface NutritionResult {
  total: NutritionValues;
  per_100g: NutritionValues | null;
  weight_g: number;
  warnings: Warning[];
}

export interface AllergenResult {
  allergens: AllergenCode[];
  warnings: Warning[];
}

const D = (value: number | string): Decimal => new Decimal(value);
const EMPTY_NUTRITION: NutritionValues = {
  kcal: 0,
  protein_g: 0,
  fat_g: 0,
  carbs_g: 0,
  fibre_g: 0,
  sodium_mg: 0,
};

function toNutritionValues(values: Record<keyof NutritionValues, Decimal>): NutritionValues {
  return {
    kcal: values.kcal.toNumber(),
    protein_g: values.protein_g.toNumber(),
    fat_g: values.fat_g.toNumber(),
    carbs_g: values.carbs_g.toNumber(),
    fibre_g: values.fibre_g.toNumber(),
    sodium_mg: values.sodium_mg.toNumber(),
  };
}

function lineGrams(line: RecipeLine, data: AppData): Decimal | null {
  if (line.unit === 'g') return D(line.quantity);
  const ingredient = data.ingredients.find(item => item.id === line.ingredient_id);
  if (line.unit === 'piece') {
    const pieceWeight = line.piece_weight_g_override ?? ingredient?.piece_weight_g;
    return pieceWeight == null || pieceWeight <= 0
      ? null
      : D(line.quantity).mul(D(pieceWeight));
  }
  const gramsPerTeaspoon = ingredient?.grams_per_tsp;
  return gramsPerTeaspoon == null || gramsPerTeaspoon <= 0
    ? null
    : D(line.quantity).mul(D(gramsPerTeaspoon));
}

export function computeNutrition(data: AppData, recipeId: Id): NutritionResult {
  const engineResult = compute(data);
  const recipe = data.recipes.find(item => item.id === recipeId);
  const result = engineResult.recipes[recipeId];
  if (!recipe || !result) {
    return { total: { ...EMPTY_NUTRITION }, per_100g: null, weight_g: 0, warnings: [] };
  }

  const totals: Record<keyof NutritionValues, Decimal> = {
    kcal: D(0),
    protein_g: D(0),
    fat_g: D(0),
    carbs_g: D(0),
    fibre_g: D(0),
    sodium_mg: D(0),
  };
  const ingredientMap = new Map(data.ingredients.map(ingredient => [ingredient.id, ingredient]));
  const ingredientGrams = new Map<Id, Decimal>();
  const missingNutrition = new Set<string>();

  for (const line of recipe.lines) {
    if (!line.ingredient_id) {
      if (line.quantity !== 0) missingNutrition.add(line.label ?? 'Unlinked ingredient');
      continue;
    }
    const grams = lineGrams(line, data);
    if (!grams) {
      missingNutrition.add(ingredientMap.get(line.ingredient_id)?.name ?? line.ingredient_id);
      continue;
    }
    ingredientGrams.set(
      line.ingredient_id,
      (ingredientGrams.get(line.ingredient_id) ?? D(0)).plus(grams),
    );
  }
  if (recipe.weight_adjustment_g !== 0) missingNutrition.add('Recipe weight adjustment');

  for (const [ingredientId, grams] of ingredientGrams) {
    const ingredient = ingredientMap.get(ingredientId);
    const nutrition = ingredient?.nutrition_per_100g;
    if (!ingredient || !nutrition) {
      missingNutrition.add(ingredient?.name ?? ingredientId);
      continue;
    }
    const amount = grams.div(100);
    totals.kcal = totals.kcal.plus(amount.mul(D(nutrition.kcal)));
    totals.protein_g = totals.protein_g.plus(amount.mul(D(nutrition.protein_g)));
    totals.fat_g = totals.fat_g.plus(amount.mul(D(nutrition.fat_g)));
    totals.carbs_g = totals.carbs_g.plus(amount.mul(D(nutrition.carbs_g)));
    totals.fibre_g = totals.fibre_g.plus(amount.mul(D(nutrition.fibre_g ?? 0)));
    totals.sodium_mg = totals.sodium_mg.plus(amount.mul(D(nutrition.sodium_mg ?? 0)));
  }

  const warnings: Warning[] = missingNutrition.size > 0
    ? [{
      code: 'W_NUTRITION_PARTIAL',
      context: `Nutrition is incomplete; missing data: ${[...missingNutrition].join(', ')}`,
      path: `recipe[${recipeId}]`,
    }]
    : [];
  const total = toNutritionValues(totals);
  const weight = D(result.weight);
  const per100 = weight.gt(0)
    ? toNutritionValues(Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, value.mul(100).div(weight)])
    ) as Record<keyof NutritionValues, Decimal>)
    : null;

  return { total, per_100g: per100, weight_g: result.weight, warnings };
}

function addRecipeIngredients(data: AppData, recipeId: Id, ids: Set<Id>, engineRecipes: Record<Id, unknown>): void {
  if (!engineRecipes[recipeId]) return;
  const recipe = data.recipes.find(item => item.id === recipeId);
  for (const line of recipe?.lines ?? []) {
    if (line.ingredient_id) ids.add(line.ingredient_id);
  }
}

function addProductIngredients(data: AppData, productKind: 'batch' | 'assembled', productId: Id, ids: Set<Id>, engineRecipes: Record<Id, unknown>): void {
  if (productKind === 'batch') {
    const product = data.batch_products.find(item => item.id === productId);
    if (!product) return;
    addRecipeIngredients(data, product.recipe_id, ids, engineRecipes);
    for (const component of product.components) {
      addRecipeIngredients(data, component.recipe_id, ids, engineRecipes);
    }
    return;
  }
  const product = data.assembled_products.find(item => item.id === productId);
  for (const component of product?.components ?? []) {
    if (component.type === 'ingredient_grams') ids.add(component.ingredient_id);
    else addRecipeIngredients(data, component.recipe_id, ids, engineRecipes);
  }
}

function targetIngredientIds(data: AppData, target: Id | SavedQuote): Id[] {
  const engineResult = compute(data);
  const ids = new Set<Id>();
  const addRecipe = (id: Id) => addRecipeIngredients(data, id, ids, engineResult.recipes);
  const addFlavour = (id: Id, visited = new Set<Id>()) => {
    if (visited.has(id)) return;
    visited.add(id);
    const flavour = data.flavours.find(item => item.id === id);
    if (!flavour) return;
    if (flavour.cost_model.type === 'recipe') {
      addRecipe(flavour.cost_model.cake_recipe_id);
      addRecipe(flavour.cost_model.frosting_recipe_id);
    } else {
      for (const child of flavour.cost_model.of) addFlavour(child, new Set(visited));
    }
  };
  const addFilling = (id: Id) => {
    const filling = data.fillings.find(item => item.id === id);
    if (!filling) return;
    if (filling.source.type === 'recipe') addRecipe(filling.source.recipe_id);
    else ids.add(filling.source.ingredient_id);
  };

  if (typeof target === 'string') {
    if (data.batch_products.some(product => product.id === target)) {
      addProductIngredients(data, 'batch', target, ids, engineResult.recipes);
    } else if (data.assembled_products.some(product => product.id === target)) {
      addProductIngredients(data, 'assembled', target, ids, engineResult.recipes);
    } else {
      addRecipe(target);
    }
  } else if (target.kind === 'products' && target.product_quote_input) {
    for (const line of target.product_quote_input.lines) {
      addProductIngredients(data, line.product_kind, line.product_id, ids, engineResult.recipes);
    }
  } else {
    for (const tier of target.input.tiers) {
      if (tier.size_kg <= 0) continue;
      if (tier.flavour_id) addFlavour(tier.flavour_id);
      if (tier.filling_id) addFilling(tier.filling_id);
    }
    if (target.input.decoration.fondant_kg > 0 && data.settings.fondant_ingredient_id) {
      ids.add(data.settings.fondant_ingredient_id);
    }
  }

  return [...ids];
}

export function computeAllergens(data: AppData, recipeProductIdOrQuote: Id | SavedQuote): AllergenResult {
  const ingredients = new Map(data.ingredients.map(ingredient => [ingredient.id, ingredient]));
  const allergens = new Set<AllergenCode>();
  const warnings: Warning[] = [];

  for (const ingredientId of targetIngredientIds(data, recipeProductIdOrQuote)) {
    const ingredient = ingredients.get(ingredientId);
    if (!ingredient?.allergens) {
      warnings.push({
        code: 'W_ALLERGEN_UNKNOWN',
        context: `Allergen data is not recorded for "${ingredient?.name ?? ingredientId}"`,
        path: `ingredients[${ingredientId}]`,
      });
      continue;
    }
    for (const allergen of ingredient.allergens) allergens.add(allergen);
  }

  return { allergens: [...allergens].sort(), warnings };
}
