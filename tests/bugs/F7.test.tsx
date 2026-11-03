import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookHarness = vi.hoisted(() => ({
  values: [] as any[],
  cursor: 0,
  state: null as any,
  dispatch: vi.fn(),
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hookHarness.cursor++;
      if (!(index in hookHarness.values)) hookHarness.values[index] = initial;
      return [
        hookHarness.values[index],
        (value: unknown) => {
          hookHarness.values[index] = typeof value === 'function'
            ? (value as (previous: unknown) => unknown)(hookHarness.values[index])
            : value;
        },
      ];
    },
    useMemo: (callback: () => unknown) => callback(),
  };
});

vi.mock('../../src/store/store', () => ({
  useStore: () => ({ state: hookHarness.state, dispatch: hookHarness.dispatch }),
}));

import React from 'react';
import { RecipesPage } from '../../src/ui/pages/RecipesPage';
import { EMPTY_APP_DATA } from '../../src/engine/types';

function elements(node: unknown): Array<{ type: unknown; props: Record<string, any> }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (node === null || typeof node !== 'object') return [];
  const element = node as { type: unknown; props: Record<string, any> };
  return [element, ...elements(element.props?.children)];
}

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object') return text((node as { props?: { children?: unknown } }).props?.children);
  return '';
}

describe('F7 recipe unit edits preserve entered quantities', () => {
  beforeEach(() => {
    hookHarness.values = [];
    hookHarness.cursor = 0;
    hookHarness.dispatch.mockClear();
    hookHarness.state = {
      data: {
        ...EMPTY_APP_DATA,
        ingredients: [{
          id: 'sugar',
          name: 'Sugar',
          unit_type: 'g',
          pack_quantity: 1000,
          pack_price: 100,
        }],
        recipes: [{
          id: 'recipe-1',
          name: 'Test cake',
          kind: 'cake',
          lines: [{ ingredient_id: 'sugar', quantity: 2, unit: 'tsp' }],
          weight_adjustment_g: 0,
        }],
      },
    };
    hookHarness.values[2] = hookHarness.state.data.recipes[0];
  });

  it('blocks save with an inline error rather than silently changing 2 tsp to 2 g', () => {
    let tree = RecipesPage();
    const saveButton = elements(tree).find(element =>
      element.type === 'button' && text(element.props.children).includes('Save recipe'),
    );
    expect(saveButton).toBeDefined();
    saveButton?.props.onClick();

    expect.soft(hookHarness.dispatch).not.toHaveBeenCalled();
    hookHarness.cursor = 0;
    tree = RecipesPage();
    const renderedText = text(tree);
    expect.soft(renderedText).toContain('Test cake');
    expect.soft(renderedText).toContain('line 1');
    expect.soft(renderedText).toContain('Sugar');
    expect.soft(renderedText).toContain('tsp');
  });
});
