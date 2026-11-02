// ============================================================
// Data model types — §3 of the spec
// ============================================================

export type Id = string;

export interface Settings {
  currency_code: string;
  labour_rate_per_hour: number;
  overhead_pct: number;          // fraction, e.g. 0.25
  target_margin: number;         // fraction of selling price, e.g. 0.30
  packaging_allowance_pct: number;
  topper_price: number;
  cake_batches_per_kg: number;
  frosting_batches_per_kg: number;
  filling_grams_per_kg: number;
  fondant_ingredient_id: Id | null;
  edible_print_item_id: Id | null;
  cake_box_item_id: Id | null;
  mdf_board_item_id: Id | null;
  standard_board_item_id: Id | null;
  wallpaper_item_id: Id | null;
  price_rounding_step?: number;
}

export interface PriceHistoryEntry {
  date: string;          // ISO date string e.g. '2026-10-07'
  pack_quantity: number;
  pack_price: number;
  note?: string;
}

export interface NutritionPer100g {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fibre_g?: number;
  sodium_mg?: number;
}

export type AllergenCode =
  | 'gluten'
  | 'dairy'
  | 'egg'
  | 'soy'
  | 'nuts'
  | 'peanuts'
  | 'sesame'
  | 'fish'
  | 'shellfish'
  | 'sulphites'
  | 'celery'
  | 'mustard'
  | 'lupin'
  | 'molluscs';

export interface Ingredient {
  id: Id;
  name: string;
  unit_type: 'g' | 'piece';
  pack_quantity: number;
  pack_price: number;
  piece_weight_g?: number | null;
  grams_per_tsp?: number | null;
  notes?: string;
  price_history?: PriceHistoryEntry[];
  nutrition_per_100g?: NutritionPer100g;
  allergens?: AllergenCode[];
}

export interface PackagingItem {
  id: Id;
  name: string;
  price: number;
  notes?: string;
}

export type LineUnit = 'g' | 'piece' | 'tsp';

export interface RecipeLine {
  ingredient_id: Id | null;
  quantity: number;
  unit: LineUnit;
  exclude_from_weight?: boolean;
  piece_weight_g_override?: number | null;
  label?: string;
}

export type RecipeKind = 'cake' | 'frosting_filling' | 'batch_product' | 'other';

export interface Recipe {
  id: Id;
  name: string;
  kind: RecipeKind;
  lines: RecipeLine[];
  weight_adjustment_g: number;
  labour_hours?: number; // hands-on labour hours per batch; default 0; informational only
  waste_pct?: number;
  notes?: string;
}

export type FlavourCostModel =
  | { type: 'recipe'; cake_recipe_id: Id; frosting_recipe_id: Id }
  | { type: 'average'; of: Id[] };

export interface Flavour {
  id: Id;
  name: string;
  cost_model: FlavourCostModel;
  addon_cost_per_kg: number;
}

export type FillingSource =
  | { type: 'recipe'; recipe_id: Id }
  | { type: 'ingredient'; ingredient_id: Id };

export interface Filling {
  id: Id;
  name: string;
  source: FillingSource;
}

export interface BatchProduct {
  id: Id;
  name: string;
  recipe_id: Id;
  pieces_mode: 'by_weight' | 'fixed';
  piece_weight_g?: number;
  fixed_pieces?: number;
  labour_hours_per_batch: number;
  components: { recipe_id: Id; grams: number }[];
  box_id: Id | null;
  pieces_per_box: number;
  show_each_including_box: boolean;
  /** Overrides global overhead for labour and base recipe cost. Recipe components already include global overhead via per_gram_cwo and are not re-overhead-ed. */
  overhead_pct?: number | null;
  /** Overrides the global target margin. Recipe components already include global overhead via per_gram_cwo and are not re-overhead-ed. */
  target_margin?: number | null;
  /** Overrides the global labour rate. Recipe components already include global overhead via per_gram_cwo and are not re-overhead-ed. */
  labour_rate_per_hour?: number | null;
  other_cost_per_piece?: number;
  waste_pct?: number;
  my_price_each?: number | null;
  my_price_box?: number | null;
}

export type AssembledComponent =
  | { type: 'cake_recipe_grams'; recipe_id: Id; grams: number }
  | { type: 'recipe_per_gram'; recipe_id: Id; grams: number }
  | { type: 'ingredient_grams'; ingredient_id: Id; grams: number };

export interface AssembledProduct {
  id: Id;
  name: string;
  components: AssembledComponent[];
  labour_hours_per_batch: number;
  pieces_per_batch: number;
  box_id: Id | null;
  pieces_per_box: number;
  /** Overrides global overhead for labour and base recipe cost. Recipe components already include global overhead via per_gram_cwo and are not re-overhead-ed. */
  overhead_pct?: number | null;
  /** Overrides the global target margin. Recipe components already include global overhead via per_gram_cwo and are not re-overhead-ed. */
  target_margin?: number | null;
  /** Overrides the global labour rate. Recipe components already include global overhead via per_gram_cwo and are not re-overhead-ed. */
  labour_rate_per_hour?: number | null;
  other_cost_per_piece?: number;
  waste_pct?: number;
  my_price_each?: number | null;
}

export interface TierInput {
  size_kg: number;
  flavour_id?: Id | null;
  filling_id?: Id | null;
}

export interface DecorationInput {
  fondant_kg: number;
  prints: number;
  flowers: number;
  toppers: number;
  time_hours: number;
  others: number;
  delivery: number;
  discount?: number; // money amount; capped to available profit; 0/undefined = no discount
}

export interface QuoteInput {
  tiers: TierInput[];  // exactly 6 slots
  decoration: DecorationInput;
}

export interface ProductQuoteLine {
  product_kind: 'batch' | 'assembled';
  product_id: string;
  quantity: number;                 // pieces, or boxes when unit = 'box'
  unit: 'piece' | 'box';            // 'box' only for batch products
  price_override?: number | null;   // per unit, this line only
}

export interface ProductQuoteInput {
  lines: ProductQuoteLine[];
  delivery: number;
  discount?: number;
}

export interface ProductQuoteLineResult {
  product_kind: 'batch' | 'assembled';
  product_id: string;
  quantity: number;
  unit: 'piece' | 'box';
  price_override?: number | null;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  line_cost: number;
}

export interface ProductQuoteResult {
  lines: ProductQuoteLineResult[];
  subtotal: number;
  cost_total: number;
  delivery: number;
  profit: number;
  discount: number;
  discount_capped: boolean;
  total_price: number;
  effective_margin: number;
  suggested_price?: number;
  warnings: Warning[];
  audit: AuditStep[];
}

export interface SizeGuideEntry {
  label: string;
  kg: number;
  servings: number;
}

export interface SavedQuote {
  id: Id;
  name: string;
  created_at: string;
  updated_at?: string;
  kind?: 'cake' | 'products';
  input: QuoteInput;
  product_quote_input?: ProductQuoteInput;
  result_snapshot: unknown;
  notes?: string;
}

export interface Customer {
  id: Id;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export type OrderStatus = 'Draft' | 'Confirmed' | 'Delivered' | 'Cancelled';

export interface Order {
  id: Id;
  customer_id: Id | null;
  quote_id: Id | null;
  order_date?: string;
  due_date?: string;
  status: OrderStatus;
  notes?: string;
}

// ============================================================
// Engine result types
// ============================================================

export type WarningCode =
  | 'W_UNPRICED_INGREDIENT'
  | 'W_TSP_UNCONVERTED'
  | 'W_ZERO_WEIGHT_RECIPE'
  | 'W_ZERO_PIECES'
  | 'W_ZERO_PACK_SIZE'
  | 'W_TIER_NO_FLAVOUR'
  | 'W_TIER_NO_FILLING'
  | 'W_TIER_NO_SIZE'
  | 'W_UNKNOWN_FLAVOUR'
  | 'W_UNKNOWN_FILLING'
  | 'W_NO_TIME_HOURS'
  | 'W_NO_LABOUR_HOURS'
  | 'W_ADDON_ZERO'
  | 'W_ROLE_NOT_SET'
  | 'W_DISCOUNT_CAPPED'
  | 'W_ORDER_WITHOUT_QUOTE'
  | 'W_ORDER_PAST_DUE'
  | 'W_PRICE_BELOW_COST'
  | 'W_PRICE_BELOW_TARGET'
  | 'W_UNKNOWN_PRODUCT'
  | 'W_ZERO_QUANTITY'
  | 'W_WASTE_HIGH'
  | 'W_ALLERGEN_UNKNOWN'
  | 'W_NUTRITION_PARTIAL';

export interface Warning {
  code: WarningCode;
  context: string;  // human-readable detail
  path?: string;    // e.g. "recipes[2].lines[0]"
}

export interface AuditStep {
  label: string;
  formula: string;
  value: number;
  children?: AuditStep[];
}

export interface RecipeResult {
  raw: number;
  raw_after_waste: number;
  cwo: number;
  weight: number;
  per_gram_cwo: number;
  cake_cost_per_kg: number;
  frosting_cost_per_kg_cake: number;
  warnings: Warning[];
  audit: AuditStep[];
}

export interface FlavourResult {
  base: number;
  price_per_kg: number;
  warnings: Warning[];
  audit: AuditStep[];
}

export interface FillingResult {
  cost_per_kg: number;
  warnings: Warning[];
  audit: AuditStep[];
}

export interface BatchProductResult {
  pieces: number;
  raw_cost_per_piece: number;
  waste_added: number;
  unit_cost: number;
  cost_each_excl_box: number;
  cost_each_incl_box: number;
  cost_each: number;
  cost_box: number;
  each_including_box: number;
  each_excluding_box: number;
  box_price: number;
  headline_each: number;
  suggested_headline_each?: number;
  my_price_each?: number | null;
  my_price_box?: number | null;
  profit_each?: number;
  margin_each?: number;
  profit_box?: number;
  margin_box?: number;
  price_in_use_each: number;
  warnings: Warning[];
  audit: AuditStep[];
}

export interface AssembledProductResult {
  unit_cost: number;
  waste_added: number;
  labour_piece: number;
  box_piece: number;
  cost_each: number;
  price_each: number;
  suggested_price_each?: number;
  my_price_each?: number | null;
  profit_each?: number;
  margin_each?: number;
  price_in_use_each: number;
  warnings: Warning[];
  audit: AuditStep[];
}

export interface QuoteResult {
  tier_cost: number;
  tiers_used: number;
  decoration_sum: number;
  fondant: number;
  print: number;
  flowers: number;
  topper: number;
  time: number;
  others: number;
  delivery: number;
  overhead: number;
  packaging: number;
  total_cost: number;
  profit: number;
  discount: number;           // effective discount (after cap), always >= 0
  discount_capped: boolean;   // true when input exceeded available profit
  total_price: number;        // total_price = total_cost + profit - discount
  suggested_price?: number;   // display-only suggested rounded price
  margin_check: number;       // effective margin after discount
  tier_details: { flavour_part: number; filling_part: number }[];
  warnings: Warning[];
  audit: AuditStep[];
}

export interface EngineResult {
  recipes: Record<Id, RecipeResult>;
  flavours: Record<Id, FlavourResult>;
  fillings: Record<Id, FillingResult>;
  batch_products: Record<Id, BatchProductResult>;
  assembled_products: Record<Id, AssembledProductResult>;
  quote: QuoteResult | null;
  all_warnings: Warning[];
}

// ============================================================
// Full data store type
// ============================================================

export interface AppData {
  settings: Settings;
  ingredients: Ingredient[];
  packaging_items: PackagingItem[];
  recipes: Recipe[];
  flavours: Flavour[];
  fillings: Filling[];
  batch_products: BatchProduct[];
  assembled_products: AssembledProduct[];
  size_guide: SizeGuideEntry[];
  saved_quotes: SavedQuote[];
  customers: Customer[];
  orders: Order[];
}

export const DEFAULT_SETTINGS: Settings = {
  currency_code: 'BDT',
  labour_rate_per_hour: 400,
  overhead_pct: 0.25,
  target_margin: 0.30,
  packaging_allowance_pct: 0.20,
  topper_price: 350,
  cake_batches_per_kg: 1,
  frosting_batches_per_kg: 1.25,
  filling_grams_per_kg: 150,
  fondant_ingredient_id: null,
  edible_print_item_id: null,
  cake_box_item_id: null,
  mdf_board_item_id: null,
  standard_board_item_id: null,
  wallpaper_item_id: null,
  price_rounding_step: 0,
};

export const DEFAULT_SIZE_GUIDE: SizeGuideEntry[] = [
  { label: '5"', kg: 0.7, servings: 10 },
  { label: '6"', kg: 1, servings: 15 },
  { label: '7"', kg: 1.5, servings: 20 },
  { label: '8"', kg: 2, servings: 30 },
  { label: '9"', kg: 2.5, servings: 38 },
  { label: '10"', kg: 3, servings: 45 },
  { label: '11"', kg: 3.5, servings: 52 },
  { label: '12"', kg: 4.5, servings: 67 },
];

export const EMPTY_APP_DATA: AppData = {
  settings: { ...DEFAULT_SETTINGS },
  ingredients: [],
  packaging_items: [],
  recipes: [],
  flavours: [],
  fillings: [],
  batch_products: [],
  assembled_products: [],
  size_guide: [...DEFAULT_SIZE_GUIDE],
  saved_quotes: [],
  customers: [],
  orders: [],
};
