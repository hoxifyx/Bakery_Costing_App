import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('F4 page-area error boundary', () => {
  it('wraps the page area and provides reload and backup-recovery actions', () => {
    const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    const boundary = readFileSync(new URL('../../src/ui/components/PageErrorBoundary.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/<PageErrorBoundary/);
    expect(boundary).toMatch(/window\.location\.reload/);
    expect(boundary).toMatch(/import_export/);
  });
});
