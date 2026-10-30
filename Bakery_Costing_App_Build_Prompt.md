# BUILD PROMPT — Bakery Costing & Pricing App

**Spec version:** 1.0  **Format:** machine-readable Markdown (JSON / TypeScript / pseudocode blocks are normative)
**Basis:** an Excel costing workbook for a cake business. This app must produce the **same numbers as that workbook** for the same inputs, with **no business data hard-coded**: every ingredient, price, recipe, flavour, product and setting is user data that can be exported and imported.

---

## 0. INSTRUCTIONS TO THE AI AGENT

1. This document is the single source of truth. Implement it literally. Do **not** simplify, "improve", re-interpret, round, or reorder any formula in Section 4, even if it looks unusual. Unusual behaviours are intentional and are listed in §4.12.
2. Do **not** invent or pre-load any real prices, recipes, flavours or products. The app starts empty except for the default settings in §3.1 and the optional size guide in Appendix B.
3. Build order: (a) pure calculation engine + unit tests, (b) data store, (c) UI, (d) import/export. Do not start the UI before the engine passes §8.
4. Money arithmetic must use a decimal library (e.g. `decimal.js`, precision 28). Never use binary floats for money. Do not round intermediate values. Compare in tests with tolerance `1e-6`.
5. All calculations live in one pure module (`engine`): `compute(data, quoteInput?) -> Result`. It has no UI, storage or network access. The UI only displays `Result`.
6. When finished, run the golden tests in §8 and report pass/fail per test. Do not claim completion if any fail.

## 1. PRODUCT GOAL AND HARD RULES

A small-business costing tool. The user keeps a price list of ingredients and packaging, writes recipes, defines cake flavours and fillings, and defines other products (donuts, cookies, macarons, cupcakes, cake pops, or anything similar). The app then:
- prices a **tiered cake quote** (up to 6 tiers, decoration, labour, delivery, packaging, overhead, profit),
- prices **batch products** (sold as pieces made from one dough/mix) and **assembled products** (cupcakes, cake pops),
- shows warnings wherever data is missing, because missing data silently costs 0.

Hard rules:
- **H1** No hard-coded ingredient names, prices, recipes, flavours, product names or currency. Everything is data.
- **H2** One global overhead rate (`settings.overhead_pct`). One global target margin (`settings.target_margin`). One labour rate. Never duplicate them.
- **H3** Overhead is applied **exactly once** to any cost (see §4.12). Never add it twice.
- **H4** Profit is a **margin on selling price**: `price = cost / (1 - margin)`. Not a markup.
- **H5** Delivery is passed through at cost: no profit and no overhead on it.
- **H6** Missing or invalid selections cost `0` and raise a visible warning. They never crash and never stay silent.
- **H7** Export → import into an empty app must reproduce identical results (round-trip test).
- **H8** Every price on screen must be explainable: provide an "Explain" view showing each step with its numbers (§5.10).

## 2. RECOMMENDED STACK AND ARCHITECTURE

- Single-page web app, responsive (phone and desktop). TypeScript, React, Vite. Local-first persistence (IndexedDB), no accounts, no server required. Optional PWA/offline.
- `decimal.js` for all arithmetic. Vitest (or equivalent) for tests.
- Folder layout suggestion: `src/engine/` (pure), `src/store/`, `src/ui/`, `src/io/` (import/export, CSV), `tests/`.
- Autosave on every change. Before every import, automatically snapshot the current data; offer "Undo last import".
- Another stack is acceptable only if the engine stays pure and decimal-based and §8 passes.

## 3. DATA MODEL

All ids: string, pattern `^[a-z0-9_-]{1,64}$`, unique within their list, never reused after deletion. Lists keep user order (it is the dropdown order). Missing numeric fields are treated as `0`.

```ts
type Id = string;

interface Settings {
  currency_code: string;               // label only, default "BDT"
  labour_rate_per_hour: number;        // default 400
  overhead_pct: number;                // fraction, default 0.25   (GLOBAL OVERHEAD)
  target_margin: number;               // fraction of selling price, default 0.30; must satisfy 0 <= m < 1
  packaging_allowance_pct: number;     // fraction, default 0.20 (waste/extras allowance, NOT profit)
  topper_price: number;                // price per cake topper, default 350
  cake_batches_per_kg: number;         // default 1  (1 recipe batch = 1 kg of cake)
  frosting_batches_per_kg: number;     // default 1.25 (frosting batches per kg of cake)
  filling_grams_per_kg: number;        // default 150 (grams of filling per kg of cake)
  // role mappings used by the cake quote (user chooses from dropdowns):
  fondant_ingredient_id: Id | null;    // an ingredient priced per gram (quote fondant is priced per kg)
  edible_print_item_id: Id | null;     // a packaging item
  cake_box_item_id: Id | null;         // packaging item
  mdf_board_item_id: Id | null;        // packaging item (the drum board, once per cake)
  standard_board_item_id: Id | null;   // packaging item (one per tier used)
  wallpaper_item_id: Id | null;        // packaging item (optional, price may be 0)
}

interface Ingredient {
  id: Id; name: string;
  unit_type: "g" | "piece";            // "g": priced per gram of pack; "piece": priced per piece (eggs, lemons, bananas)
  pack_quantity: number;               // grams in the pack, or pieces in the pack
  pack_price: number;
  piece_weight_g?: number | null;      // grams per piece (egg 50, ...). Only for unit_type "piece"
  grams_per_tsp?: number | null;       // grams per teaspoon (salt 6, baking powder 5, ...). Only for unit_type "g"
  notes?: string;
}

interface PackagingItem { id: Id; name: string; price: number; notes?: string }

type LineUnit = "g" | "piece" | "tsp";
interface RecipeLine {
  ingredient_id: Id | null;            // null = free item that has weight only (e.g. water)
  quantity: number;                    // per ONE batch
  unit: LineUnit;                      // "g" needs ingredient.unit_type "g"; "piece" needs "piece"; "tsp" needs grams_per_tsp > 0
  exclude_from_weight?: boolean;       // default false. Line is costed but not added to batch weight
  piece_weight_g_override?: number | null; // unit "piece" only: grams per piece for THIS line (e.g. egg yolk 20 g)
  label?: string;
}
interface Recipe {
  id: Id; name: string;
  kind: "cake" | "frosting_filling" | "batch_product" | "other";   // controls which dropdowns list it
  lines: RecipeLine[];
  weight_adjustment_g: number;         // typed extra grams added to batch weight (default 0)
  notes?: string;
}

type FlavourCostModel =
  | { type: "recipe"; cake_recipe_id: Id; frosting_recipe_id: Id }   // kinds "cake" and "frosting_filling"
  | { type: "average"; of: Id[] };                                   // average of the BASE prices of listed flavours (each must be type "recipe")
interface Flavour { id: Id; name: string; cost_model: FlavourCostModel; addon_cost_per_kg: number /* plain ingredient cost, default 0 */ }

type FillingSource =
  | { type: "recipe"; recipe_id: Id }            // kind "frosting_filling"
  | { type: "ingredient"; ingredient_id: Id };   // a bought filling priced per gram (unit_type "g")
interface Filling { id: Id; name: string; source: FillingSource }

interface BatchProduct {                         // donut, cookie, macaron ... made from one dough/mix
  id: Id; name: string; recipe_id: Id;
  pieces_mode: "by_weight" | "fixed";
  piece_weight_g?: number;                       // when by_weight: pieces = recipe weight / piece_weight_g (NOT rounded)
  fixed_pieces?: number;                         // when fixed
  labour_hours_per_batch: number;                // default 0
  components: { recipe_id: Id; grams: number }[];// extra per-piece components costed per gram (e.g. macaron filling)
  box_id: Id | null;                             // packaging item
  pieces_per_box: number;
  show_each_including_box: boolean;              // which "each" price is displayed as the headline price
}

type AssembledComponent =
  | { type: "cake_recipe_grams"; recipe_id: Id; grams: number }      // cake basis: 1 batch = 1 kg
  | { type: "recipe_per_gram";   recipe_id: Id; grams: number }      // frosting / ganache basis: per gram of batch weight
  | { type: "ingredient_grams";  ingredient_id: Id; grams: number }; // raw ingredient, overhead added
interface AssembledProduct {                     // cupcake, cake pop ...
  id: Id; name: string; components: AssembledComponent[];
  labour_hours_per_batch: number;                // default 0
  pieces_per_batch: number;                      // pieces made in the labour batch (e.g. 12)
  box_id: Id | null; pieces_per_box: number;
}

interface QuoteInput {
  tiers: { size_kg: number; flavour_id?: Id | null; filling_id?: Id | null }[];   // exactly 6 slots; tier 1 is index 0
  decoration: { fondant_kg: number; prints: number; flowers: number; toppers: number;
                time_hours: number; others: number; delivery: number };
}
```

Validation (on edit and on import):
- `unit "g"` requires the ingredient's `unit_type "g"`; `"piece"` requires `"piece"`; `"tsp"` requires `unit_type "g"` and `grams_per_tsp > 0`. A `null` ingredient is allowed only with unit `"g"`.
- Every id reference must exist. Deleting an item that is referenced is blocked and the app lists where it is used.
- `target_margin` must be `>= 0` and `< 1`. Numbers must be finite and `>= 0`. Names must be non-empty. Duplicate names inside a list produce a warning.
- `average` flavours may only reference `recipe`-type flavours, and not themselves.

### 3.1 Default settings for a new empty app
`labour_rate_per_hour 400, overhead_pct 0.25, target_margin 0.30, packaging_allowance_pct 0.20, topper_price 350, cake_batches_per_kg 1, frosting_batches_per_kg 1.25, filling_grams_per_kg 150, currency_code "BDT"`, all role mappings `null`. All lists empty.

## 4. CALCULATION ENGINE (normative)

Notation: `OH = settings.overhead_pct`, `M = settings.target_margin`, `LAB = settings.labour_rate_per_hour`. `Σ` sums over a list. All steps use decimals. "warn(code)" means add a warning (§4.11) and continue.

### 4.1 Ingredient price
```
ppu(i)  = i.pack_quantity > 0 ? i.pack_price / i.pack_quantity : 0        // price per gram (unit g) or per piece (unit piece)
price_per_kg_display(i) = i.unit_type == "g" ? ppu(i) * 1000 : ppu(i)      // display only
unpriced(i) = !(i.pack_quantity > 0 && i.pack_price > 0)                   // then every use warns W_UNPRICED_INGREDIENT
```

### 4.2 Recipe line
```
line_cost(l)   = l.ingredient_id == null ? 0
               : l.unit == "tsp" ? l.quantity * ing.grams_per_tsp * ppu(ing)
               : l.quantity * ppu(ing)                                      // unit g or piece
line_weight(l) = l.exclude_from_weight ? 0
               : l.unit == "g"     ? l.quantity
               : l.unit == "piece" ? l.quantity * (l.piece_weight_g_override ?? ing.piece_weight_g ?? 0)
               : l.unit == "tsp"   ? l.quantity * (ing.grams_per_tsp ?? 0)
```

### 4.3 Recipe
```
raw_cost(r)            = Σ line_cost(l)
cost_with_overhead(r)  = raw_cost(r) * (1 + OH)                // "cwo": the ONLY place overhead is applied to recipe ingredients
weight_g(r)            = Σ line_weight(l) + r.weight_adjustment_g
per_gram_cwo(r)        = weight_g(r) > 0 ? cost_with_overhead(r) / weight_g(r) : 0     // if weight_g == 0 and it is used: warn(W_ZERO_WEIGHT_RECIPE)
```

### 4.4 Two cost bases (do not mix them up)
```
cake_cost_per_kg(r)      = cost_with_overhead(r) * settings.cake_batches_per_kg     // 1 batch = 1 kg of cake. Batch WEIGHT is NOT used.
cake_cost_per_gram(r)    = cake_cost_per_kg(r) / 1000
frosting_cost_per_kg_cake(r) = cost_with_overhead(r) * settings.frosting_batches_per_kg   // whole batches, not per gram
per_gram_cwo(r)          // used for fillings, frostings in products, ganache: cost per gram of batch weight
```

### 4.5 Flavour price per kg of cake
```
base(f) = f.cost_model.type == "recipe"
        ? cake_cost_per_kg(cake_recipe) + frosting_cost_per_kg_cake(frosting_recipe)
        : average over g in f.cost_model.of of base(g)            // base values, before add-ons
flavour_price_per_kg(f) = base(f) + f.addon_cost_per_kg * (1 + OH)   // add-on is a plain ingredient cost; overhead added here
```

### 4.6 Filling cost per kg of cake
```
filling_cost_per_kg(x) = x.source.type == "recipe"
        ? per_gram_cwo(recipe) * settings.filling_grams_per_kg
        : ppu(ingredient) * settings.filling_grams_per_kg * (1 + OH)     // bought filling: overhead added here
```

### 4.7 Cake quote (QuoteInput → result)
Gate: if `tiers[0].size_kg <= 0` return `null` ("enter tier 1 size"). Everything below applies only when tier 1 has a size. A quote with only tier 2..6 filled is also `null`.
```
For each tier t in 6 slots:
    flavour_part(t) = t.size_kg * flavour_price_per_kg(t.flavour)      // unknown/blank flavour -> 0 (+ warning)
    filling_part(t) = t.size_kg * filling_cost_per_kg(t.filling)       // unknown/blank filling -> 0 (+ warning)
tier_cost       = Σ over tiers ( flavour_part + filling_part )
tiers_used      = count of tiers with size_kg > 0                      // independent of flavour/filling being chosen

fondant         = decoration.fondant_kg * ppu(fondant_ingredient) * 1000      // quote quantity is kg; price is per kg
print           = decoration.prints     * price(edible_print_item)
flowers         = decoration.flowers                                         // money amount typed by user
topper          = decoration.toppers    * settings.topper_price
time            = decoration.time_hours * LAB
others          = decoration.others                                          // money amount
delivery        = decoration.delivery                                        // money amount
decoration_sum  = fondant + print + flowers + topper + time + others         // NOTE: delivery excluded

overhead        = decoration_sum * OH      // overhead on decoration AND time. Tier costs already contain overhead via flavour/filling. Delivery gets none.
packaging       = ( price(cake_box) + price(mdf_board) + price(wallpaper) + price(standard_board) * tiers_used ) * (1 + packaging_allowance_pct)

total_cost      = tier_cost + decoration_sum + delivery + overhead + packaging
profit          = (total_cost - delivery) * M / (1 - M)        // margin on selling price; delivery is not in the profit base
total_price     = total_cost + profit
margin_check    = profit / (total_price - delivery)            // must equal M (display as a percentage)
```
Missing role mappings (e.g. no fondant ingredient) → that item costs 0 and `warn(W_ROLE_NOT_SET)` when its quantity is `> 0`. `price(wallpaper)` is 0 when unset, without a warning.

### 4.8 Batch product (donut, cookie, macaron, ...)
```
r        = recipe(p.recipe_id)
pieces   = p.pieces_mode == "by_weight" ? weight_g(r) / p.piece_weight_g : p.fixed_pieces      // NOT rounded; 0 -> unit cost 0 + warn(W_ZERO_PIECES)
labour   = p.labour_hours_per_batch * LAB
unit_cost = (raw_cost(r) + labour) * (1 + OH) / pieces                    // overhead applies to recipe raw cost AND labour
          + Σ over p.components c ( per_gram_cwo(recipe(c.recipe_id)) * c.grams )   // components already contain overhead; do NOT add it again
box      = price(p.box_id)
each_including_box = (unit_cost + box / p.pieces_per_box) / (1 - M)
each_excluding_box = unit_cost / (1 - M)
box_price          = (unit_cost * p.pieces_per_box + box) / (1 - M)        // price of a full box
headline_each      = p.show_each_including_box ? each_including_box : each_excluding_box
```
Also show for information: `raw_cost_per_piece = raw_cost(r) / pieces`.

### 4.9 Assembled product (cupcake, cake pop, ...)
```
component_cost(c) =
    cake_recipe_grams : cake_cost_per_gram(recipe) * c.grams                      // = cwo * cake_batches_per_kg / 1000 * grams
    recipe_per_gram   : per_gram_cwo(recipe) * c.grams
    ingredient_grams  : ppu(ingredient) * c.grams * (1 + OH)
unit_cost      = Σ component_cost(c)                       // already contains overhead
labour_piece   = p.labour_hours_per_batch * LAB * (1 + OH) / p.pieces_per_batch
box_piece      = price(p.box_id) / p.pieces_per_box
price_each     = (unit_cost + labour_piece + box_piece) / (1 - M)
```

### 4.10 Not computed on purpose
Cake recipe batch weight never affects any price (it is display only). Fillings, frostings used in products, ganache and bought fillings DO use weights or per-gram prices exactly as above.

### 4.11 Warnings (code → trigger → text)
| Code | Trigger | Shown at |
|---|---|---|
| W_UNPRICED_INGREDIENT | an ingredient used by a line/filling/component has `unpriced` | recipe line, Data Health |
| W_ZERO_WEIGHT_RECIPE | `weight_g == 0` for a recipe used by a filling, product or component | recipe, filling |
| W_ZERO_PIECES | pieces = 0 in a batch product | product |
| W_TIER_NO_FLAVOUR | tier `size_kg > 0` and flavour blank | next to flavour field |
| W_TIER_NO_FILLING | tier `size_kg > 0` and filling blank | next to filling field |
| W_TIER_NO_SIZE | flavour or filling chosen but `size_kg == 0` (tier ignored, not counted) | tier card |
| W_UNKNOWN_FLAVOUR / W_UNKNOWN_FILLING | id not found (e.g. deleted) | tier card |
| W_NO_TIME_HOURS | quote exists and `time_hours == 0` ("blank Time means free labour") | next to Time |
| W_NO_LABOUR_HOURS | batch/assembled product `labour_hours_per_batch == 0` | product (info) |
| W_ADDON_ZERO | flavour `addon_cost_per_kg == 0` (info only) | flavour list |
| W_ROLE_NOT_SET | a quote role mapping is null while its quantity > 0 | settings, quote |
Warnings never block calculation. "Data Health" (§5.9) lists all of them in one place.

### 4.12 Behaviours that look odd but MUST be preserved
1. **1 batch = 1 kg of cake.** Cake cost per kg is the batch cost, not scaled by batch weight. Cupcake/cake-pop cake portions use `cwo / 1000 * grams` for the same reason.
2. **Frosting in a cake flavour is costed in whole batches** (`frosting_batches_per_kg`), but **fillings are costed per gram** (`per_gram_cwo * filling_grams_per_kg`). Different bases on purpose.
3. **Overhead once per cost line:** recipes (`cwo`), flavour add-ons, bought fillings, raw ingredients in assembled products, labour in products, decoration and time in the quote. Never on delivery. Never on packaging (packaging has its own allowance, which is a cost, not profit). Never again on anything already built from `cwo`.
4. **Profit base excludes delivery; margin_check excludes delivery** — so with delivery present, margin on the whole price is slightly below `M`.
5. **Tier gating:** the whole quote exists only when tier 1 size > 0. Tier ordering is otherwise irrelevant.
6. **Tiers used** counts tiers with `size_kg > 0` (flavour/filling not required). One standard board per tier used, one MDF board and one cake box per cake.
7. **Marble-type flavours** average the base prices (before add-ons) of the referenced flavours, then add their own add-on with overhead.
8. **Egg-yolk style lines:** an "egg yolk" is the egg ingredient (priced per whole egg) with `piece_weight_g_override` (e.g. 20). Price is the whole-egg price. Do not create separate yolk pricing unless the user adds a separate ingredient.
9. **Weights follow the recipe data exactly:** use `exclude_from_weight` and `weight_adjustment_g` where the user's recipe has typed constants or leaves small items out of the batch weight. Do not "fix" weights automatically.
10. **Pieces from weight are not rounded** (e.g. 18.22 donuts).
11. **Labour hours default to 0** and are charged only when the user enters hours; the app warns.
12. **Two "each" prices** exist for batch products; the product's flag decides which is the headline. Both are always shown.
13. **Packaging allowance** multiplies only the quote's packaging total. Boxes in products carry no allowance.

## 5. USER INTERFACE

General: clean, mobile-first, large number inputs, instant recalculation on every keystroke, inline warnings (amber), validation errors (red), money shown with 2 decimals and the currency code, percentages shown as %. Autosave indicator. All lists searchable and sortable by drag (order = dropdown order). A global "Data Health" badge shows the warning count.

**5.1 Quote (home screen).** Six tier cards (Tier 1 always visible and labelled required; tiers 2–6 appear via "Add tier"). Each tier: size in kg (number), flavour dropdown, filling dropdown, with warnings beside the fields. Optional helper: size guide (Appendix B) lets the user tap a pan size to fill kg; the number stays editable. Decoration card: fondant kg, prints (count), flowers (amount), toppers (count), time (hours), others (amount), delivery (amount). Results card, in this order: tier cost, each decoration line, delivery, overhead, packaging, **TOTAL COST**, profit, **TOTAL PRICE**, margin check %. "Explain" opens §5.10. Buttons: Reset quote, Copy summary (plain text), Print.

**5.2 Ingredients.** Table: name, unit type, pack quantity, pack price, price per kg (or per piece), piece weight, grams per tsp, used-in count, "unpriced" badge. Add/edit/duplicate/delete (blocked if used). Search. CSV import/export button (§6.4). Quick "update prices" mode: edit pack price/quantity inline for many rows.

**5.3 Packaging.** Table: name, price. Same behaviours.

**5.4 Recipes.** List grouped by kind with search. Editor: name, kind, lines table (ingredient picker, quantity, unit selector restricted to valid units for the ingredient, advanced: exclude-from-weight toggle, piece-weight override), weight adjustment. Live panel: raw cost, cost with overhead, weight, per-gram cost, cake cost per kg (kind cake), frosting cost per batch, warnings. Duplicate recipe. Reorder lines.

**5.5 Flavours and Fillings.** Two tabs. Flavour editor: name, cost model (recipe: pick cake recipe + frosting recipe; or average: pick flavours), add-on cost per kg (hint: "enter plain ingredient cost; overhead is added automatically"). Live: base price, add-on with overhead, price per kg. Filling editor: name, source (recipe or ingredient), live cost per kg of cake.

**5.6 Products.** Two tabs: Batch products and Assembled products, forms per §3 with live results (all values from §4.8/4.9, both each-prices for batch products). Component pickers are filtered by recipe kind.

**5.7 Settings.** Every field in `Settings` with a one-line plain explanation. Role mappings are dropdowns. Margin ≥ 100% is rejected with an error. A note near overhead: "Applied once per cost; see the Explain view."

**5.8 Import / Export.** See §6.

**5.9 Data Health.** One list of all warnings (§4.11) grouped by type with a link to the item, plus counts: unpriced ingredients, products with zero labour hours, flavours with zero add-on, recipes with zero weight.

**5.10 Explain.** For any computed price (flavour, filling, product, quote) show a collapsible tree: each step's name, the formula text from §4, and the numbers used. Must be generated from the engine's `audit` output, not re-implemented in the UI.

## 6. IMPORT AND EXPORT

### 6.1 Full export (backup)
One JSON file `bakery-costing-export-YYYYMMDD-HHMM.json`:
```json
{
  "format": "bakery-costing-data",
  "schema_version": "1.0",
  "exported_at": "ISO-8601 timestamp",
  "app_version": "string",
  "settings": { },
  "ingredients": [ ],
  "packaging_items": [ ],
  "recipes": [ ],
  "flavours": [ ],
  "fillings": [ ],
  "batch_products": [ ],
  "assembled_products": [ ],
  "size_guide": [ ],
  "saved_quotes": [ ]
}
```
Each array/object uses exactly the shapes in §3 (`packaging_items` = `PackagingItem[]`). `size_guide` and `saved_quotes` are optional (see §7).

### 6.2 Partial export
The user ticks groups: settings, ingredients, packaging, recipes, flavours+fillings, products, size guide, saved quotes. The file has the same envelope with only those keys present. A partial file is valid for import.

### 6.3 Import
1. User picks a `.json` file (or drags it in). Reject files > 20 MB or non-JSON.
2. Validate envelope: `format` must equal `"bakery-costing-data"`. `schema_version`: same major version is accepted; an older major is migrated by a registered migration function; a newer major is rejected with a clear message.
3. Validate every record against §3 (types, ranges, unit rules, id pattern, duplicate ids, references). Unknown fields are ignored with a warning. Collect all errors with a path such as `recipes[3].lines[2].unit`.
4. Show a **preview** before changing anything: per group, counts of records to add / update / unchanged, plus validation errors and warnings.
5. Modes (user chooses): **Replace everything** (groups present in the file replace the current data; groups absent are kept), **Merge** (upsert by `id`, never deletes), **Replace selected groups only**.
6. Reference check: after applying, every reference must resolve. If not, the import is rejected as a whole and nothing changes (atomic).
7. Auto-snapshot the current data before applying; "Undo last import" restores it.
8. Imports never execute code, formulas or HTML. Strings are stored as text and escaped on display. Numbers must be finite.

### 6.4 CSV (spreadsheet-friendly, UTF-8, header row required)
- `ingredients.csv`: `id,name,unit_type,pack_quantity,pack_price,piece_weight_g,grams_per_tsp,notes`
- `packaging.csv`: `id,name,price,notes`
- `recipe_lines.csv`: `recipe_id,recipe_name,line_no,ingredient_id,ingredient_name,quantity,unit,exclude_from_weight,piece_weight_g_override,label`
- `recipes.csv`: `id,name,kind,weight_adjustment_g,notes`
Matching: by `id`; if `id` is empty, by case-insensitive `name`; unmatched rows become new records with a generated slug id. A **"Update prices only"** import mode for `ingredients.csv` and `packaging.csv` changes only `pack_quantity`, `pack_price` (and `price`) and leaves everything else untouched. CSV imports use the same preview/validation/atomic/undo flow as §6.3.

### 6.5 Templates and round trip
- "Download blank template" gives the Appendix B JSON and the CSV header rows.
- **Round-trip requirement:** export all → clear all data → import the file → `compute` results must be identical (tolerance `1e-9`) for every flavour, filling, product and for a sample quote. This is an automated test.

## 7. OPTIONAL EXTENSIONS (off by default; they must not change any number in §8)
- **Saved quotes:** `SavedQuote { id, name, created_at, input: QuoteInput, result_snapshot, notes }`. The snapshot stores the numbers at save time; re-opening offers "Recalculate with current prices".
- **Price rounding:** `settings.price_rounding_step` (default 0 = off). When > 0, show final selling prices rounded to the nearest step in addition to the exact value. Never use rounded values in further calculations and never change `margin_check`.
- **Size guide:** list of `{ label, kg, servings }` used only as a helper on the Quote screen (Appendix B).

## 8. GOLDEN TESTS

All values below were produced by a reference implementation that was itself verified against the source workbook (including a stress variant with every setting changed). Tolerance `1e-6`. The fixture is made-up data, not real prices.

### 8.1 Fixture (`fixture`)
```json
{
 "settings": {
  "currency_code": "BDT",
  "labour_rate_per_hour": 400,
  "overhead_pct": 0.25,
  "target_margin": 0.3,
  "packaging_allowance_pct": 0.2,
  "topper_price": 350,
  "cake_batches_per_kg": 1,
  "frosting_batches_per_kg": 1.25,
  "filling_grams_per_kg": 150,
  "fondant_ingredient_id": "fondant",
  "edible_print_item_id": "print",
  "cake_box_item_id": "cake_box",
  "mdf_board_item_id": "mdf",
  "standard_board_item_id": "std_board",
  "wallpaper_item_id": "wallpaper"
 },
 "ingredients": [
  {
   "id": "flour",
   "name": "Flour",
   "unit_type": "g",
   "pack_quantity": 1000,
   "pack_price": 100
  },
  {
   "id": "sugar",
   "name": "Sugar",
   "unit_type": "g",
   "pack_quantity": 1000,
   "pack_price": 120
  },
  {
   "id": "butter",
   "name": "Butter",
   "unit_type": "g",
   "pack_quantity": 200,
   "pack_price": 300
  },
  {
   "id": "egg",
   "name": "Egg",
   "unit_type": "piece",
   "pack_quantity": 12,
   "pack_price": 120,
   "piece_weight_g": 50
  },
  {
   "id": "salt",
   "name": "Salt",
   "unit_type": "g",
   "pack_quantity": 1000,
   "pack_price": 30,
   "grams_per_tsp": 6
  },
  {
   "id": "cocoa",
   "name": "Cocoa",
   "unit_type": "g",
   "pack_quantity": 500,
   "pack_price": 750
  },
  {
   "id": "vanilla",
   "name": "Vanilla",
   "unit_type": "g",
   "pack_quantity": 100,
   "pack_price": 250,
   "grams_per_tsp": 5
  },
  {
   "id": "jam",
   "name": "Jam",
   "unit_type": "g",
   "pack_quantity": 250,
   "pack_price": 400
  },
  {
   "id": "fondant",
   "name": "Fondant",
   "unit_type": "g",
   "pack_quantity": 1000,
   "pack_price": 900
  },
  {
   "id": "choc",
   "name": "Chocolate",
   "unit_type": "g",
   "pack_quantity": 1000,
   "pack_price": 750
  }
 ],
 "recipes": [
  {
   "id": "cake_plain",
   "name": "Plain cake",
   "kind": "cake",
   "weight_adjustment_g": 0,
   "lines": [
    {
     "ingredient_id": "egg",
     "quantity": 2,
     "unit": "piece"
    },
    {
     "ingredient_id": "flour",
     "quantity": 100,
     "unit": "g"
    },
    {
     "ingredient_id": "sugar",
     "quantity": 50,
     "unit": "g"
    },
    {
     "ingredient_id": "salt",
     "quantity": 1,
     "unit": "tsp"
    }
   ]
  },
  {
   "id": "cake_choc",
   "name": "Chocolate cake",
   "kind": "cake",
   "weight_adjustment_g": 0,
   "lines": [
    {
     "ingredient_id": "egg",
     "quantity": 2,
     "unit": "piece"
    },
    {
     "ingredient_id": "flour",
     "quantity": 80,
     "unit": "g"
    },
    {
     "ingredient_id": "cocoa",
     "quantity": 20,
     "unit": "g"
    },
    {
     "ingredient_id": "sugar",
     "quantity": 50,
     "unit": "g"
    },
    {
     "ingredient_id": "salt",
     "quantity": 1,
     "unit": "tsp"
    }
   ]
  },
  {
   "id": "buttercream",
   "name": "Buttercream",
   "kind": "frosting_filling",
   "weight_adjustment_g": 0,
   "lines": [
    {
     "ingredient_id": "butter",
     "quantity": 100,
     "unit": "g"
    },
    {
     "ingredient_id": "sugar",
     "quantity": 100,
     "unit": "g"
    },
    {
     "ingredient_id": "egg",
     "quantity": 2,
     "unit": "piece"
    },
    {
     "ingredient_id": "vanilla",
     "quantity": 5,
     "unit": "g",
     "exclude_from_weight": true
    },
    {
     "ingredient_id": "salt",
     "quantity": 1,
     "unit": "tsp",
     "exclude_from_weight": true
    }
   ]
  },
  {
   "id": "curd",
   "name": "Curd (yolks)",
   "kind": "frosting_filling",
   "weight_adjustment_g": 30,
   "lines": [
    {
     "ingredient_id": "egg",
     "quantity": 3,
     "unit": "piece",
     "piece_weight_g_override": 20
    },
    {
     "ingredient_id": "sugar",
     "quantity": 100,
     "unit": "g"
    },
    {
     "ingredient_id": "butter",
     "quantity": 50,
     "unit": "g"
    }
   ]
  },
  {
   "id": "dough",
   "name": "Dough",
   "kind": "batch_product",
   "weight_adjustment_g": 0,
   "lines": [
    {
     "ingredient_id": "flour",
     "quantity": 500,
     "unit": "g"
    },
    {
     "ingredient_id": "sugar",
     "quantity": 50,
     "unit": "g"
    },
    {
     "ingredient_id": "egg",
     "quantity": 2,
     "unit": "piece"
    },
    {
     "ingredient_id": "butter",
     "quantity": 50,
     "unit": "g"
    }
   ]
  },
  {
   "id": "shell",
   "name": "Shell mix",
   "kind": "batch_product",
   "weight_adjustment_g": 0,
   "lines": [
    {
     "ingredient_id": "flour",
     "quantity": 100,
     "unit": "g"
    },
    {
     "ingredient_id": "sugar",
     "quantity": 100,
     "unit": "g"
    },
    {
     "ingredient_id": "egg",
     "quantity": 2,
     "unit": "piece"
    },
    {
     "ingredient_id": "salt",
     "quantity": 0.5,
     "unit": "tsp"
    }
   ]
  }
 ],
 "flavours": [
  {
   "id": "plain",
   "name": "Plain",
   "cost_model": {
    "type": "recipe",
    "cake_recipe_id": "cake_plain",
    "frosting_recipe_id": "buttercream"
   },
   "addon_cost_per_kg": 0
  },
  {
   "id": "choc",
   "name": "Chocolate",
   "cost_model": {
    "type": "recipe",
    "cake_recipe_id": "cake_choc",
    "frosting_recipe_id": "buttercream"
   },
   "addon_cost_per_kg": 0
  },
  {
   "id": "marble",
   "name": "Marble",
   "cost_model": {
    "type": "average",
    "of": [
     "plain",
     "choc"
    ]
   },
   "addon_cost_per_kg": 20
  },
  {
   "id": "mocha",
   "name": "Mocha",
   "cost_model": {
    "type": "recipe",
    "cake_recipe_id": "cake_plain",
    "frosting_recipe_id": "buttercream"
   },
   "addon_cost_per_kg": 40
  }
 ],
 "fillings": [
  {
   "id": "f_jam",
   "name": "Jam",
   "source": {
    "type": "ingredient",
    "ingredient_id": "jam"
   }
  },
  {
   "id": "f_bc",
   "name": "Buttercream",
   "source": {
    "type": "recipe",
    "recipe_id": "buttercream"
   }
  },
  {
   "id": "f_curd",
   "name": "Curd",
   "source": {
    "type": "recipe",
    "recipe_id": "curd"
   }
  }
 ],
 "batch_products": [
  {
   "id": "donut",
   "recipe_id": "dough",
   "pieces_mode": "by_weight",
   "piece_weight_g": 50,
   "labour_hours_per_batch": 1,
   "components": [],
   "box_id": "box12",
   "pieces_per_box": 12,
   "show_each_including_box": true
  },
  {
   "id": "macaron",
   "recipe_id": "shell",
   "pieces_mode": "fixed",
   "fixed_pieces": 10,
   "labour_hours_per_batch": 0.5,
   "components": [
    {
     "recipe_id": "buttercream",
     "grams": 15
    }
   ],
   "box_id": "box10",
   "pieces_per_box": 10,
   "show_each_including_box": false
  }
 ],
 "assembled_products": [
  {
   "id": "cupcake",
   "components": [
    {
     "type": "cake_recipe_grams",
     "recipe_id": "cake_plain",
     "grams": 60
    },
    {
     "type": "recipe_per_gram",
     "recipe_id": "buttercream",
     "grams": 35
    }
   ],
   "labour_hours_per_batch": 1,
   "pieces_per_batch": 12,
   "box_id": "box12",
   "pieces_per_box": 12
  },
  {
   "id": "cakepop",
   "components": [
    {
     "type": "cake_recipe_grams",
     "recipe_id": "cake_choc",
     "grams": 18
    },
    {
     "type": "recipe_per_gram",
     "recipe_id": "curd",
     "grams": 3
    },
    {
     "type": "ingredient_grams",
     "ingredient_id": "choc",
     "grams": 10
    }
   ],
   "labour_hours_per_batch": 1,
   "pieces_per_batch": 12,
   "box_id": "box12",
   "pieces_per_box": 12
  }
 ],
 "packaging_items": [
  {
   "id": "cake_box",
   "name": "Cake box",
   "price": 70
  },
  {
   "id": "std_board",
   "name": "Standard board",
   "price": 15
  },
  {
   "id": "mdf",
   "name": "MDF drum board",
   "price": 250
  },
  {
   "id": "wallpaper",
   "name": "Wallpaper",
   "price": 0
  },
  {
   "id": "print",
   "name": "Edible print",
   "price": 450
  },
  {
   "id": "box12",
   "name": "12-hole box",
   "price": 50
  },
  {
   "id": "box10",
   "name": "10-piece box",
   "price": 30
  }
 ]
}
```

### 8.2 Quote input used in the tests (`quote_input`)
```json
{
 "tiers": [
  {
   "size_kg": 2,
   "flavour_id": "plain",
   "filling_id": "f_jam"
  },
  {
   "size_kg": 1,
   "flavour_id": "marble",
   "filling_id": "f_bc"
  },
  {
   "size_kg": 0
  },
  {
   "size_kg": 0
  },
  {
   "size_kg": 0
  },
  {
   "size_kg": 0
  }
 ],
 "decoration": {
  "fondant_kg": 0.5,
  "prints": 1,
  "flowers": 100,
  "toppers": 1,
  "time_hours": 2,
  "others": 50,
  "delivery": 200
 }
}
```

### 8.3 Expected results (Test T1)
```json
{
 "recipes": {
  "cake_plain": {
   "raw": 36.18,
   "cwo": 45.225,
   "weight": 256
  },
  "cake_choc": {
   "raw": 64.18,
   "cwo": 80.225,
   "weight": 256
  },
  "buttercream": {
   "raw": 194.68,
   "cwo": 243.35,
   "weight": 300.0
  },
  "curd": {
   "raw": 117.0,
   "cwo": 146.25,
   "weight": 240
  },
  "dough": {
   "raw": 151.0,
   "cwo": 188.75,
   "weight": 700
  },
  "shell": {
   "raw": 42.09,
   "cwo": 52.6125,
   "weight": 303.0
  }
 },
 "flavour_price_per_kg": {
  "plain": 349.4125,
  "choc": 384.4125,
  "marble": 391.9125,
  "mocha": 399.4125
 },
 "filling_cost_per_kg_of_cake": {
  "f_jam": 300.0,
  "f_bc": 121.675,
  "f_curd": 91.40625
 },
 "products": {
  "donut": {
   "pieces": 14.0,
   "unit_cost": 49.196429,
   "each_incl_box": 76.232993,
   "each_excl_box": 70.280612,
   "box_price": 914.795918,
   "each_shown": 76.232993
  },
  "macaron": {
   "pieces": 10,
   "unit_cost": 42.42875,
   "each_incl_box": 64.898214,
   "each_excl_box": 60.6125,
   "box_price": 648.982143,
   "each_shown": 60.6125
  },
  "cupcake": {
   "unit_cost": 31.104333,
   "price_each": 109.910952
  },
  "cakepop": {
   "unit_cost": 12.647175,
   "price_each": 83.543583
  }
 },
 "quote": {
  "tier_cost": 1812.4125,
  "tiers_used": 2,
  "overhead": 550.0,
  "packaging": 420.0,
  "total_cost": 5182.4125,
  "profit": 2135.319643,
  "price": 7317.732143,
  "margin_check": 0.3
 }
}
```
Hand-check of the chain: plain flavour = `45.225 + 243.35 * 1.25 = 349.4125`; quote `total_cost = 1812.4125 + 2200 + 200 + 550 + 420 = 5182.4125`; `profit = (5182.4125 - 200) * 0.3 / 0.7`; `margin_check = 0.3`.

### 8.4 Test T2 — settings variant
Same fixture and quote, but `overhead_pct = 0.30`, `target_margin = 0.35`, `labour_rate_per_hour = 450`. Expected:
```json
{
 "flavour_price_per_kg": {
  "plain": 363.389,
  "choc": 399.789,
  "marble": 407.589,
  "mocha": 415.389
 },
 "quote": {
  "tier_cost": 1884.909,
  "tiers_used": 2,
  "overhead": 690.0,
  "packaging": 420.0,
  "total_cost": 5494.909,
  "profit": 2851.104846,
  "price": 8346.013846,
  "margin_check": 0.35
 },
 "products": {
  "donut": {
   "pieces": 14.0,
   "unit_cost": 55.807143,
   "each_incl_box": 92.267399,
   "each_excl_box": 85.857143,
   "box_price": 1107.208791,
   "each_shown": 92.267399
  },
  "macaron": {
   "pieces": 10,
   "unit_cost": 47.3759,
   "each_incl_box": 77.501385,
   "each_excl_box": 72.886,
   "box_price": 775.013846,
   "each_shown": 72.886
  },
  "cupcake": {
   "unit_cost": 32.348507,
   "price_each": 131.17719
  },
  "cakepop": {
   "unit_cost": 13.153062,
   "price_each": 101.645736
  }
 }
}
```

### 8.5 Behavioural tests (no numbers needed)
- **T3 Gate:** tier 1 size 0 and tier 2 size 1 → `quote == null` and the UI says "enter tier 1 size".
- **T4 Missing flavour:** tier 2 size 1 with no flavour → warning `W_TIER_NO_FLAVOUR`, tier 2 flavour part = 0, but `tiers_used` still counts tier 2 and the standard board is still charged.
- **T5 Flavour without size:** tier 3 has flavour and filling but size 0 → `W_TIER_NO_SIZE`, tier contributes 0, `tiers_used` unchanged.
- **T6 Free labour warning:** `time_hours = 0` → `W_NO_TIME_HOURS`; product with `labour_hours_per_batch = 0` → `W_NO_LABOUR_HOURS`.
- **T7 Unpriced ingredient:** set an ingredient `pack_price = 0` → `W_UNPRICED_INGREDIENT` on every line that uses it, its cost is 0, nothing crashes.
- **T8 Margin 0:** `target_margin = 0` → `profit = 0`, `total_price == total_cost`, `margin_check = 0`. `target_margin >= 1` → settings validation error, calculation not run.
- **T9 Overhead 0:** `overhead_pct = 0` → every `cost_with_overhead == raw_cost`.
- **T10 No double overhead:** doubling `overhead_pct` from `0.25` to `0.5` raises `cwo` of every recipe by exactly the factor `1.5 / 1.25`, and raises a bought filling's cost by the same factor.
- **T11 Delete protection:** deleting an ingredient used by a recipe line is blocked and lists the recipes.
- **T12 Round trip:** §6.5.
- **T13 Import atomicity:** an import file with one invalid reference changes nothing.
- **T14 Dropdown filters:** flavour cake dropdown lists only `kind "cake"`; frosting and filling-recipe dropdowns list only `kind "frosting_filling"`; batch-product recipe dropdown lists only `kind "batch_product"`.

## 9. ACCEPTANCE CHECKLIST
- [ ] Engine is a pure module with no UI/storage imports; decimal arithmetic throughout.
- [ ] T1 and T2 pass within `1e-6`; T3–T14 pass.
- [ ] No ingredient, price, recipe, flavour or product is shipped with the app.
- [ ] Every number on screen can be explained (§5.10).
- [ ] Full export/import, partial export, CSV import (including "update prices only"), blank template, preview, atomic apply, undo — all work.
- [ ] Warnings of §4.11 appear in the right places and in Data Health.
- [ ] Works offline after first load, on phone and desktop.

## APPENDIX A — HOW THE ORIGINAL WORKBOOK MAPS TO THIS MODEL
| Workbook | App entity | Note |
|---|---|---|
| Material price: ingredients table | `ingredients` | "Price per gm" = `ppu`. Egg, lemon, banana are per-piece items |
| Material price: packaging list | `packaging_items` | cake box, boards, boxes, edible print ... |
| Material price: assumptions block | `settings` | labour, overhead, margin, allowance, topper, batches per kg, filling grams |
| Cake cost (sponges, mud, red velvet, ...) | `recipes` kind `cake` | batch cost with overhead = cost of 1 kg of cake |
| Butter Cream & Filling sheet | `recipes` kind `frosting_filling` | buttercream, ganache, frostings, curds, compote, custard, caramel |
| Flavours: left table | `flavours` | add-on column = `addon_cost_per_kg` |
| Flavours: filling table | `fillings` | recipe-based or bought (jam, spreads) |
| Cake Pricing | `QuoteInput` + §4.7 | 6 tier slots |
| Donut, Cookies, Macarons | `batch_products` | macaron filling = a `component` |
| Cupcakes & Cake pops | `assembled_products` | |
| Typed constants in weight formulas (e.g. "+100", "+245") | `weight_adjustment_g` | |
| Items left out of a batch weight (e.g. vanilla and salt in buttercream) | `exclude_from_weight` | |
| "Egg yolk" rows priced as a whole egg | line on the Egg ingredient with `piece_weight_g_override` | |
| Teaspoon rows | unit `tsp` + ingredient `grams_per_tsp` | |

## APPENDIX B — BLANK IMPORT TEMPLATE (valid, empty)
```json
{
 "format": "bakery-costing-data",
 "schema_version": "1.0",
 "exported_at": "",
 "app_version": "",
 "settings": {
  "currency_code": "BDT",
  "labour_rate_per_hour": 400,
  "overhead_pct": 0.25,
  "target_margin": 0.3,
  "packaging_allowance_pct": 0.2,
  "topper_price": 350,
  "cake_batches_per_kg": 1,
  "frosting_batches_per_kg": 1.25,
  "filling_grams_per_kg": 150,
  "fondant_ingredient_id": null,
  "edible_print_item_id": null,
  "cake_box_item_id": null,
  "mdf_board_item_id": null,
  "standard_board_item_id": null,
  "wallpaper_item_id": null
 },
 "ingredients": [],
 "packaging_items": [],
 "recipes": [],
 "flavours": [],
 "fillings": [],
 "batch_products": [],
 "assembled_products": [],
 "size_guide": [
  { "label": "5\"", "kg": 0.7, "servings": 10 },
  { "label": "6\"", "kg": 1, "servings": 15 },
  { "label": "7\"", "kg": 1.5, "servings": 20 },
  { "label": "8\"", "kg": 2, "servings": 30 },
  { "label": "9\"", "kg": 2.5, "servings": 38 },
  { "label": "10\"", "kg": 3, "servings": 45 },
  { "label": "11\"", "kg": 3.5, "servings": 52 },
  { "label": "12\"", "kg": 4.5, "servings": 67 }
 ],
 "saved_quotes": []
}
```

## 10. EXTENSIONS (Phased Upgrade Plan)
The following extensions were implemented as part of the Phased Upgrade Plan.
Final schema version at the time this original specification was last maintained: `1.2`.

- **Phase 1**: Core Architecture & Dependency Setup (Validation only).
- **Phase 2**: Price Rounding (`settings.price_rounding_step`).
- **Phase 3**: Configurable Size Guide (`size_guide` added to AppData).
- **Phase 4**: Order & Customer Management (`customers`, `orders` added to AppData).
- **Phase 5**: Historical Pricing Data (`price_history` added to Ingredient).
- **Phase 6**: Recipe Scaling (UI-only scaling previews, pure engine).
- **Phase 9**: Sidebar Grouping and Navigation Polish (UI only).

Phases 7, 8, and 10-18 were intentionally skipped by the user.

### Current release status (updated 2026-10-30)

This prompt remains the original product specification; it is not a complete inventory of later UI and release work. The shipped app is at **v1.5.0** (see `CHANGELOG.md`), with product-level pricing overrides, product quotes, and the earlier release-series UI and font updates.

The current export schema is `1.4`; see `MIGRATIONS.md` for the additive schema history and compatibility behavior. The automated test suite has 49 passing tests. Check the current source and tests for exact implementation details rather than assuming every original specification item was implemented.
