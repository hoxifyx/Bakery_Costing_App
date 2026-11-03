/**
 * Import / Export — §6 of the spec.
 * Validation, preview, CSV support, atomic application, blank template.
 */
import type {
  AppData,
  Settings,
  Ingredient,
  PackagingItem,
  Recipe,
  RecipeLine,
  Flavour,
  Filling,
  BatchProduct,
  AssembledProduct,
  SizeGuideEntry,
  SavedQuote,
  Customer,
  Order,
  OrderStatus,
  PriceHistoryEntry,
  NutritionPer100g,
  AllergenCode,
  Id,
} from '../engine/types';
import { DEFAULT_SETTINGS, DEFAULT_SIZE_GUIDE } from '../engine/types';

export const CURRENT_SCHEMA_VERSION = '1.6';
export const CURRENT_APP_VERSION = '1.6.1';
const FORMAT_FIELD = 'bakery-costing-data';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export interface ImportError {
  path: string;
  message: string;
}

export interface ImportPreview {
  valid: boolean;
  errors: ImportError[];
  warnings: string[];
  partialIngredients: number;
  counts: {
    settings: boolean;
    ingredients: { add: number; update: number; unchanged: number };
    packaging_items: { add: number; update: number; unchanged: number };
    recipes: { add: number; update: number; unchanged: number };
    flavours: { add: number; update: number; unchanged: number };
    fillings: { add: number; update: number; unchanged: number };
    batch_products: { add: number; update: number; unchanged: number };
    assembled_products: { add: number; update: number; unchanged: number };
    saved_quotes: { add: number; update: number; unchanged: number };
    customers: { add: number; update: number; unchanged: number };
    orders: { add: number; update: number; unchanged: number };
  };
  parsed: Partial<AppData>;
}

// ---------------------------------------------------------------------------
// ID pattern validation
// ---------------------------------------------------------------------------

const ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

function validateId(id: unknown, path: string, errors: ImportError[]): id is string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    errors.push({ path, message: `Invalid id: "${id}". Must match ^[a-z0-9_-]{1,64}$` });
    return false;
  }
  return true;
}

function requireNumber(v: unknown, path: string, errors: ImportError[], allowNeg = false): number {
  if (typeof v !== 'number' || !isFinite(v) || (!allowNeg && v < 0)) {
    errors.push({ path, message: `Expected a finite non-negative number, got ${v}` });
    return 0;
  }
  return v;
}

function requireString(v: unknown, path: string, errors: ImportError[]): string {
  if (typeof v !== 'string') {
    errors.push({ path, message: `Expected string, got ${typeof v}` });
    return '';
  }
  return v;
}

// ---------------------------------------------------------------------------
// Validators per entity
// ---------------------------------------------------------------------------

function validateSettings(raw: unknown, errors: ImportError[]): Settings {
  const s = (raw ?? {}) as Record<string, unknown>;
  const out: Settings = { ...DEFAULT_SETTINGS };
  const p = 'settings';
  if (s.currency_code !== undefined) out.currency_code = String(s.currency_code);
  if (s.labour_rate_per_hour !== undefined) out.labour_rate_per_hour = requireNumber(s.labour_rate_per_hour, `${p}.labour_rate_per_hour`, errors);
  if (s.overhead_pct !== undefined) out.overhead_pct = requireNumber(s.overhead_pct, `${p}.overhead_pct`, errors);
  if (s.target_margin !== undefined) {
    const m = requireNumber(s.target_margin, `${p}.target_margin`, errors);
    if (m >= 1) errors.push({ path: `${p}.target_margin`, message: 'target_margin must be < 1' });
    out.target_margin = Math.min(m, 0.9999);
  }
  if (s.packaging_allowance_pct !== undefined) out.packaging_allowance_pct = requireNumber(s.packaging_allowance_pct, `${p}.packaging_allowance_pct`, errors);
  if (s.topper_price !== undefined) out.topper_price = requireNumber(s.topper_price, `${p}.topper_price`, errors);
  if (s.cake_batches_per_kg !== undefined) out.cake_batches_per_kg = requireNumber(s.cake_batches_per_kg, `${p}.cake_batches_per_kg`, errors);
  if (s.frosting_batches_per_kg !== undefined) out.frosting_batches_per_kg = requireNumber(s.frosting_batches_per_kg, `${p}.frosting_batches_per_kg`, errors);
  if (s.filling_grams_per_kg !== undefined) out.filling_grams_per_kg = requireNumber(s.filling_grams_per_kg, `${p}.filling_grams_per_kg`, errors);
  out.fondant_ingredient_id = (s.fondant_ingredient_id as Id | null) ?? null;
  out.edible_print_item_id = (s.edible_print_item_id as Id | null) ?? null;
  out.cake_box_item_id = (s.cake_box_item_id as Id | null) ?? null;
  out.mdf_board_item_id = (s.mdf_board_item_id as Id | null) ?? null;
  out.standard_board_item_id = (s.standard_board_item_id as Id | null) ?? null;
  out.wallpaper_item_id = (s.wallpaper_item_id as Id | null) ?? null;
  if (s.price_rounding_step !== undefined) {
    out.price_rounding_step = requireNumber(s.price_rounding_step, `${p}.price_rounding_step`, errors);
  }
  return out;
}

function validateIngredient(raw: unknown, idx: number, errors: ImportError[]): Ingredient | null;
function validateIngredient(
  raw: unknown,
  idx: number,
  errors: ImportError[],
  allowPartial: true,
): Ingredient | Partial<Ingredient> | null;
function validateIngredient(
  raw: unknown,
  idx: number,
  errors: ImportError[],
  allowPartial: boolean,
): Ingredient | Partial<Ingredient> | null;
function validateIngredient(
  raw: unknown,
  idx: number,
  errors: ImportError[],
  allowPartial = false,
): Ingredient | Partial<Ingredient> | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `ingredients[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;
  const requiredFields = ['name', 'unit_type', 'pack_quantity', 'pack_price'] as const;
  const isPartial = requiredFields.some(field => r[field] === undefined);
  if (allowPartial && isPartial) {
    const partial: Partial<Ingredient> = { id: id as string };
    if (r.name !== undefined) partial.name = requireString(r.name, `${p}.name`, errors);

    if (r.unit_type !== undefined) {
      if (r.unit_type !== 'g' && r.unit_type !== 'piece') {
        errors.push({ path: `${p}.unit_type`, message: 'Must be "g" or "piece"' });
      } else {
        partial.unit_type = r.unit_type;
      }
    }

    if (r.pack_quantity !== undefined) {
      partial.pack_quantity = requireNumber(r.pack_quantity, `${p}.pack_quantity`, errors);
    }
    if (r.pack_price !== undefined) {
      partial.pack_price = requireNumber(r.pack_price, `${p}.pack_price`, errors);
    }

    if (r.piece_weight_g !== undefined) {
      partial.piece_weight_g = typeof r.piece_weight_g === 'number' ? r.piece_weight_g : null;
    }
    if (r.grams_per_tsp !== undefined) {
      partial.grams_per_tsp = typeof r.grams_per_tsp === 'number' ? r.grams_per_tsp : null;
    }
    if (r.notes !== undefined && typeof r.notes === 'string') partial.notes = r.notes;
    if (Array.isArray(r.price_history)) {
      partial.price_history = (r.price_history as unknown[]).map((h): PriceHistoryEntry => {
        const he = (h ?? {}) as Record<string, unknown>;
        return {
          date: typeof he.date === 'string' ? he.date : '',
          pack_quantity: typeof he.pack_quantity === 'number' ? he.pack_quantity : 0,
          pack_price: typeof he.pack_price === 'number' ? he.pack_price : 0,
          note: typeof he.note === 'string' ? he.note : undefined,
        };
      });
    }

    const parsedExtras = validateIngredientNutritionAndAllergens(r, p, errors);
    if (r.nutrition_per_100g !== undefined) partial.nutrition_per_100g = parsedExtras.nutrition_per_100g;
    if (r.allergens !== undefined) partial.allergens = parsedExtras.allergens;
    return partial;
  }

  const unitType = r.unit_type;
  if (unitType !== 'g' && unitType !== 'piece') {
    errors.push({ path: `${p}.unit_type`, message: `Must be "g" or "piece"` });
    return null;
  }
  const parsedExtras = validateIngredientNutritionAndAllergens(r, p, errors);
  return {
    id: id as string,
    name: requireString(r.name, `${p}.name`, errors),
    unit_type: unitType,
    pack_quantity: requireNumber(r.pack_quantity, `${p}.pack_quantity`, errors),
    pack_price: requireNumber(r.pack_price, `${p}.pack_price`, errors),
    piece_weight_g: typeof r.piece_weight_g === 'number' ? r.piece_weight_g : null,
    grams_per_tsp: typeof r.grams_per_tsp === 'number' ? r.grams_per_tsp : null,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    price_history: Array.isArray(r.price_history)
      ? (r.price_history as unknown[]).map((h): PriceHistoryEntry => {
          const he = (h ?? {}) as Record<string, unknown>;
          return {
            date: typeof he.date === 'string' ? he.date : '',
            pack_quantity: typeof he.pack_quantity === 'number' ? he.pack_quantity : 0,
            pack_price: typeof he.pack_price === 'number' ? he.pack_price : 0,
            note: typeof he.note === 'string' ? he.note : undefined,
          };
        })
      : undefined,
    nutrition_per_100g: parsedExtras.nutrition_per_100g,
    allergens: parsedExtras.allergens,
  };
}

function validateIngredientNutritionAndAllergens(
  r: Record<string, unknown>,
  p: string,
  errors: ImportError[],
): Pick<Ingredient, 'nutrition_per_100g' | 'allergens'> {
  let nutrition: NutritionPer100g | undefined;
  if (r.nutrition_per_100g !== undefined) {
    const rawNutrition = r.nutrition_per_100g;
    if (!rawNutrition || typeof rawNutrition !== 'object' || Array.isArray(rawNutrition)) {
      errors.push({ path: `${p}.nutrition_per_100g`, message: 'Expected a nutrition object' });
    } else {
      const values = rawNutrition as Record<string, unknown>;
      nutrition = {
        kcal: requireNumber(values.kcal, `${p}.nutrition_per_100g.kcal`, errors),
        protein_g: requireNumber(values.protein_g, `${p}.nutrition_per_100g.protein_g`, errors),
        fat_g: requireNumber(values.fat_g, `${p}.nutrition_per_100g.fat_g`, errors),
        carbs_g: requireNumber(values.carbs_g, `${p}.nutrition_per_100g.carbs_g`, errors),
        fibre_g: values.fibre_g === undefined ? undefined : requireNumber(values.fibre_g, `${p}.nutrition_per_100g.fibre_g`, errors),
        sodium_mg: values.sodium_mg === undefined ? undefined : requireNumber(values.sodium_mg, `${p}.nutrition_per_100g.sodium_mg`, errors),
      };
    }
  }
  let allergens: AllergenCode[] | undefined;
  if (r.allergens !== undefined) {
    if (!Array.isArray(r.allergens)) {
      errors.push({ path: `${p}.allergens`, message: 'Expected an array of allergen codes' });
    } else {
      const codes = new Set<AllergenCode>([
        'gluten', 'dairy', 'egg', 'soy', 'nuts', 'peanuts', 'sesame',
        'fish', 'shellfish', 'sulphites', 'celery', 'mustard', 'lupin', 'molluscs',
      ]);
      allergens = [];
      for (const [allergenIndex, value] of r.allergens.entries()) {
        if (typeof value !== 'string' || !codes.has(value as AllergenCode)) {
          errors.push({ path: `${p}.allergens[${allergenIndex}]`, message: `Unknown allergen code "${value}"` });
        } else if (!allergens.includes(value as AllergenCode)) {
          allergens.push(value as AllergenCode);
        }
      }
    }
  }
  return { nutrition_per_100g: nutrition, allergens };
}

function validatePackaging(raw: unknown, idx: number, errors: ImportError[]): PackagingItem | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `packaging_items[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;
  return {
    id: id as string,
    name: requireString(r.name, `${p}.name`, errors),
    price: requireNumber(r.price, `${p}.price`, errors),
    notes: typeof r.notes === 'string' ? r.notes : undefined,
  };
}

function validateRecipeLine(raw: unknown, recipeIdx: number, lineIdx: number, errors: ImportError[]): RecipeLine {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `recipes[${recipeIdx}].lines[${lineIdx}]`;
  const unit = r.unit;
  if (unit !== 'g' && unit !== 'piece' && unit !== 'tsp') {
    errors.push({ path: `${p}.unit`, message: 'Must be "g", "piece", or "tsp"' });
  }
  return {
    ingredient_id: typeof r.ingredient_id === 'string' ? r.ingredient_id : null,
    quantity: requireNumber(r.quantity, `${p}.quantity`, errors),
    unit: (unit as 'g' | 'piece' | 'tsp') ?? 'g',
    exclude_from_weight: r.exclude_from_weight === true,
    piece_weight_g_override: typeof r.piece_weight_g_override === 'number' ? r.piece_weight_g_override : null,
    label: typeof r.label === 'string' ? r.label : undefined,
  };
}

function validateRecipe(raw: unknown, idx: number, errors: ImportError[]): Recipe | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `recipes[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;
  const kind = r.kind;
  if (!['cake', 'frosting_filling', 'batch_product', 'other'].includes(kind as string)) {
    errors.push({ path: `${p}.kind`, message: 'Invalid kind' });
    return null;
  }
  const lines = Array.isArray(r.lines)
    ? r.lines.map((l, li) => validateRecipeLine(l, idx, li, errors))
    : [];
  return {
    id: id as string,
    name: requireString(r.name, `${p}.name`, errors),
    kind: kind as Recipe['kind'],
    lines,
    weight_adjustment_g: typeof r.weight_adjustment_g === 'number' ? r.weight_adjustment_g : 0,
    labour_hours: typeof r.labour_hours === 'number' && isFinite(r.labour_hours) && r.labour_hours >= 0
      ? r.labour_hours
      : undefined,
    waste_pct: r.waste_pct === undefined ? 0 : requireNumber(r.waste_pct, `${p}.waste_pct`, errors),
    notes: typeof r.notes === 'string' ? r.notes : undefined,
  };
}

function validateFlavour(raw: unknown, idx: number, errors: ImportError[]): Flavour | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `flavours[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;
  const cm = r.cost_model as Record<string, unknown>;
  let costModel: Flavour['cost_model'];
  if (cm?.type === 'recipe') {
    costModel = { type: 'recipe', cake_recipe_id: cm.cake_recipe_id as string, frosting_recipe_id: cm.frosting_recipe_id as string };
  } else if (cm?.type === 'average') {
    costModel = { type: 'average', of: Array.isArray(cm.of) ? cm.of as string[] : [] };
  } else {
    errors.push({ path: `${p}.cost_model.type`, message: 'Must be "recipe" or "average"' });
    return null;
  }
  return {
    id: id as string,
    name: requireString(r.name, `${p}.name`, errors),
    cost_model: costModel,
    addon_cost_per_kg: requireNumber(r.addon_cost_per_kg, `${p}.addon_cost_per_kg`, errors),
  };
}

function validateFilling(raw: unknown, idx: number, errors: ImportError[]): Filling | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `fillings[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;
  const src = r.source as Record<string, unknown>;
  let source: Filling['source'];
  if (src?.type === 'recipe') {
    source = { type: 'recipe', recipe_id: src.recipe_id as string };
  } else if (src?.type === 'ingredient') {
    source = { type: 'ingredient', ingredient_id: src.ingredient_id as string };
  } else {
    errors.push({ path: `${p}.source.type`, message: 'Must be "recipe" or "ingredient"' });
    return null;
  }
  return {
    id: id as string,
    name: requireString(r.name, `${p}.name`, errors),
    source,
  };
}

function validateBatchProduct(raw: unknown, idx: number, errors: ImportError[]): BatchProduct | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `batch_products[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;

  let overhead_pct: number | null | undefined;
  if (r.overhead_pct !== undefined && r.overhead_pct !== null) {
    overhead_pct = requireNumber(r.overhead_pct, `${p}.overhead_pct`, errors);
  } else if (r.overhead_pct === null) {
    overhead_pct = null;
  }

  let target_margin: number | null | undefined;
  if (r.target_margin !== undefined && r.target_margin !== null) {
    const tm = requireNumber(r.target_margin, `${p}.target_margin`, errors);
    if (tm >= 1) {
      errors.push({ path: `${p}.target_margin`, message: 'target_margin must be < 1' });
    }
    target_margin = tm;
  } else if (r.target_margin === null) {
    target_margin = null;
  }

  let labour_rate_per_hour: number | null | undefined;
  if (r.labour_rate_per_hour !== undefined && r.labour_rate_per_hour !== null) {
    labour_rate_per_hour = requireNumber(r.labour_rate_per_hour, `${p}.labour_rate_per_hour`, errors);
  } else if (r.labour_rate_per_hour === null) {
    labour_rate_per_hour = null;
  }

  let other_cost_per_piece: number | undefined;
  if (r.other_cost_per_piece !== undefined && r.other_cost_per_piece !== null) {
    other_cost_per_piece = requireNumber(r.other_cost_per_piece, `${p}.other_cost_per_piece`, errors);
  }

  let my_price_each: number | null | undefined;
  if (r.my_price_each !== undefined && r.my_price_each !== null) {
    my_price_each = requireNumber(r.my_price_each, `${p}.my_price_each`, errors);
  } else if (r.my_price_each === null) {
    my_price_each = null;
  }

  let my_price_box: number | null | undefined;
  if (r.my_price_box !== undefined && r.my_price_box !== null) {
    my_price_box = requireNumber(r.my_price_box, `${p}.my_price_box`, errors);
  } else if (r.my_price_box === null) {
    my_price_box = null;
  }

  return {
    id: id as string,
    name: requireString(r.name ?? (id as string), `${p}.name`, errors),
    recipe_id: String(r.recipe_id ?? ''),
    pieces_mode: r.pieces_mode === 'fixed' ? 'fixed' : 'by_weight',
    piece_weight_g: typeof r.piece_weight_g === 'number' ? r.piece_weight_g : undefined,
    fixed_pieces: typeof r.fixed_pieces === 'number' ? r.fixed_pieces : undefined,
    labour_hours_per_batch: requireNumber(r.labour_hours_per_batch, `${p}.labour_hours_per_batch`, errors),
    components: Array.isArray(r.components) ? r.components.map((c: Record<string, unknown>) => ({
      recipe_id: String(c.recipe_id),
      grams: requireNumber(c.grams, `${p}.components.grams`, errors),
    })) : [],
    box_id: typeof r.box_id === 'string' ? r.box_id : null,
    pieces_per_box: requireNumber(r.pieces_per_box, `${p}.pieces_per_box`, errors),
    show_each_including_box: r.show_each_including_box === true,
    overhead_pct,
    target_margin,
    labour_rate_per_hour,
    other_cost_per_piece,
    waste_pct: r.waste_pct === undefined ? 0 : requireNumber(r.waste_pct, `${p}.waste_pct`, errors),
    my_price_each,
    my_price_box,
  };
}

function validateAssembledProduct(raw: unknown, idx: number, errors: ImportError[]): AssembledProduct | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `assembled_products[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;

  let overhead_pct: number | null | undefined;
  if (r.overhead_pct !== undefined && r.overhead_pct !== null) {
    overhead_pct = requireNumber(r.overhead_pct, `${p}.overhead_pct`, errors);
  } else if (r.overhead_pct === null) {
    overhead_pct = null;
  }

  let target_margin: number | null | undefined;
  if (r.target_margin !== undefined && r.target_margin !== null) {
    const tm = requireNumber(r.target_margin, `${p}.target_margin`, errors);
    if (tm >= 1) {
      errors.push({ path: `${p}.target_margin`, message: 'target_margin must be < 1' });
    }
    target_margin = tm;
  } else if (r.target_margin === null) {
    target_margin = null;
  }

  let labour_rate_per_hour: number | null | undefined;
  if (r.labour_rate_per_hour !== undefined && r.labour_rate_per_hour !== null) {
    labour_rate_per_hour = requireNumber(r.labour_rate_per_hour, `${p}.labour_rate_per_hour`, errors);
  } else if (r.labour_rate_per_hour === null) {
    labour_rate_per_hour = null;
  }

  let other_cost_per_piece: number | undefined;
  if (r.other_cost_per_piece !== undefined && r.other_cost_per_piece !== null) {
    other_cost_per_piece = requireNumber(r.other_cost_per_piece, `${p}.other_cost_per_piece`, errors);
  }

  let my_price_each: number | null | undefined;
  if (r.my_price_each !== undefined && r.my_price_each !== null) {
    my_price_each = requireNumber(r.my_price_each, `${p}.my_price_each`, errors);
  } else if (r.my_price_each === null) {
    my_price_each = null;
  }

  const components = Array.isArray(r.components) ? r.components.map((c: Record<string, unknown>, ci: number) => {
    if (c.type === 'cake_recipe_grams') return { type: 'cake_recipe_grams' as const, recipe_id: String(c.recipe_id), grams: requireNumber(c.grams, `${p}.components[${ci}].grams`, errors) };
    if (c.type === 'recipe_per_gram') return { type: 'recipe_per_gram' as const, recipe_id: String(c.recipe_id), grams: requireNumber(c.grams, `${p}.components[${ci}].grams`, errors) };
    if (c.type === 'ingredient_grams') return { type: 'ingredient_grams' as const, ingredient_id: String(c.ingredient_id), grams: requireNumber(c.grams, `${p}.components[${ci}].grams`, errors) };
    errors.push({ path: `${p}.components[${ci}].type`, message: 'Invalid component type' });
    return { type: 'cake_recipe_grams' as const, recipe_id: '', grams: 0 };
  }) : [];

  return {
    id: id as string,
    name: requireString(r.name ?? (id as string), `${p}.name`, errors),
    components,
    labour_hours_per_batch: requireNumber(r.labour_hours_per_batch, `${p}.labour_hours_per_batch`, errors),
    pieces_per_batch: requireNumber(r.pieces_per_batch, `${p}.pieces_per_batch`, errors),
    box_id: typeof r.box_id === 'string' ? r.box_id : null,
    pieces_per_box: requireNumber(r.pieces_per_box, `${p}.pieces_per_box`, errors),
    overhead_pct,
    target_margin,
    labour_rate_per_hour,
    other_cost_per_piece,
    waste_pct: r.waste_pct === undefined ? 0 : requireNumber(r.waste_pct, `${p}.waste_pct`, errors),
    my_price_each,
  };
}

function validateSavedQuote(raw: unknown, idx: number, errors: ImportError[]): SavedQuote | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `saved_quotes[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;

  const kind = r.kind === 'products' ? 'products' : 'cake';

  const rawInput = (r.input ?? {}) as Record<string, unknown>;
  const tiers = Array.isArray(rawInput.tiers)
    ? rawInput.tiers.map((t: any) => {
        const tier: Record<string, unknown> = {
          size_kg: typeof t?.size_kg === 'number' && isFinite(t.size_kg) ? Math.max(0, t.size_kg) : 0,
        };
        if (t?.flavour_id !== undefined) tier.flavour_id = t.flavour_id;
        if (t?.filling_id !== undefined) tier.filling_id = t.filling_id;
        return tier as any;
      })
    : [];

  const rawDeco = (rawInput.decoration ?? {}) as Record<string, unknown>;
  const decoration: any = {
    fondant_kg: typeof rawDeco.fondant_kg === 'number' && isFinite(rawDeco.fondant_kg) ? Math.max(0, rawDeco.fondant_kg) : 0,
    prints: typeof rawDeco.prints === 'number' && isFinite(rawDeco.prints) ? Math.max(0, rawDeco.prints) : 0,
    flowers: typeof rawDeco.flowers === 'number' && isFinite(rawDeco.flowers) ? Math.max(0, rawDeco.flowers) : 0,
    toppers: typeof rawDeco.toppers === 'number' && isFinite(rawDeco.toppers) ? Math.max(0, rawDeco.toppers) : 0,
    time_hours: typeof rawDeco.time_hours === 'number' && isFinite(rawDeco.time_hours) ? Math.max(0, rawDeco.time_hours) : 0,
    others: typeof rawDeco.others === 'number' && isFinite(rawDeco.others) ? Math.max(0, rawDeco.others) : 0,
    delivery: typeof rawDeco.delivery === 'number' && isFinite(rawDeco.delivery) ? Math.max(0, rawDeco.delivery) : 0,
  };
  if (rawDeco.discount !== undefined) {
    decoration.discount = typeof rawDeco.discount === 'number' && isFinite(rawDeco.discount) ? Math.max(0, rawDeco.discount) : 0;
  }

  let product_quote_input: any = undefined;
  if (r.product_quote_input && typeof r.product_quote_input === 'object') {
    const pqi = r.product_quote_input as Record<string, unknown>;
    const lines = Array.isArray(pqi.lines)
      ? pqi.lines.map((l: any, li: number) => ({
          product_kind: l?.product_kind === 'assembled' ? ('assembled' as const) : ('batch' as const),
          product_id: String(l?.product_id ?? ''),
          quantity: requireNumber(l?.quantity, `${p}.product_quote_input.lines[${li}].quantity`, errors),
          unit: l?.unit === 'box' ? ('box' as const) : ('piece' as const),
          price_override: typeof l?.price_override === 'number' ? l.price_override : null,
        }))
      : [];
    product_quote_input = {
      lines,
      delivery: requireNumber(pqi.delivery ?? 0, `${p}.product_quote_input.delivery`, errors),
      discount: typeof pqi.discount === 'number' ? pqi.discount : 0,
    };
  }

  return {
    id: id as string,
    name: requireString(r.name ?? `Quote ${idx + 1}`, `${p}.name`, errors),
    created_at: typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : undefined,
    kind,
    input: { tiers, decoration },
    product_quote_input,
    result_snapshot: r.result_snapshot ?? null,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
  };
}

function validateCustomer(raw: unknown, idx: number, errors: ImportError[]): Customer | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `customers[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;
  return {
    id: id as string,
    name: requireString(r.name, `${p}.name`, errors),
    phone: typeof r.phone === 'string' ? r.phone : undefined,
    email: typeof r.email === 'string' ? r.email : undefined,
    address: typeof r.address === 'string' ? r.address : undefined,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
  };
}

function validateOrder(raw: unknown, idx: number, errors: ImportError[]): Order | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = `orders[${idx}]`;
  const id = r.id;
  if (!validateId(id, `${p}.id`, errors)) return null;
  const status = r.status;
  if (!['Draft', 'Confirmed', 'Delivered', 'Cancelled'].includes(status as string)) {
    errors.push({ path: `${p}.status`, message: 'Invalid status' });
    return null;
  }
  return {
    id: id as string,
    customer_id: typeof r.customer_id === 'string' ? r.customer_id : null,
    quote_id: typeof r.quote_id === 'string' ? r.quote_id : null,
    order_date: typeof r.order_date === 'string' ? r.order_date : undefined,
    due_date: typeof r.due_date === 'string' ? r.due_date : undefined,
    status: status as OrderStatus,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
  };
}

// ---------------------------------------------------------------------------
// Reference integrity check
// ---------------------------------------------------------------------------

function checkReferences(data: AppData, errors: ImportError[]): void {
  const ingIds = new Set(data.ingredients.map(i => i.id));
  const packIds = new Set(data.packaging_items.map(p => p.id));
  const recipeIds = new Set(data.recipes.map(r => r.id));
  const flavourIds = new Set(data.flavours.map(f => f.id));

  for (const recipe of data.recipes) {
    for (const [li, line] of recipe.lines.entries()) {
      if (line.ingredient_id && !ingIds.has(line.ingredient_id)) {
        errors.push({ path: `recipe[${recipe.id}].lines[${li}].ingredient_id`, message: `Ingredient "${line.ingredient_id}" not found` });
      }
    }
  }
  for (const flavour of data.flavours) {
    if (flavour.cost_model.type === 'recipe') {
      if (!recipeIds.has(flavour.cost_model.cake_recipe_id)) {
        errors.push({ path: `flavour[${flavour.id}].cost_model.cake_recipe_id`, message: `Recipe not found` });
      }
      if (!recipeIds.has(flavour.cost_model.frosting_recipe_id)) {
        errors.push({ path: `flavour[${flavour.id}].cost_model.frosting_recipe_id`, message: `Recipe not found` });
      }
    } else {
      for (const ref of flavour.cost_model.of) {
        if (!flavourIds.has(ref)) {
          errors.push({ path: `flavour[${flavour.id}].cost_model.of`, message: `Flavour "${ref}" not found` });
        }
      }
    }
  }
  for (const filling of data.fillings) {
    if (filling.source.type === 'recipe' && !recipeIds.has(filling.source.recipe_id)) {
      errors.push({ path: `filling[${filling.id}].source.recipe_id`, message: `Recipe not found` });
    }
    if (filling.source.type === 'ingredient' && !ingIds.has(filling.source.ingredient_id)) {
      errors.push({ path: `filling[${filling.id}].source.ingredient_id`, message: `Ingredient not found` });
    }
  }
  for (const bp of data.batch_products) {
    if (!recipeIds.has(bp.recipe_id)) {
      errors.push({ path: `batch_product[${bp.id}].recipe_id`, message: `Recipe not found` });
    }
    if (bp.box_id && !packIds.has(bp.box_id)) {
      errors.push({ path: `batch_product[${bp.id}].box_id`, message: `Packaging not found` });
    }
  }
  for (const ap of data.assembled_products) {
    if (ap.box_id && !packIds.has(ap.box_id)) {
      errors.push({ path: `assembled_product[${ap.id}].box_id`, message: `Packaging not found` });
    }
    for (const comp of ap.components) {
      if ((comp.type === 'cake_recipe_grams' || comp.type === 'recipe_per_gram') && !recipeIds.has(comp.recipe_id)) {
        errors.push({ path: `assembled_product[${ap.id}].components`, message: `Recipe not found` });
      }
      if (comp.type === 'ingredient_grams' && !ingIds.has(comp.ingredient_id)) {
        errors.push({ path: `assembled_product[${ap.id}].components`, message: `Ingredient not found` });
      }
    }
  }
  const customerIds = new Set((data.customers ?? []).map(c => c.id));
  const quoteIds = new Set((data.saved_quotes ?? []).map(q => q.id));
  for (const o of (data.orders ?? [])) {
    if (o.customer_id && !customerIds.has(o.customer_id)) {
      errors.push({ path: `order[${o.id}].customer_id`, message: `Customer not found` });
    }
    if (o.quote_id && !quoteIds.has(o.quote_id)) {
      errors.push({ path: `order[${o.id}].quote_id`, message: `Quote not found` });
    }
  }
}

// ---------------------------------------------------------------------------
// Count helper
// ---------------------------------------------------------------------------

function countChanges<T extends { id: Id }>(existing?: T[], incoming?: T[], forcedUpdates?: Set<Id>) {
  const safeExisting = existing ?? [];
  const safeIncoming = incoming ?? [];
  const existingMap = new Map(safeExisting.map(x => [x.id, x]));
  let add = 0, update = 0, unchanged = 0;
  for (const item of safeIncoming) {
    if (!existingMap.has(item.id)) add++;
    else if (forcedUpdates?.has(item.id) || JSON.stringify(existingMap.get(item.id)) !== JSON.stringify(item)) update++;
    else unchanged++;
  }
  return { add, update, unchanged };
}

// ---------------------------------------------------------------------------
// Parse and validate import
// ---------------------------------------------------------------------------

export function parseImportFile(
  content: string,
  currentData: AppData,
  opts: { allowPartialIngredients?: boolean } = {},
): ImportPreview {
  const errors: ImportError[] = [];
  const warnings: string[] = [];
  let raw: Record<string, unknown>;

  try {
    raw = JSON.parse(content);
  } catch {
    return {
      valid: false,
      errors: [{ path: 'file', message: 'Invalid JSON' }],
      warnings: [],
      partialIngredients: 0,
      counts: emptyPreviewCounts(),
      parsed: {},
    };
  }

  if (raw.format !== FORMAT_FIELD) {
    errors.push({ path: 'format', message: `Expected "${FORMAT_FIELD}", got "${raw.format}"` });
  }

  const sv = String(raw.schema_version ?? '');
  const majorVersion = parseInt(sv.split('.')[0] ?? '0');
  const currentMajor = parseInt(CURRENT_SCHEMA_VERSION.split('.')[0]);
  if (majorVersion > currentMajor) {
    return {
      valid: false,
      errors: [{ path: 'schema_version', message: `Schema version ${sv} is newer than supported (${CURRENT_SCHEMA_VERSION})` }],
      warnings: [],
      partialIngredients: 0,
      counts: emptyPreviewCounts(),
      parsed: {},
    };
  }

  const parsed: Partial<AppData> = {};
  const partialIds = new Set<string>();

  if (raw.settings !== undefined) {
    parsed.settings = validateSettings(raw.settings, errors);
  }
  if (Array.isArray(raw.ingredients)) {
    const ingredients: Ingredient[] = [];
    for (const [i, rawIngredient] of raw.ingredients.entries()) {
      const errorCountBefore = errors.length;
      const validated = validateIngredient(rawIngredient, i, errors, opts.allowPartialIngredients === true);
      if (!validated) continue;
      const validatedId = validated.id;
      if (typeof validatedId !== 'string') continue;

      const rawRecord = (rawIngredient ?? {}) as Record<string, unknown>;
      const isPartial = opts.allowPartialIngredients === true
        && (['name', 'unit_type', 'pack_quantity', 'pack_price'] as const).some(field => rawRecord[field] === undefined);
      if (!isPartial) {
        ingredients.push(validated as Ingredient);
        continue;
      }

      if (errors.length !== errorCountBefore) continue;
      const existing = currentData.ingredients.find(item => item.id === validatedId);
      if (!existing) {
        errors.push({
          path: `ingredients[${i}].id`,
          message: `Partial ingredient '${validated.id}' cannot be added — merge into an existing record or supply all required fields.`,
        });
        continue;
      }

      const mergedErrors: ImportError[] = [];
      const merged = validateIngredient({ ...existing, ...validated }, i, mergedErrors);
      if (mergedErrors.length > 0) errors.push(...mergedErrors);
      else if (merged) {
        ingredients.push(merged);
        partialIds.add(validatedId);
      }
    }
    parsed.ingredients = ingredients;
  }
  if (Array.isArray(raw.packaging_items)) {
    parsed.packaging_items = raw.packaging_items.map((x, i) => validatePackaging(x, i, errors)).filter(Boolean) as PackagingItem[];
  }
  if (Array.isArray(raw.recipes)) {
    parsed.recipes = raw.recipes.map((x, i) => validateRecipe(x, i, errors)).filter(Boolean) as Recipe[];
  }
  if (Array.isArray(raw.flavours)) {
    parsed.flavours = raw.flavours.map((x, i) => validateFlavour(x, i, errors)).filter(Boolean) as Flavour[];
  }
  if (Array.isArray(raw.fillings)) {
    parsed.fillings = raw.fillings.map((x, i) => validateFilling(x, i, errors)).filter(Boolean) as Filling[];
  }
  if (Array.isArray(raw.batch_products)) {
    parsed.batch_products = raw.batch_products.map((x, i) => validateBatchProduct(x, i, errors)).filter(Boolean) as BatchProduct[];
  }
  if (Array.isArray(raw.assembled_products)) {
    parsed.assembled_products = raw.assembled_products.map((x, i) => validateAssembledProduct(x, i, errors)).filter(Boolean) as AssembledProduct[];
  }
  if (Array.isArray(raw.size_guide)) {
    parsed.size_guide = raw.size_guide as SizeGuideEntry[];
  }
  if (Array.isArray(raw.saved_quotes)) {
    parsed.saved_quotes = raw.saved_quotes.map((x, i) => validateSavedQuote(x, i, errors)).filter(Boolean) as SavedQuote[];
  }
  if (sv === '1.0') {
    parsed.customers = [];
    parsed.orders = [];
  } else {
    if (Array.isArray(raw.customers)) {
      parsed.customers = raw.customers.map((x, i) => validateCustomer(x, i, errors)).filter(Boolean) as Customer[];
    }
    if (Array.isArray(raw.orders)) {
      parsed.orders = raw.orders.map((x, i) => validateOrder(x, i, errors)).filter(Boolean) as Order[];
    }
  }

  // Reference integrity check on merged data
  if (errors.length === 0) {
    const mergedIngredients = opts.allowPartialIngredients && parsed.ingredients
      ? Array.from(new Map(
          [...currentData.ingredients, ...parsed.ingredients].map(ingredient => [ingredient.id, ingredient]),
        ).values())
      : undefined;
    const merged: AppData = {
      ...currentData,
      ...parsed,
      ...(mergedIngredients ? { ingredients: mergedIngredients } : {}),
    };
    checkReferences(merged, errors);
  }

  const counts = {
    settings: !!parsed.settings,
    ingredients: countChanges(currentData.ingredients, parsed.ingredients ?? [], partialIds),
    packaging_items: countChanges(currentData.packaging_items, parsed.packaging_items ?? []),
    recipes: countChanges(currentData.recipes, parsed.recipes ?? []),
    flavours: countChanges(currentData.flavours, parsed.flavours ?? []),
    fillings: countChanges(currentData.fillings, parsed.fillings ?? []),
    batch_products: countChanges(currentData.batch_products, parsed.batch_products ?? []),
    assembled_products: countChanges(currentData.assembled_products, parsed.assembled_products ?? []),
    saved_quotes: countChanges(currentData.saved_quotes, parsed.saved_quotes ?? []),
    customers: countChanges(currentData.customers, parsed.customers ?? []),
    orders: countChanges(currentData.orders, parsed.orders ?? []),
  };

  return { valid: errors.length === 0, errors, warnings, partialIngredients: partialIds.size, counts, parsed };
}

function emptyPreviewCounts() {
  return {
    settings: false,
    ingredients: { add: 0, update: 0, unchanged: 0 },
    packaging_items: { add: 0, update: 0, unchanged: 0 },
    recipes: { add: 0, update: 0, unchanged: 0 },
    flavours: { add: 0, update: 0, unchanged: 0 },
    fillings: { add: 0, update: 0, unchanged: 0 },
    batch_products: { add: 0, update: 0, unchanged: 0 },
    assembled_products: { add: 0, update: 0, unchanged: 0 },
    saved_quotes: { add: 0, update: 0, unchanged: 0 },
    customers: { add: 0, update: 0, unchanged: 0 },
    orders: { add: 0, update: 0, unchanged: 0 },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportAllData(data: AppData, appVersion = CURRENT_APP_VERSION): string {
  const payload = {
    format: FORMAT_FIELD,
    schema_version: CURRENT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    app_version: appVersion,
    settings: data.settings,
    ingredients: data.ingredients,
    packaging_items: data.packaging_items,
    recipes: data.recipes,
    flavours: data.flavours,
    fillings: data.fillings,
    batch_products: data.batch_products,
    assembled_products: data.assembled_products,
    size_guide: data.size_guide,
    saved_quotes: data.saved_quotes,
    customers: data.customers,
    orders: data.orders,
  };
  return JSON.stringify(payload, null, 1);
}

export function downloadJSON(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBlankTemplate(): void {
  const template = {
    format: FORMAT_FIELD,
    schema_version: CURRENT_SCHEMA_VERSION,
    exported_at: '',
    app_version: '',
    settings: { ...DEFAULT_SETTINGS },
    ingredients: [],
    packaging_items: [],
    recipes: [],
    flavours: [],
    fillings: [],
    batch_products: [],
    assembled_products: [],
    size_guide: DEFAULT_SIZE_GUIDE,
    saved_quotes: [],
    customers: [],
    orders: [],
  };
  downloadJSON(JSON.stringify(template, null, 1), 'bakery-costing-template.json');
}

export function getExportFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const mo = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const mi = pad(now.getMinutes());
  return `bakery-costing-export-${y}${mo}${d}-${h}${mi}.json`;
}

export const MAX_IMPORT_SIZE = MAX_FILE_SIZE;

// ---------------------------------------------------------------------------
// CSV export/import
// ---------------------------------------------------------------------------

export function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvEscape).join(',');
}

export function exportIngredientsCSV(ingredients: Ingredient[]): string {
  const header = 'id,name,unit_type,pack_quantity,pack_price,piece_weight_g,grams_per_tsp,notes';
  const rows = ingredients.map(i => csvRow([
    i.id, i.name, i.unit_type, i.pack_quantity, i.pack_price,
    i.piece_weight_g ?? '', i.grams_per_tsp ?? '', i.notes ?? '',
  ]));
  return [header, ...rows].join('\n');
}

export function exportPackagingCSV(items: PackagingItem[]): string {
  const header = 'id,name,price,notes';
  const rows = items.map(i => csvRow([i.id, i.name, i.price, i.notes ?? '']));
  return [header, ...rows].join('\n');
}

export function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => obj[h] = cells[i] ?? '');
    return obj;
  });
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64) || 'item_' + Date.now();
}

export function importIngredientsCSV(
  content: string,
  existing: Ingredient[],
  pricesOnly = false
): { items: Ingredient[]; errors: string[] } {
  const rows = parseCSV(content);
  const errors: string[] = [];
  const existingById = new Map(existing.map(i => [i.id, i]));
  const existingByName = new Map(existing.map(i => [i.name.toLowerCase(), i]));
  const result: Ingredient[] = [...existing];
  const resultMap = new Map(result.map((i, idx) => [i.id, idx]));

  for (const [ri, row] of rows.entries()) {
    const numericFields = ['pack_quantity', 'pack_price', 'piece_weight_g', 'grams_per_tsp'] as const;
    const numericValues: Partial<Record<typeof numericFields[number], number>> = {};
    let hasInvalidNumber = false;
    for (const field of numericFields) {
      const rawValue = row[field]?.trim();
      if (!rawValue) continue;
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`Row ${ri + 2}: ${field} must be a finite non-negative number`);
        hasInvalidNumber = true;
      } else {
        numericValues[field] = value;
      }
    }
    if (hasInvalidNumber) continue;

    let existing_item: Ingredient | undefined;
    if (row.id && existingById.has(row.id)) {
      existing_item = existingById.get(row.id);
    } else if (row.name && existingByName.has(row.name.toLowerCase())) {
      existing_item = existingByName.get(row.name.toLowerCase());
    }

    if (pricesOnly) {
      if (!existing_item) { errors.push(`Row ${ri + 2}: item not found for prices-only update`); continue; }
      const idx = resultMap.get(existing_item.id)!;
      result[idx] = {
        ...result[idx],
        pack_quantity: numericValues.pack_quantity ?? result[idx].pack_quantity,
        pack_price: numericValues.pack_price ?? result[idx].pack_price,
      };
    } else {
      if (existing_item) {
        const idx = resultMap.get(existing_item.id)!;
        result[idx] = {
          ...result[idx],
          name: row.name || result[idx].name,
          unit_type: (row.unit_type === 'g' || row.unit_type === 'piece') ? row.unit_type : result[idx].unit_type,
          pack_quantity: numericValues.pack_quantity ?? result[idx].pack_quantity,
          pack_price: numericValues.pack_price ?? result[idx].pack_price,
          piece_weight_g: numericValues.piece_weight_g ?? result[idx].piece_weight_g,
          grams_per_tsp: numericValues.grams_per_tsp ?? result[idx].grams_per_tsp,
          notes: row.notes || result[idx].notes,
        };
      } else {
        const newId = row.id && ID_PATTERN.test(row.id) ? row.id : slugify(row.name || 'ingredient');
        const newItem: Ingredient = {
          id: newId,
          name: row.name || newId,
          unit_type: (row.unit_type === 'g' || row.unit_type === 'piece') ? row.unit_type : 'g',
          pack_quantity: numericValues.pack_quantity ?? 0,
          pack_price: numericValues.pack_price ?? 0,
          piece_weight_g: numericValues.piece_weight_g ?? null,
          grams_per_tsp: numericValues.grams_per_tsp ?? null,
          notes: row.notes || undefined,
        };
        result.push(newItem);
        resultMap.set(newId, result.length - 1);
      }
    }
  }
  return { items: result, errors };
}
