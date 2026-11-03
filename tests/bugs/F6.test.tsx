import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { EMPTY_APP_DATA } from '../../src/engine/types';
import { DataHealthPage } from '../../src/ui/pages/DataHealthPage';

const testState = vi.hoisted(() => ({ data: null as unknown, dispatch: vi.fn() }));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useMemo: (callback: () => unknown) => callback() };
});

vi.mock('../../src/store/store', () => ({
  useStore: () => ({ state: { data: testState.data }, dispatch: testState.dispatch }),
}));

function elements(node: unknown): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (node === null || typeof node !== 'object') return [];
  const element = node as { type: unknown; props: Record<string, unknown> };
  return [element, ...elements(element.props?.children)];
}

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object') return text((node as { props?: { children?: unknown } }).props?.children);
  return '';
}

describe('F6 dangling order quote repair', () => {
  it('reports the missing quote reference and exposes a one-click unlink action', () => {
    testState.dispatch.mockClear();
    testState.data = {
      ...EMPTY_APP_DATA,
      orders: [{ id: 'order-orphan', customer_id: null, quote_id: 'deleted-quote', status: 'Draft' }],
    };
    const markup = renderToString(React.createElement(DataHealthPage));
    expect.soft(markup).toContain('deleted-quote');
    expect.soft(markup).toContain('Unlink');
    expect(testState.dispatch).not.toHaveBeenCalled();

    const unlink = elements(DataHealthPage({})).find(element =>
      element.type === 'button' && text(element.props.children) === 'Unlink',
    );
    expect(unlink).toBeDefined();
    (unlink?.props.onClick as (() => void) | undefined)?.();
    expect(testState.dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ORDER',
      item: { id: 'order-orphan', customer_id: null, quote_id: null, status: 'Draft' },
    });
  });
});
