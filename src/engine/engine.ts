/**
 * Pure calculation engine — implements §4 of the spec exactly.
 * No UI, storage or network access. All arithmetic uses decimal.js.
 */
import Decimal from 'decimal.js';
import { localDateString } from './utils';
import type {
  AppData,
  Ingredient,
  PackagingItem,
  Recipe,
  RecipeLine,
  Flavour,
  Filling,
  BatchProduct,
  AssembledProduct,
  QuoteInput,
  Settings,
  Id,
  EngineResult,
  RecipeResult,
  FlavourResult,
  FillingResult,
  BatchProductResult,
  AssembledProductResult,
  QuoteResult,
  ProductQuoteInput,
  ProductQuoteResult,
  ProductQuoteLineResult,
  Warning,
  WarningCode,
  AuditStep,
} from './types';

Decimal.set({ precision: 28, toExpNeg: -28, toExpPos: 28 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const D = (v: number | string | Decimal): Decimal => new Decimal(v);

function toNum(d: Decimal): number {
  return d.toNumber();
}

export function roundPrice(price: Decimal | number, step?: number): number {
  if (!step || step <= 0) {
    return typeof price === 'number' ? price : toNum(price);
  }
  const dPrice = typeof price === 'number' ? D(price) : price;
  const dStep = D(step);
  return toNum(dPrice.div(dStep).round().mul(dStep));
}

function warn(
  warnings: Warning[],
  code: WarningCode,
  context: string,
  path?: string
): void {
  warnings.push({ code, context, path });
}

function step(label: string, formula: string, value: Decimal | number, children?: AuditStep[]): AuditStep {
  return {
    label,
    formula,
    value: typeof value === 'number' ? value : toNum(value),
    children,
  };
}

// ---------------------------------------------------------------------------
// §4.1 Ingredient price
// ---------------------------------------------------------------------------

function ppu(ing: Ingredient): Decimal {
  // price per gram (unit_type g) or per piece (unit_type piece)
  if (!ing.pack_quantity || ing.pack_quantity <= 0) return D(0);
  return D(ing.pack_price).div(D(ing.pack_quantity));
}

function unpriced(ing: Ingredient): boolean {
  return !(ing.pack_quantity > 0 && ing.pack_price > 0);
}

// ---------------------------------------------------------------------------
// §4.2 Recipe line cost / weight
// ---------------------------------------------------------------------------

function lineCost(
  line: RecipeLine,
  ingMap: Map<Id, Ingredient>,
  warnings: Warning[],
  path: string
): Decimal {
  if (line.ingredient_id === null) return D(0);
  const ing = ingMap.get(line.ingredient_id);
  if (!ing) {
    warn(warnings, 'W_UNPRICED_INGREDIENT', `Ingredient ${line.ingredient_id} not found`, path);
    return D(0);
  }
  const expectedUnitType = line.unit === 'piece' ? 'piece' : 'g';
  if (ing.unit_type !== expectedUnitType) {
    warn(warnings, 'W_UNIT_MISMATCH', `Ingredient "${ing.name}" is typed as ${ing.unit_type} but recipe line uses ${line.unit}`, path);
  }
  if (line.unit === 'tsp' && (!ing.grams_per_tsp || ing.grams_per_tsp <= 0)) {
    warn(warnings, 'W_TSP_UNCONVERTED', `Ingredient "${ing.name}" has no valid grams_per_tsp conversion`, path);
  }
  if (unpriced(ing)) {
    warn(warnings, 'W_UNPRICED_INGREDIENT', `Ingredient "${ing.name}" is unpriced`, path);
    return D(0);
  }
  const p = ppu(ing);
  if (line.unit === 'tsp') {
    const gramsPerTsp = ing.grams_per_tsp ?? 0;
    return D(line.quantity).mul(D(gramsPerTsp)).mul(p);
  }
  return D(line.quantity).mul(p);
}

function lineWeight(line: RecipeLine, ingMap: Map<Id, Ingredient>): Decimal {
  if (line.exclude_from_weight) return D(0);
  if (line.unit === 'g') return D(line.quantity);
  if (line.unit === 'piece') {
    const ing = line.ingredient_id ? ingMap.get(line.ingredient_id) : null;
    const pieceW = line.piece_weight_g_override ?? ing?.piece_weight_g ?? 0;
    return D(line.quantity).mul(D(pieceW));
  }
  if (line.unit === 'tsp') {
    const ing = line.ingredient_id ? ingMap.get(line.ingredient_id) : null;
    const gramsPerTsp = ing?.grams_per_tsp ?? 0;
    return D(line.quantity).mul(D(gramsPerTsp));
  }
  return D(0);
}

// ---------------------------------------------------------------------------
// §4.3 Recipe
// ---------------------------------------------------------------------------

function computeRecipe(
  recipe: Recipe,
  ingMap: Map<Id, Ingredient>,
  settings: Settings,
  warnings: Warning[],
  multiplier: number = 1
): RecipeResult {
  const OH = D(settings.overhead_pct);
  const recipeWarnings: Warning[] = [];
  const lineAudit: AuditStep[] = [];

  let rawCost = D(0);
  let weightG = D(0);

  for (let i = 0; i < recipe.lines.length; i++) {
    const line = recipe.lines[i];
    const path = `recipe[${recipe.id}].lines[${i}]`;
    const lc = lineCost(line, ingMap, recipeWarnings, path);
    const lw = lineWeight(line, ingMap);
    rawCost = rawCost.add(lc);
    weightG = weightG.add(lw);

    const ingName = line.ingredient_id
      ? ingMap.get(line.ingredient_id)?.name ?? line.ingredient_id
      : '(free item)';
    lineAudit.push(step(
      `Line: ${ingName}`,
      `${line.quantity} ${line.unit}`,
      lc,
    ));
  }
  const baseWeightG = weightG.add(D(recipe.weight_adjustment_g));
  const baseWastePct = D(recipe.waste_pct ?? 0);
  const baseRawAfterWaste = rawCost.mul(D(1).add(baseWastePct));
  const baseCwo = baseRawAfterWaste.mul(D(1).add(OH));

  let scaledRawCost = rawCost;
  let scaledWeightG = baseWeightG;
  if (multiplier !== 1) {
    scaledRawCost = scaledRawCost.mul(D(multiplier));
    scaledWeightG = scaledWeightG.mul(D(multiplier));
  }

  const wastePct = D(recipe.waste_pct ?? 0);
  const rawAfterWaste = scaledRawCost.mul(D(1).add(wastePct));
  if (wastePct.gte(0.5)) {
    warn(recipeWarnings, 'W_WASTE_HIGH', `Recipe "${recipe.name}" has a high waste / spoilage setting (${toNum(wastePct.mul(100)).toFixed(1)}%)`, `recipe[${recipe.id}].waste_pct`);
  }
  const cwo = rawAfterWaste.mul(D(1).add(OH));
  const perGramCwo = baseWeightG.gt(0) ? baseCwo.div(baseWeightG) : D(0);
  const cakeCostPerKg = baseCwo.mul(D(settings.cake_batches_per_kg));
  const frostingCostPerKgCake = baseCwo.mul(D(settings.frosting_batches_per_kg));

  warnings.push(...recipeWarnings);

  const audit: AuditStep[] = [
    step('Raw cost (Σ line costs)', 'Σ line_cost(l)', scaledRawCost, lineAudit),
    step('Waste adjustment', 'raw × (1 + waste_pct); added = raw × waste_pct', rawAfterWaste.minus(scaledRawCost)),
    step('Raw cost after waste', 'raw_cost × (1 + waste_pct)', rawAfterWaste),
    step('Cost with overhead (cwo)', 'raw_after_waste × (1 + OH)', cwo),
    step('Batch weight', 'Σ line_weight(l) + weight_adjustment_g', scaledWeightG),
    step('Per-gram cwo', 'cwo / weight_g', perGramCwo),
    step('Cake cost/kg', 'cwo × cake_batches_per_kg', cakeCostPerKg),
    step('Frosting cost/kg cake', 'cwo × frosting_batches_per_kg', frostingCostPerKgCake),
  ];

  return {
    raw: toNum(scaledRawCost),
    raw_after_waste: toNum(rawAfterWaste),
    cwo: toNum(cwo),
    weight: toNum(scaledWeightG),
    per_gram_cwo: toNum(perGramCwo),
    cake_cost_per_kg: toNum(cakeCostPerKg),
    frosting_cost_per_kg_cake: toNum(frostingCostPerKgCake),
    warnings: recipeWarnings,
    audit,
  };
}

// ---------------------------------------------------------------------------
// §4.5 Flavour price per kg of cake
// ---------------------------------------------------------------------------

function computeFlavourBase(
  flavour: Flavour,
  flavourMap: Map<Id, Flavour>,
  recipeResults: Map<Id, RecipeResult>,
  warnings: Warning[],
  visited: Set<Id> = new Set()
): Decimal {
  if (visited.has(flavour.id)) {
    warn(warnings, 'W_UNKNOWN_FLAVOUR', `Circular average reference in flavour "${flavour.name}"`, `flavour[${flavour.id}]`);
    return D(0);
  }
  visited.add(flavour.id);

  if (flavour.cost_model.type === 'recipe') {
    const cakeRec = recipeResults.get(flavour.cost_model.cake_recipe_id);
    const frostRec = recipeResults.get(flavour.cost_model.frosting_recipe_id);
    if (!cakeRec) {
      warn(warnings, 'W_UNKNOWN_RECIPE', `Cake recipe "${flavour.cost_model.cake_recipe_id}" used by flavour "${flavour.name}" not found`, `flavour[${flavour.id}]`);
    }
    if (!frostRec) {
      warn(warnings, 'W_UNKNOWN_RECIPE', `Frosting recipe "${flavour.cost_model.frosting_recipe_id}" used by flavour "${flavour.name}" not found`, `flavour[${flavour.id}]`);
    }
    const cakePart = cakeRec ? D(cakeRec.cake_cost_per_kg) : D(0);
    const frostPart = frostRec ? D(frostRec.frosting_cost_per_kg_cake) : D(0);
    return cakePart.add(frostPart);
  } else {
    // average of base prices
    const refs = flavour.cost_model.of;
    if (refs.length === 0) return D(0);
    let sum = D(0);
    let count = 0;
    for (const refId of refs) {
      const ref = flavourMap.get(refId);
      if (!ref) {
        warn(warnings, 'W_UNKNOWN_FLAVOUR', `Averaged flavour id "${refId}" not found`, `flavour[${flavour.id}]`);
        continue;
      }
      const newVisited = new Set(visited);
      sum = sum.add(computeFlavourBase(ref, flavourMap, recipeResults, warnings, newVisited));
      count++;
    }
    return count > 0 ? sum.div(D(count)) : D(0);
  }
}

function computeFlavour(
  flavour: Flavour,
  flavourMap: Map<Id, Flavour>,
  recipeResults: Map<Id, RecipeResult>,
  settings: Settings,
  warnings: Warning[]
): FlavourResult {
  const OH = D(settings.overhead_pct);
  const flavourWarnings: Warning[] = [];

  if (flavour.addon_cost_per_kg === 0) {
    warn(flavourWarnings, 'W_ADDON_ZERO', `Flavour "${flavour.name}" has zero addon_cost_per_kg`, `flavour[${flavour.id}]`);
  }

  const base = computeFlavourBase(flavour, flavourMap, recipeResults, flavourWarnings);
  const addonWithOH = D(flavour.addon_cost_per_kg).mul(D(1).add(OH));
  const pricePerKg = base.add(addonWithOH);

  warnings.push(...flavourWarnings);

  const audit: AuditStep[] = [
    step('Base price/kg', 'cake_cost_per_kg + frosting_cost_per_kg_cake (or avg)', base),
    step('Addon with overhead', 'addon_cost_per_kg × (1 + OH)', addonWithOH),
    step('Flavour price/kg', 'base + addon_with_overhead', pricePerKg),
  ];

  return {
    base: toNum(base),
    price_per_kg: toNum(pricePerKg),
    warnings: flavourWarnings,
    audit,
  };
}

// ---------------------------------------------------------------------------
// §4.6 Filling cost per kg of cake
// ---------------------------------------------------------------------------

function computeFilling(
  filling: Filling,
  ingMap: Map<Id, Ingredient>,
  recipeResults: Map<Id, RecipeResult>,
  settings: Settings,
  warnings: Warning[]
): FillingResult {
  const OH = D(settings.overhead_pct);
  const fillGrams = D(settings.filling_grams_per_kg);
  const fillingWarnings: Warning[] = [];
  let costPerKg = D(0);
  const audit: AuditStep[] = [];

  if (filling.source.type === 'recipe') {
    const recRes = recipeResults.get(filling.source.recipe_id);
    if (!recRes) {
      warn(fillingWarnings, 'W_ZERO_WEIGHT_RECIPE', `Filling recipe "${filling.source.recipe_id}" not found`, `filling[${filling.id}]`);
    } else {
      if (recRes.weight === 0) {
        warn(fillingWarnings, 'W_ZERO_WEIGHT_RECIPE', `Filling recipe has zero weight`, `filling[${filling.id}]`);
      }
      const pgCwo = D(recRes.per_gram_cwo);
      costPerKg = pgCwo.mul(fillGrams);
      audit.push(step('per_gram_cwo', 'cwo / weight_g', pgCwo));
      audit.push(step('cost/kg cake', 'per_gram_cwo × filling_grams_per_kg', costPerKg));
    }
  } else {
    const ing = ingMap.get(filling.source.ingredient_id);
    if (!ing) {
      warn(fillingWarnings, 'W_UNPRICED_INGREDIENT', `Filling ingredient "${filling.source.ingredient_id}" not found`, `filling[${filling.id}]`);
    } else {
      if (unpriced(ing)) {
        warn(fillingWarnings, 'W_UNPRICED_INGREDIENT', `Filling ingredient "${ing.name}" is unpriced`, `filling[${filling.id}]`);
      }
      if (ing.unit_type !== 'g') {
        warn(fillingWarnings, 'W_UNIT_MISMATCH', `Filling ingredient "${ing.name}" is typed as piece but is being priced as grams`, `filling[${filling.id}]`);
      }
      const p = ppu(ing);
      costPerKg = p.mul(fillGrams).mul(D(1).add(OH));
      audit.push(step('ppu', 'pack_price / pack_quantity', p));
      audit.push(step('cost/kg cake', 'ppu × filling_grams_per_kg × (1+OH)', costPerKg));
    }
  }

  warnings.push(...fillingWarnings);
  return { cost_per_kg: toNum(costPerKg), warnings: fillingWarnings, audit };
}

// ---------------------------------------------------------------------------
// §4.8 Batch product
// ---------------------------------------------------------------------------
function computeBatchProduct(
  product: BatchProduct,
  recipeResults: Map<Id, RecipeResult>,
  _recipeMap: Map<Id, Recipe>,
  packMap: Map<Id, PackagingItem>,
  settings: Settings,
  warnings: Warning[]
): BatchProductResult {
  const OH = D(product.overhead_pct ?? settings.overhead_pct);
  const M = D(product.target_margin ?? settings.target_margin);
  const LAB = D(product.labour_rate_per_hour ?? settings.labour_rate_per_hour);
  const otherCost = D(product.other_cost_per_piece ?? 0);
  const prodWarnings: Warning[] = [];
  const audit: AuditStep[] = [];
  if (product.pieces_per_box <= 0) {
    warn(prodWarnings, 'W_ZERO_PACK_SIZE', `Product "${product.name}" has zero or negative pieces_per_box`, `batch_product[${product.id}].pieces_per_box`);
  }

  const r = recipeResults.get(product.recipe_id);
  if (!r) {
    warn(prodWarnings, 'W_UNKNOWN_RECIPE', `Recipe "${product.recipe_id}" used by batch product "${product.name}" not found`, `batch_product[${product.id}].recipe_id`);
  }
  const rawCost = r ? D(r.raw) : D(0);
  const rawAfterRecipeWaste = r ? D(r.raw_after_waste) : D(0);
  const weightG = r ? D(r.weight) : D(0);
  const wastePct = D(product.waste_pct ?? 0);
  const wasteMultiplier = D(1).add(wastePct);
  if (wastePct.gte(0.5)) {
    warn(prodWarnings, 'W_WASTE_HIGH', `Batch product "${product.name}" has a high waste / spoilage setting (${toNum(wastePct.mul(100)).toFixed(1)}%)`, `batch_product[${product.id}].waste_pct`);
  }

  let pieces: Decimal;
  if (product.pieces_mode === 'by_weight') {
    const pw = D(product.piece_weight_g ?? 0);
    if (pw.lte(0)) {
      warn(prodWarnings, 'W_ZERO_PIECES', `Product "${product.name}" piece_weight_g is 0`, `batch_product[${product.id}]`);
      pieces = D(0);
    } else {
      pieces = weightG.div(pw);
    }
    audit.push(step('Pieces (by weight)', 'weight_g / piece_weight_g', pieces));
  } else {
    pieces = D(product.fixed_pieces ?? 0);
    if (pieces.lte(0)) {
      warn(prodWarnings, 'W_ZERO_PIECES', `Product "${product.name}" fixed_pieces is 0`, `batch_product[${product.id}]`);
    }
    audit.push(step('Pieces (fixed)', 'fixed_pieces', pieces));
  }

  if (product.labour_hours_per_batch === 0) {
    warn(prodWarnings, 'W_NO_LABOUR_HOURS', `Product "${product.name}" has zero labour hours`, `batch_product[${product.id}]`);
  }

  const labour = D(product.labour_hours_per_batch).mul(LAB);
  const effectiveRawCost = rawAfterRecipeWaste.mul(wasteMultiplier);
  const baseUnitCost = pieces.gt(0)
    ? effectiveRawCost.add(labour).mul(D(1).add(OH)).div(pieces)
    : D(0);

  // Components (already contain overhead, do NOT add again)
  let componentsCost = D(0);
  for (const comp of product.components) {
    const cr = recipeResults.get(comp.recipe_id);
    if (!cr) {
      warn(prodWarnings, 'W_UNKNOWN_RECIPE', `Component recipe "${comp.recipe_id}" used by batch product "${product.name}" not found`, `batch_product[${product.id}].components`);
      continue;
    }
    const pgCwo = D(cr.per_gram_cwo);
    componentsCost = componentsCost.add(pgCwo.mul(D(comp.grams)));
  }

  const componentsCostWithWaste = componentsCost.mul(wasteMultiplier);
  const unitCost = baseUnitCost.add(componentsCostWithWaste);
  const recipeWasteAdded = pieces.gt(0)
    ? rawAfterRecipeWaste.mul(D(1).add(OH)).mul(wastePct).div(pieces)
    : D(0);
  const wasteAdded = recipeWasteAdded.add(componentsCost.mul(wastePct));
  const costEachExclBox = unitCost.add(otherCost);

  const boxItem = product.box_id ? packMap.get(product.box_id) : null;
  const boxPrice = boxItem ? D(boxItem.price) : D(0);
  const ppb = D(product.pieces_per_box > 0 ? product.pieces_per_box : 1);

  const costEachInclBox = costEachExclBox.add(boxPrice.div(ppb));

  const eachInclBox = D(1).minus(M).gt(0)
    ? costEachInclBox.div(D(1).minus(M))
    : D(0);
  const eachExclBox = D(1).minus(M).gt(0)
    ? costEachExclBox.div(D(1).minus(M))
    : D(0);
  const boxPriceResult = D(1).minus(M).gt(0)
    ? costEachExclBox.mul(ppb).add(boxPrice).div(D(1).minus(M))
    : D(0);
  const headlineEach = product.show_each_including_box ? eachInclBox : eachExclBox;
  const costEach = product.show_each_including_box ? costEachInclBox : costEachExclBox;
  const costBox = costEachExclBox.mul(ppb).add(boxPrice);

  const rawCostPerPiece = pieces.gt(0) ? rawCost.div(pieces) : D(0);

  audit.push(
    step('Labour', 'labour_hours × LAB', labour),
    step('Product waste adjustment', 'ingredient-derived cost × waste_pct', wasteAdded),
    step('Base unit cost', '(raw_after_recipe_waste × (1 + product_waste) + labour) × (1+OH) / pieces', baseUnitCost),
    step('Components cost/piece', 'Σ per_gram_cwo × grams × (1 + product_waste)', componentsCostWithWaste),
    step('Unit cost', 'base_unit_cost + components_cost', unitCost),
    step('Cost each excl. box', 'unit_cost + other_cost_per_piece', costEachExclBox),
    step('Cost each incl. box', 'cost_each_excl_box + box_price / pieces_per_box', costEachInclBox),
    step('Each incl. box', 'cost_each_incl_box / (1-M)', eachInclBox),
    step('Each excl. box', 'cost_each_excl_box / (1-M)', eachExclBox),
    step('Box price (full box)', '(cost_each_excl_box × ppb + box) / (1-M)', boxPriceResult),
  );

  const roundingStep = settings.price_rounding_step;
  const suggestedHeadline = roundingStep && roundingStep > 0
    ? roundPrice(headlineEach, roundingStep)
    : undefined;

  if (suggestedHeadline !== undefined) {
    audit.push(step('Suggested headline each (display only)', `round(${toNum(headlineEach).toFixed(2)}, nearest ${roundingStep})`, suggestedHeadline));
  }

  // Live profit & margin for my_price_each and my_price_box
  let profitEach: Decimal | undefined;
  let marginEach: Decimal | undefined;
  if (product.my_price_each !== undefined && product.my_price_each !== null) {
    const myPrice = D(product.my_price_each);
    profitEach = myPrice.minus(costEach);
    marginEach = myPrice.gt(0) ? profitEach.div(myPrice) : D(0);

    if (myPrice.lt(costEach)) {
      warn(prodWarnings, 'W_PRICE_BELOW_COST', `Product "${product.name}" price (${toNum(myPrice).toFixed(2)}) is below cost (${toNum(costEach).toFixed(2)})`, `batch_product[${product.id}].my_price_each`);
    } else if (marginEach.lt(M)) {
      warn(prodWarnings, 'W_PRICE_BELOW_TARGET', `Product "${product.name}" margin (${toNum(marginEach.mul(100)).toFixed(1)}%) is below target (${toNum(M.mul(100)).toFixed(1)}%)`, `batch_product[${product.id}].my_price_each`);
    }
  }

  let profitBox: Decimal | undefined;
  let marginBox: Decimal | undefined;
  if (product.my_price_box !== undefined && product.my_price_box !== null) {
    const myPriceB = D(product.my_price_box);
    profitBox = myPriceB.minus(costBox);
    marginBox = myPriceB.gt(0) ? profitBox.div(myPriceB) : D(0);

    if (myPriceB.lt(costBox)) {
      warn(prodWarnings, 'W_PRICE_BELOW_COST', `Product "${product.name}" box price (${toNum(myPriceB).toFixed(2)}) is below cost (${toNum(costBox).toFixed(2)})`, `batch_product[${product.id}].my_price_box`);
    } else if (marginBox.lt(M)) {
      warn(prodWarnings, 'W_PRICE_BELOW_TARGET', `Product "${product.name}" box margin (${toNum(marginBox.mul(100)).toFixed(1)}%) is below target (${toNum(M.mul(100)).toFixed(1)}%)`, `batch_product[${product.id}].my_price_box`);
    }
  }

  const priceInUseEach = product.my_price_each !== undefined && product.my_price_each !== null
    ? D(product.my_price_each)
    : headlineEach;

  warnings.push(...prodWarnings);

  return {
    pieces: toNum(pieces),
    raw_cost_per_piece: toNum(rawCostPerPiece),
    waste_added: toNum(wasteAdded),
    unit_cost: toNum(unitCost),
    cost_each_excl_box: toNum(costEachExclBox),
    cost_each_incl_box: toNum(costEachInclBox),
    cost_each: toNum(costEach),
    cost_box: toNum(costBox),
    each_including_box: toNum(eachInclBox),
    each_excluding_box: toNum(eachExclBox),
    box_price: toNum(boxPriceResult),
    headline_each: toNum(headlineEach),
    suggested_headline_each: suggestedHeadline,
    my_price_each: product.my_price_each,
    my_price_box: product.my_price_box,
    profit_each: profitEach !== undefined ? toNum(profitEach) : undefined,
    margin_each: marginEach !== undefined ? toNum(marginEach) : undefined,
    profit_box: profitBox !== undefined ? toNum(profitBox) : undefined,
    margin_box: marginBox !== undefined ? toNum(marginBox) : undefined,
    price_in_use_each: toNum(priceInUseEach),
    warnings: prodWarnings,
    audit,
  };
}

// ---------------------------------------------------------------------------
// §4.9 Assembled products
// ---------------------------------------------------------------------------

function computeAssembledProduct(
  product: AssembledProduct,
  recipeResults: Map<Id, RecipeResult>,
  ingMap: Map<Id, Ingredient>,
  packMap: Map<Id, PackagingItem>,
  settings: Settings,
  warnings: Warning[]
): AssembledProductResult {
  const OH = D(product.overhead_pct ?? settings.overhead_pct);
  const M = D(product.target_margin ?? settings.target_margin);
  const LAB = D(product.labour_rate_per_hour ?? settings.labour_rate_per_hour);
  const otherCost = D(product.other_cost_per_piece ?? 0);
  const wastePct = D(product.waste_pct ?? 0);
  const wasteMultiplier = D(1).add(wastePct);
  const prodWarnings: Warning[] = [];
  const audit: AuditStep[] = [];
  if (product.pieces_per_box <= 0) {
    warn(prodWarnings, 'W_ZERO_PACK_SIZE', `Product "${product.name}" has zero or negative pieces_per_box`, `assembled_products[${product.id}].pieces_per_box`);
  }

  if (wastePct.gte(0.5)) {
    warn(prodWarnings, 'W_WASTE_HIGH', `Assembled product "${product.name}" has a high waste / spoilage setting (${toNum(wastePct.mul(100)).toFixed(1)}%)`, `assembled_products[${product.id}].waste_pct`);
  }

  let unitCost = D(0);
  for (const comp of product.components) {
    let compCost = D(0);
    if (comp.type === 'cake_recipe_grams') {
      const rr = recipeResults.get(comp.recipe_id);
      if (!rr) {
        warn(prodWarnings, 'W_UNKNOWN_RECIPE', `Cake recipe "${comp.recipe_id}" used by assembled product "${product.name}" not found`, `assembled[${product.id}]`);
        continue;
      }
      // cake_cost_per_gram = cwo * cake_batches_per_kg / 1000
      const cakeCostPerGram = D(rr.cwo).mul(D(settings.cake_batches_per_kg)).div(D(1000));
      compCost = cakeCostPerGram.mul(D(comp.grams));
      audit.push(step(`Cake (${comp.recipe_id}) ${comp.grams}g`, 'cake_cost_per_gram × grams', compCost));
    } else if (comp.type === 'recipe_per_gram') {
      const rr = recipeResults.get(comp.recipe_id);
      if (!rr) {
        warn(prodWarnings, 'W_UNKNOWN_RECIPE', `Recipe "${comp.recipe_id}" used by assembled product "${product.name}" not found`, `assembled[${product.id}]`);
        continue;
      }
      compCost = D(rr.per_gram_cwo).mul(D(comp.grams));
      audit.push(step(`Recipe (${comp.recipe_id}) ${comp.grams}g`, 'per_gram_cwo × grams', compCost));
    } else if (comp.type === 'ingredient_grams') {
      const ing = ingMap.get(comp.ingredient_id);
      if (!ing) {
        warn(prodWarnings, 'W_UNPRICED_INGREDIENT', `Ingredient "${comp.ingredient_id}" not found in assembled product "${product.name}"`, `assembled[${product.id}]`);
        continue;
      }
      if (unpriced(ing)) {
        warn(prodWarnings, 'W_UNPRICED_INGREDIENT', `Ingredient "${ing.name}" unpriced in assembled product`, `assembled[${product.id}]`);
      }
      if (ing.unit_type !== 'g') {
        warn(prodWarnings, 'W_UNIT_MISMATCH', `Ingredient "${ing.name}" is typed as piece but used as grams in assembled product`, `assembled[${product.id}]`);
      }
      compCost = ppu(ing).mul(D(comp.grams)).mul(D(1).add(OH));
      audit.push(step(`Ingredient (${ing.name}) ${comp.grams}g`, 'ppu × grams × (1+OH)', compCost));
    }
    unitCost = unitCost.add(compCost);
  }

  const componentCostBeforeWaste = unitCost;
  unitCost = unitCost.mul(wasteMultiplier);
  const wasteAdded = componentCostBeforeWaste.mul(wastePct);

  if (product.labour_hours_per_batch === 0) {
    warn(prodWarnings, 'W_NO_LABOUR_HOURS', `Assembled product "${product.name}" has zero labour hours`, `assembled[${product.id}]`);
  }

  const piecesPerBatch = D(product.pieces_per_batch > 0 ? product.pieces_per_batch : 1);
  const labourPiece = D(product.labour_hours_per_batch).mul(LAB).mul(D(1).add(OH)).div(piecesPerBatch);

  const boxItem = product.box_id ? packMap.get(product.box_id) : null;
  const boxPrice = boxItem ? D(boxItem.price) : D(0);
  const ppb = D(product.pieces_per_box > 0 ? product.pieces_per_box : 1);
  const boxPiece = boxPrice.div(ppb);

  const costEach = unitCost.add(labourPiece).add(otherCost).add(boxPiece);

  const priceEach = D(1).minus(M).gt(0)
    ? costEach.div(D(1).minus(M))
    : D(0);

  audit.push(
    step('Product waste adjustment', 'component_cost × waste_pct', wasteAdded),
    step('Unit cost (components)', 'Σ component_cost(c) × (1 + product_waste)', unitCost),
    step('Labour per piece', 'labour_hours × LAB × (1+OH) / pieces_per_batch', labourPiece),
    step('Box per piece', 'box_price / pieces_per_box', boxPiece),
    step('Other cost per piece', 'user amount', otherCost),
    step('Cost each', 'unit_cost + labour_piece + other_cost_per_piece + box_price / pieces_per_box', costEach),
    step('Price each', 'cost_each / (1-M)', priceEach),
  );

  const roundingStep = settings.price_rounding_step;
  const suggestedPriceEach = roundingStep && roundingStep > 0
    ? roundPrice(priceEach, roundingStep)
    : undefined;

  if (suggestedPriceEach !== undefined) {
    audit.push(step('Suggested price each (display only)', `round(${toNum(priceEach).toFixed(2)}, nearest ${roundingStep})`, suggestedPriceEach));
  }

  // Live profit & margin for my_price_each
  let profitEach: Decimal | undefined;
  let marginEach: Decimal | undefined;
  if (product.my_price_each !== undefined && product.my_price_each !== null) {
    const myPrice = D(product.my_price_each);
    profitEach = myPrice.minus(costEach);
    marginEach = myPrice.gt(0) ? profitEach.div(myPrice) : D(0);

    if (myPrice.lt(costEach)) {
      warn(prodWarnings, 'W_PRICE_BELOW_COST', `Product "${product.name}" price (${toNum(myPrice).toFixed(2)}) is below cost (${toNum(costEach).toFixed(2)})`, `assembled[${product.id}].my_price_each`);
    } else if (marginEach.lt(M)) {
      warn(prodWarnings, 'W_PRICE_BELOW_TARGET', `Product "${product.name}" margin (${toNum(marginEach.mul(100)).toFixed(1)}%) is below target (${toNum(M.mul(100)).toFixed(1)}%)`, `assembled[${product.id}].my_price_each`);
    }
  }

  const priceInUseEach = product.my_price_each !== undefined && product.my_price_each !== null
    ? D(product.my_price_each)
    : priceEach;

  warnings.push(...prodWarnings);

  return {
    unit_cost: toNum(unitCost),
    waste_added: toNum(wasteAdded),
    labour_piece: toNum(labourPiece),
    box_piece: toNum(boxPiece),
    cost_each: toNum(costEach),
    price_each: toNum(priceEach),
    suggested_price_each: suggestedPriceEach,
    my_price_each: product.my_price_each,
    profit_each: profitEach !== undefined ? toNum(profitEach) : undefined,
    margin_each: marginEach !== undefined ? toNum(marginEach) : undefined,
    price_in_use_each: toNum(priceInUseEach),
    warnings: prodWarnings,
    audit,
  };
}

// ---------------------------------------------------------------------------
// §4.7 Cake quote
// ---------------------------------------------------------------------------

function computeQuote(
  quoteInput: QuoteInput,
  flavourResults: Map<Id, FlavourResult>,
  fillingResults: Map<Id, FillingResult>,
  packMap: Map<Id, PackagingItem>,
  ingMap: Map<Id, Ingredient>,
  _flavourMap: Map<Id, Flavour>,
  _fillingMap: Map<Id, Filling>,
  settings: Settings,
  warnings: Warning[]
): QuoteResult | null {
  // Gate: tier 1 must have size_kg > 0
  const tiers = quoteInput.tiers;
  if (!tiers[0] || tiers[0].size_kg <= 0) return null;

  const OH = D(settings.overhead_pct);
  const M = D(settings.target_margin);
  const LAB = D(settings.labour_rate_per_hour);
  const quoteWarnings: Warning[] = [];
  const audit: AuditStep[] = [];

  let tierCostTotal = D(0);
  let tiersUsed = 0;
  const tierDetails: { flavour_part: number; filling_part: number }[] = [];

  for (let i = 0; i < 6; i++) {
    const tier = tiers[i] ?? { size_kg: 0 };
    const sizeKg = D(tier.size_kg ?? 0);

    if (sizeKg.lte(0)) {
      // Check if flavour/filling set without size
      if (tier.flavour_id || tier.filling_id) {
        warn(quoteWarnings, 'W_TIER_NO_SIZE', `Tier ${i + 1} has flavour/filling but size_kg is 0`, `tiers[${i}]`);
      }
      tierDetails.push({ flavour_part: 0, filling_part: 0 });
      continue;
    }

    tiersUsed++;

    // Flavour
    let flavourPart = D(0);
    if (!tier.flavour_id) {
      warn(quoteWarnings, 'W_TIER_NO_FLAVOUR', `Tier ${i + 1} is missing a flavour`, `tiers[${i}]`);
    } else {
      const fl = flavourResults.get(tier.flavour_id);
      if (!fl) {
        warn(quoteWarnings, 'W_UNKNOWN_FLAVOUR', `Tier ${i + 1} flavour not found`, `tiers[${i}]`);
      } else {
        flavourPart = sizeKg.mul(D(fl.price_per_kg));
      }
    }

    // Filling
    let fillingPart = D(0);
    if (!tier.filling_id) {
      warn(quoteWarnings, 'W_TIER_NO_FILLING', `Tier ${i + 1} is missing a filling`, `tiers[${i}]`);
    } else {
      const fi = fillingResults.get(tier.filling_id);
      if (!fi) {
        warn(quoteWarnings, 'W_UNKNOWN_FILLING', `Tier ${i + 1} filling not found`, `tiers[${i}]`);
      } else {
        fillingPart = sizeKg.mul(D(fi.cost_per_kg));
      }
    }

    tierCostTotal = tierCostTotal.add(flavourPart).add(fillingPart);
    tierDetails.push({ flavour_part: toNum(flavourPart), filling_part: toNum(fillingPart) });
    audit.push(step(`Tier ${i + 1} (${tier.size_kg}kg)`, 'flavour_part + filling_part', flavourPart.add(fillingPart)));
  }

  const dec = quoteInput.decoration;

  // fondant: quote quantity is kg; ppu is per gram, so multiply by 1000
  let fondant = D(0);
  if (dec.fondant_kg > 0) {
    if (!settings.fondant_ingredient_id) {
      warn(quoteWarnings, 'W_ROLE_NOT_SET', 'Fondant ingredient role not set in settings', 'settings.fondant_ingredient_id');
    } else {
      const fondantIng = ingMap.get(settings.fondant_ingredient_id);
      if (fondantIng) {
        if (fondantIng.unit_type !== 'g') {
          warn(quoteWarnings, 'W_UNIT_MISMATCH', `Fondant ingredient "${fondantIng.name}" is typed as piece but used as grams for fondant`, 'settings.fondant_ingredient_id');
        }
        fondant = D(dec.fondant_kg).mul(ppu(fondantIng)).mul(D(1000));
      } else {
        warn(quoteWarnings, 'W_ROLE_NOT_SET', `Fondant ingredient "${settings.fondant_ingredient_id}" not found in settings`, 'settings.fondant_ingredient_id');
      }
    }
  }

  let printCost = D(0);
  if (dec.prints > 0) {
    if (!settings.edible_print_item_id) {
      warn(quoteWarnings, 'W_ROLE_NOT_SET', 'Edible print item role not set in settings', 'settings.edible_print_item_id');
    } else {
      const printItem = packMap.get(settings.edible_print_item_id);
      if (printItem) {
        printCost = D(dec.prints).mul(D(printItem.price));
      } else {
        warn(quoteWarnings, 'W_ROLE_NOT_SET', `Edible print item "${settings.edible_print_item_id}" not found in settings`, 'settings.edible_print_item_id');
      }
    }
  }

  const flowers = D(dec.flowers);
  const topper = D(dec.toppers).mul(D(settings.topper_price));
  const time = D(dec.time_hours).mul(LAB);
  const others = D(dec.others);
  const delivery = D(dec.delivery);

  if (dec.time_hours === 0) {
    warn(quoteWarnings, 'W_NO_TIME_HOURS', 'Time hours is 0 — labour is free', 'decoration.time_hours');
  }

  const decorationSum = fondant.add(printCost).add(flowers).add(topper).add(time).add(others);
  // overhead on decoration (NOT on delivery, NOT on tiers which already have it via flavour/filling)
  const overhead = decorationSum.mul(OH);

  // packaging
  const cakeBoxItem = settings.cake_box_item_id ? packMap.get(settings.cake_box_item_id) : null;
  const mdfItem = settings.mdf_board_item_id ? packMap.get(settings.mdf_board_item_id) : null;
  const wallpaperItem = settings.wallpaper_item_id ? packMap.get(settings.wallpaper_item_id) : null;
  const stdBoardItem = settings.standard_board_item_id ? packMap.get(settings.standard_board_item_id) : null;

  for (const [role, id] of [
    ['cake_box_item_id', settings.cake_box_item_id],
    ['mdf_board_item_id', settings.mdf_board_item_id],
    ['wallpaper_item_id', settings.wallpaper_item_id],
    ['standard_board_item_id', settings.standard_board_item_id],
  ] as const) {
    if (id && !packMap.has(id)) {
      warn(quoteWarnings, 'W_ROLE_NOT_SET', `Packaging item "${id}" for ${role} not found in settings`, `settings.${role}`);
    }
  }

  const cakeBoxPrice = cakeBoxItem ? D(cakeBoxItem.price) : D(0);
  const mdfPrice = mdfItem ? D(mdfItem.price) : D(0);
  const wallpaperPrice = wallpaperItem ? D(wallpaperItem.price) : D(0);
  const stdBoardPrice = stdBoardItem ? D(stdBoardItem.price) : D(0);

  const packagingAllowance = D(settings.packaging_allowance_pct);
  const packagingBase = cakeBoxPrice
    .add(mdfPrice)
    .add(wallpaperPrice)
    .add(stdBoardPrice.mul(D(tiersUsed)));
  const packaging = packagingBase.mul(D(1).add(packagingAllowance));

  const totalCost = tierCostTotal.add(decorationSum).add(delivery).add(overhead).add(packaging);

  // profit = (total_cost - delivery) * M / (1 - M)
  const profitBase = totalCost.minus(delivery);
  const profit = D(1).minus(M).gt(0)
    ? profitBase.mul(M).div(D(1).minus(M))
    : D(0);

  // Discount — comes out of profit only; capped to [0, profit]
  const rawDiscount = D(Math.max(0, dec.discount ?? 0));
  const effectiveDiscount = rawDiscount.gt(profit) ? profit : rawDiscount;
  const discountCapped = rawDiscount.gt(profit) && rawDiscount.gt(0);

  if (discountCapped) {
    warn(quoteWarnings, 'W_DISCOUNT_CAPPED',
      `Discount was capped from ${rawDiscount.toFixed(2)} to ${effectiveDiscount.toFixed(2)} (available profit)`,
      'decoration.discount');
  }

  const totalPrice = totalCost.add(profit).minus(effectiveDiscount);
  const marginCheck = totalPrice.minus(delivery).gt(0)
    ? profit.minus(effectiveDiscount).div(totalPrice.minus(delivery))
    : D(0);

  audit.push(
    step('Tier cost total', 'Σ (flavour_part + filling_part)', tierCostTotal),
    step('Fondant', 'fondant_kg × ppu(fondant) × 1000', fondant),
    step('Edible print', 'prints × price(edible_print)', printCost),
    step('Flowers', 'user amount', flowers),
    step('Topper', 'toppers × topper_price', topper),
    step('Time / Labour', 'time_hours × LAB', time),
    step('Others', 'user amount', others),
    step('Decoration sum', 'fondant+print+flowers+topper+time+others', decorationSum),
    step('Delivery', 'user amount (no profit, no overhead)', delivery),
    step('Overhead on decoration', 'decoration_sum × OH', overhead),
    step('Packaging', '(cake_box + mdf + wallpaper + std_board×tiers_used) × (1+packaging_allowance_pct)', packaging),
    step('Total cost', 'tier_cost + decoration_sum + delivery + overhead + packaging', totalCost),
    step('Profit', '(total_cost - delivery) × M / (1-M)', profit),
    step('Discount', `capped to profit if needed (input: ${toNum(rawDiscount).toFixed(2)})`, effectiveDiscount),
    step('Total price', 'total_cost + profit - discount', totalPrice),
    step('Margin check', 'profit / (total_price - delivery)', marginCheck),
  );

  const roundingStep = settings.price_rounding_step;
  const suggestedPrice = roundingStep && roundingStep > 0
    ? roundPrice(totalPrice, roundingStep)
    : undefined;

  if (suggestedPrice !== undefined) {
    audit.push(step('Suggested price (display only)', `round(${toNum(totalPrice).toFixed(2)}, nearest ${roundingStep})`, suggestedPrice));
  }

  warnings.push(...quoteWarnings);

  return {
    tier_cost: toNum(tierCostTotal),
    tiers_used: tiersUsed,
    decoration_sum: toNum(decorationSum),
    fondant: toNum(fondant),
    print: toNum(printCost),
    flowers: toNum(flowers),
    topper: toNum(topper),
    time: toNum(time),
    others: toNum(others),
    delivery: toNum(delivery),
    overhead: toNum(overhead),
    packaging: toNum(packaging),
    total_cost: toNum(totalCost),
    profit: toNum(profit),
    discount: toNum(effectiveDiscount),
    discount_capped: discountCapped,
    total_price: toNum(totalPrice),
    suggested_price: suggestedPrice,
    margin_check: toNum(marginCheck),
    tier_details: tierDetails,
    warnings: quoteWarnings,
    audit,
  };
}

// ---------------------------------------------------------------------------
// Main compute function
// ---------------------------------------------------------------------------

export function compute(data: AppData, quoteInput?: QuoteInput | null, recipeMultipliers?: Record<Id, number>): EngineResult {
  const { settings, ingredients, packaging_items, recipes, flavours, fillings, batch_products, assembled_products } = data;

  const ingMap = new Map<Id, Ingredient>(ingredients.map(i => [i.id, i]));
  const packMap = new Map<Id, PackagingItem>(packaging_items.map(p => [p.id, p]));
  const recipeMap = new Map<Id, Recipe>(recipes.map(r => [r.id, r]));
  const flavourMap = new Map<Id, Flavour>(flavours.map(f => [f.id, f]));
  const fillingMap = new Map<Id, Filling>(fillings.map(f => [f.id, f]));

  const allWarnings: Warning[] = [];

  // §4.3 Recipes
  const recipeResults = new Map<Id, RecipeResult>();
  for (const recipe of recipes) {
    const mult = recipeMultipliers?.[recipe.id] ?? 1;
    const res = computeRecipe(recipe, ingMap, settings, allWarnings, mult);
    recipeResults.set(recipe.id, res);
  }

  // §4.5 Flavours
  const flavourResults = new Map<Id, FlavourResult>();
  for (const flavour of flavours) {
    const res = computeFlavour(flavour, flavourMap, recipeResults, settings, allWarnings);
    flavourResults.set(flavour.id, res);
  }

  // §4.6 Fillings
  const fillingResults = new Map<Id, FillingResult>();
  for (const filling of fillings) {
    const res = computeFilling(filling, ingMap, recipeResults, settings, allWarnings);
    fillingResults.set(filling.id, res);
  }

  // §4.8 Batch products
  const batchProductResults = new Map<Id, BatchProductResult>();
  for (const product of batch_products) {
    const res = computeBatchProduct(product, recipeResults, recipeMap, packMap, settings, allWarnings);
    batchProductResults.set(product.id, res);
  }

  // §4.9 Assembled products
  const assembledProductResults = new Map<Id, AssembledProductResult>();
  for (const product of assembled_products) {
    const res = computeAssembledProduct(product, recipeResults, ingMap, packMap, settings, allWarnings);
    assembledProductResults.set(product.id, res);
  }

  // §4.7 Quote
  let quote: QuoteResult | null = null;
  if (quoteInput) {
    quote = computeQuote(
      quoteInput,
      flavourResults,
      fillingResults,
      packMap,
      ingMap,
      flavourMap,
      fillingMap,
      settings,
      allWarnings
    );
  }

  // Phase 4: Order data health warnings
  const todayStr = localDateString();
  if (data.orders) {
    for (const o of data.orders) {
      if (!o.quote_id) {
        allWarnings.push({
          code: 'W_ORDER_WITHOUT_QUOTE',
          context: `Order has no linked quote`,
          path: `order[${o.id}]`
        });
      }
      if (o.due_date && o.due_date < todayStr && o.status !== 'Delivered' && o.status !== 'Cancelled') {
        allWarnings.push({
          code: 'W_ORDER_PAST_DUE',
          context: `Order is past due (${o.due_date}) but status is ${o.status}`,
          path: `order[${o.id}]`
        });
      }
    }
  }

  return {
    recipes: Object.fromEntries(recipeResults),
    flavours: Object.fromEntries(flavourResults),
    fillings: Object.fromEntries(fillingResults),
    batch_products: Object.fromEntries(batchProductResults),
    assembled_products: Object.fromEntries(assembledProductResults),
    quote,
    all_warnings: allWarnings,
  };
}

// ---------------------------------------------------------------------------
// §4.10 Product Quote (R4)
// ---------------------------------------------------------------------------

export function computeProductQuote(
  data: AppData,
  input: ProductQuoteInput,
  recipeMultipliers?: Record<Id, number>
): ProductQuoteResult {
  const engineRes = compute(data, null, recipeMultipliers);
  const { batch_products, assembled_products } = engineRes;
  const warnings: Warning[] = [];
  const audit: AuditStep[] = [];

  const lineResults: ProductQuoteLineResult[] = [];
  let subtotal = D(0);
  let costTotal = D(0);

  input.lines.forEach((line, idx) => {
    const pPath = `lines[${idx}]`;
    const qty = D(line.quantity ?? 0);

    if (qty.lte(0)) {
      warn(warnings, 'W_ZERO_QUANTITY', `Line ${idx + 1} has zero or negative quantity`, `${pPath}.quantity`);
    }

    let unitPrice = D(0);
    let unitCost = D(0);

    if (line.product_kind === 'batch') {
      const bRes = batch_products[line.product_id];
      if (!bRes) {
        warn(warnings, 'W_UNKNOWN_PRODUCT', `Batch product "${line.product_id}" not found`, `${pPath}.product_id`);
      } else {
        if (line.unit === 'box') {
          unitCost = D(bRes.cost_box);
          const defaultPrice = bRes.my_price_box !== undefined && bRes.my_price_box !== null
            ? D(bRes.my_price_box)
            : D(bRes.box_price);
          unitPrice = line.price_override !== undefined && line.price_override !== null
            ? D(line.price_override)
            : defaultPrice;
        } else {
          unitCost = D(bRes.cost_each);
          const defaultPrice = bRes.my_price_each !== undefined && bRes.my_price_each !== null
            ? D(bRes.my_price_each)
            : D(bRes.headline_each);
          unitPrice = line.price_override !== undefined && line.price_override !== null
            ? D(line.price_override)
            : defaultPrice;
        }
      }
    } else {
      const aRes = assembled_products[line.product_id];
      if (!aRes) {
        warn(warnings, 'W_UNKNOWN_PRODUCT', `Assembled product "${line.product_id}" not found`, `${pPath}.product_id`);
      } else {
        unitCost = D(aRes.cost_each);
        const defaultPrice = aRes.my_price_each !== undefined && aRes.my_price_each !== null
          ? D(aRes.my_price_each)
          : D(aRes.price_each);
        unitPrice = line.price_override !== undefined && line.price_override !== null
          ? D(line.price_override)
          : defaultPrice;
      }
    }

    if (unitPrice.lt(unitCost)) {
      warn(warnings, 'W_PRICE_BELOW_COST', `Line ${idx + 1} unit price (${toNum(unitPrice).toFixed(2)}) is below unit cost (${toNum(unitCost).toFixed(2)})`, `${pPath}.price`);
    }

    const lineTotal = qty.mul(unitPrice);
    const lineCost = qty.mul(unitCost);

    subtotal = subtotal.add(lineTotal);
    costTotal = costTotal.add(lineCost);

    lineResults.push({
      product_kind: line.product_kind,
      product_id: line.product_id,
      quantity: line.quantity,
      unit: line.unit,
      price_override: line.price_override,
      unit_price: toNum(unitPrice),
      unit_cost: toNum(unitCost),
      line_total: toNum(lineTotal),
      line_cost: toNum(lineCost),
    });

    audit.push(
      step(
        `Line ${idx + 1}: ${line.product_id} (${line.quantity} ${line.unit}s)`,
        `qty × unit_price = ${toNum(qty)} × ${toNum(unitPrice).toFixed(2)}`,
        lineTotal
      )
    );
  });

  const delivery = D(Math.max(0, input.delivery ?? 0));
  // Available profit before discount = subtotal - costTotal
  const availableProfit = Decimal.max(0, subtotal.minus(costTotal));

  // Discount rule: capped to available profit (mirroring cake quote)
  const rawDiscount = D(Math.max(0, input.discount ?? 0));
  const effectiveDiscount = rawDiscount.gt(availableProfit) ? availableProfit : rawDiscount;
  const discountCapped = rawDiscount.gt(availableProfit) && rawDiscount.gt(0);

  if (discountCapped) {
    warn(
      warnings,
      'W_DISCOUNT_CAPPED',
      `Discount was capped from ${rawDiscount.toFixed(2)} to ${effectiveDiscount.toFixed(2)} (available profit)`,
      'discount'
    );
  }

  const totalPrice = subtotal.minus(effectiveDiscount).add(delivery);
  // Profit = subtotal - discount - costTotal (delivery is pass-through)
  const profit = subtotal.minus(effectiveDiscount).minus(costTotal);

  const priceExclDelivery = subtotal.minus(effectiveDiscount);
  const effectiveMargin = priceExclDelivery.gt(0)
    ? profit.div(priceExclDelivery)
    : D(0);

  audit.push(
    step('Subtotal', 'Σ line_total', subtotal),
    step('Cost total', 'Σ line_cost', costTotal),
    step('Delivery', 'user amount (pass-through)', delivery),
    step('Discount', `capped to profit (input: ${toNum(rawDiscount).toFixed(2)})`, effectiveDiscount),
    step('Total price', 'subtotal - discount + delivery', totalPrice),
    step('Profit', 'subtotal - discount - cost_total', profit),
    step('Effective margin', 'profit / (subtotal - discount)', effectiveMargin)
  );

  const roundingStep = data.settings.price_rounding_step;
  const suggestedPrice = roundingStep && roundingStep > 0
    ? roundPrice(totalPrice, roundingStep)
    : undefined;

  if (suggestedPrice !== undefined) {
    audit.push(step('Suggested price (display only)', `round(${toNum(totalPrice).toFixed(2)}, nearest ${roundingStep})`, suggestedPrice));
  }

  return {
    lines: lineResults,
    subtotal: toNum(subtotal),
    cost_total: toNum(costTotal),
    delivery: toNum(delivery),
    profit: toNum(profit),
    discount: toNum(effectiveDiscount),
    discount_capped: discountCapped,
    total_price: toNum(totalPrice),
    effective_margin: toNum(effectiveMargin),
    suggested_price: suggestedPrice,
    warnings,
    audit,
  };
}
