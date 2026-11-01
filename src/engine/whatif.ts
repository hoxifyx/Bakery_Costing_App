import Decimal from 'decimal.js';
import { compute } from './engine';
import type { AppData, AuditStep, Id, Warning } from './types';

export type WhatIfSource = 'recipe' | 'batch_product' | 'assembled_product';
export type WhatIfUnit = 'batch' | 'piece' | 'box' | 'kg';
export type WhatIfOverride = { globalValue: number; productValue: number | null };
export interface WhatIfDisplacedOverrides {
  margin?: WhatIfOverride;
  overhead?: WhatIfOverride;
  labourRate?: WhatIfOverride;
}

export interface WhatIfParams {
  source: WhatIfSource;
  itemId: Id;
  quantity: number;
  unit: WhatIfUnit;
  marginOverride?: number;
  overheadOverride?: number;
  labourRateOverride?: number;
  batchMultiplier?: number;
}

export interface WhatIfResult {
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  effectiveMargin: number;
  audit: AuditStep[];
  warnings: Warning[];
  displacedOverrides: WhatIfDisplacedOverrides;
}

const D = (value: number | string): Decimal => new Decimal(value);
const toNumber = (value: Decimal): number => value.toNumber();

function invalidUnitWarning(context: string): Warning {
  return { code: 'W_ZERO_WEIGHT_RECIPE', context };
}

function calculatePrice(cost: Decimal, margin: Decimal): Decimal {
  const denominator = new Decimal(1).minus(margin);
  return denominator.gt(0) ? cost.div(denominator) : D(0);
}

export function computeWhatIf(data: AppData, params: WhatIfParams): WhatIfResult {
  const item = params.source === 'recipe'
    ? data.recipes.find(candidate => candidate.id === params.itemId)
    : params.source === 'batch_product'
      ? data.batch_products.find(candidate => candidate.id === params.itemId)
      : data.assembled_products.find(candidate => candidate.id === params.itemId);
  const selectedProduct = params.source === 'batch_product'
    ? data.batch_products.find(candidate => candidate.id === params.itemId)
    : params.source === 'assembled_product'
      ? data.assembled_products.find(candidate => candidate.id === params.itemId)
      : undefined;

  const displacedOverrides: WhatIfDisplacedOverrides = {};
  const dataWithOverrides: AppData = {
    ...data,
    settings: { ...data.settings },
  };
  const productUpdates: Record<string, number> = {};

  if (params.marginOverride !== undefined) {
    displacedOverrides.margin = {
      globalValue: data.settings.target_margin,
      productValue: selectedProduct?.target_margin ?? null,
    };
    dataWithOverrides.settings.target_margin = params.marginOverride;
    if (selectedProduct) productUpdates.target_margin = params.marginOverride;
  }
  if (params.overheadOverride !== undefined) {
    displacedOverrides.overhead = {
      globalValue: data.settings.overhead_pct,
      productValue: selectedProduct?.overhead_pct ?? null,
    };
    dataWithOverrides.settings.overhead_pct = params.overheadOverride;
    if (selectedProduct) productUpdates.overhead_pct = params.overheadOverride;
  }
  if (params.labourRateOverride !== undefined) {
    displacedOverrides.labourRate = {
      globalValue: data.settings.labour_rate_per_hour,
      productValue: selectedProduct?.labour_rate_per_hour ?? null,
    };
    dataWithOverrides.settings.labour_rate_per_hour = params.labourRateOverride;
    if (selectedProduct) productUpdates.labour_rate_per_hour = params.labourRateOverride;
  }

  if (selectedProduct && Object.keys(productUpdates).length > 0) {
    if (params.source === 'batch_product') {
      dataWithOverrides.batch_products = data.batch_products.map(product =>
        product.id === params.itemId ? { ...product, ...productUpdates } : product,
      );
    } else {
      dataWithOverrides.assembled_products = data.assembled_products.map(product =>
        product.id === params.itemId ? { ...product, ...productUpdates } : product,
      );
    }
  }

  const multipliers = params.source !== 'recipe' || params.batchMultiplier === undefined
    ? undefined
    : { [params.itemId]: params.batchMultiplier };
  const result = compute(dataWithOverrides, null, multipliers);
  const warnings: Warning[] = [];
  let audit: AuditStep[] = [];
  let unitCost = D(0);
  let unitPrice = D(0);

  if (!item) {
    warnings.push(params.source === 'recipe'
      ? invalidUnitWarning(`Recipe "${params.itemId}" was not found.`)
      : { code: 'W_UNKNOWN_PRODUCT', context: `Selected product "${params.itemId}" was not found.` });
  } else if (params.source === 'recipe') {
    const recipe = dataWithOverrides.recipes.find(candidate => candidate.id === params.itemId)!;
    const recipeResult = result.recipes[params.itemId];
    audit = recipeResult.audit;
    warnings.push(...recipeResult.warnings);
    const effectiveMargin = D(dataWithOverrides.settings.target_margin);

    if (params.unit === 'batch') {
      unitCost = D(recipeResult.cwo);
      unitPrice = calculatePrice(unitCost, effectiveMargin);
    } else if (params.unit === 'kg' && recipe.kind === 'cake') {
      unitCost = D(recipeResult.cake_cost_per_kg);
      unitPrice = calculatePrice(unitCost, effectiveMargin);
    } else if (params.unit === 'kg') {
      warnings.push(invalidUnitWarning(`Kilogram pricing is only available for cake recipes; "${recipe.name}" is ${recipe.kind.replace('_', ' ')}.`));
    } else {
      warnings.push(invalidUnitWarning(`Unit "${params.unit}" is not valid for a recipe. Choose batch or kg for a cake recipe.`));
    }
  } else if (params.source === 'batch_product') {
    const product = dataWithOverrides.batch_products.find(candidate => candidate.id === params.itemId)!;
    const productResult = result.batch_products[params.itemId];
    audit = productResult.audit;
    warnings.push(...productResult.warnings);

    if (params.unit === 'piece') {
      unitCost = D(productResult.cost_each);
      unitPrice = params.marginOverride === undefined && product.my_price_each != null
        ? D(product.my_price_each)
        : D(productResult.headline_each);
    } else if (params.unit === 'box') {
      unitCost = D(productResult.cost_box);
      unitPrice = params.marginOverride === undefined && product.my_price_box != null
        ? D(product.my_price_box)
        : D(productResult.box_price);
    } else {
      warnings.push(invalidUnitWarning(`Unit "${params.unit}" is not valid for a batch product. Choose piece or box.`));
    }
  } else {
    const product = dataWithOverrides.assembled_products.find(candidate => candidate.id === params.itemId)!;
    const productResult = result.assembled_products[params.itemId];
    audit = productResult.audit;
    warnings.push(...productResult.warnings);

    if (params.unit === 'piece') {
      unitCost = D(productResult.cost_each);
      unitPrice = params.marginOverride === undefined && product.my_price_each != null
        ? D(product.my_price_each)
        : D(productResult.price_each);
    } else {
      warnings.push(invalidUnitWarning(`Unit "${params.unit}" is not valid for an assembled product. Choose piece.`));
    }
  }

  const quantity = D(params.quantity);
  const totalCost = unitCost.mul(quantity);
  const totalPrice = unitPrice.mul(quantity);
  const effectiveMargin = unitPrice.gt(0) ? unitPrice.minus(unitCost).div(unitPrice) : D(0);

  audit = [
    ...audit,
    {
      label: 'What-if unit cost',
      formula: `cost for one ${params.unit}`,
      value: toNumber(unitCost),
    },
    {
      label: 'What-if unit price',
      formula: 'unit_cost / (1 - effective_margin)',
      value: toNumber(unitPrice),
    },
    {
      label: 'What-if total',
      formula: `quantity × unit_price = ${params.quantity} × ${toNumber(unitPrice)}`,
      value: toNumber(totalPrice),
    },
  ];

  return {
    unitCost: toNumber(unitCost),
    unitPrice: toNumber(unitPrice),
    totalCost: toNumber(totalCost),
    totalPrice: toNumber(totalPrice),
    effectiveMargin: toNumber(effectiveMargin),
    audit,
    warnings,
    displacedOverrides,
  };
}
