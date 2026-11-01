import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function findTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findTsxFiles(path);
      return entry.isFile() && path.endsWith('.tsx') ? [path] : [];
    });
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

describe('Material Symbols manifest', () => {
  it('contains every statically used TSX icon', () => {
    const manifest = new Set(
      readFileSync(resolve(root, 'scripts/material-symbols-manifest.txt'), 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#')),
    );
    const missing: Array<{ file: string; line: number; icon: string }> = [];
    const files = findTsxFiles(resolve(root, 'src'));

    for (const path of files) {
      const source = readFileSync(path, 'utf8');
      const file = relative(root, path).split('\\').join('/');
      const occurrences: Array<{ index: number; icon: string }> = [];
      const jsxIcon = /<span\b(?=[^>]*\bmaterial-symbols-outlined\b)[^>]*>\s*([a-z][a-z0-9_]*)\s*</g;
      const configIcon = /\bicon\s*:\s*['"]([a-z][a-z0-9_]*)['"]/g;

      for (const match of source.matchAll(jsxIcon)) {
        occurrences.push({ index: match.index, icon: match[1] });
      }
      for (const match of source.matchAll(configIcon)) {
        occurrences.push({ index: match.index, icon: match[1] });
      }

      for (const occurrence of occurrences) {
        if (!manifest.has(occurrence.icon)) {
          missing.push({
            file,
            line: lineAt(source, occurrence.index),
            icon: occurrence.icon,
          });
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
