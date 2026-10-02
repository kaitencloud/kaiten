import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vite-plus/test';

const utilityNames = (css: string) =>
  [...css.matchAll(/@utility\s+([\w*-]+)/g)].map((match) => match[1]);

describe('stylesheets', () => {
  // Tailwind merges two `@utility` blocks of one name instead of letting the
  // last one win. shadcn's `scroll-fade-x`, pulled in with its Tailwind file,
  // once merged into the table's own: a browser without scroll-driven
  // animations then took shadcn's fallback, a permanent fade on both edges.
  it('defines no utility under a name shadcn/tailwind.css already uses', () => {
    const shadcn = utilityNames(
      readFileSync(
        createRequire(import.meta.url).resolve('shadcn/tailwind.css'),
        'utf8',
      ),
    );
    const own = ['../styles.css', '../tokens.css'].flatMap((file) =>
      utilityNames(readFileSync(new URL(file, import.meta.url), 'utf8')),
    );

    expect(own.filter((name) => shadcn.includes(name))).toEqual([]);
  });
});
