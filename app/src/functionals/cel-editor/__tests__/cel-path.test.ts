import { describe, it, expect } from 'vite-plus/test';
import {
  completionTargetAt,
  hoverPathAt,
  resolveNode,
  scanChain,
} from '../logic/cel-path';
import type { CelContextNode } from '../types/cel-context.types';

const names = (text: string) =>
  scanChain(text)?.map((segment) => segment.name) ?? null;

const roots: CelContextNode[] = [
  {
    name: '__kaiten',
    type: 'object',
    fields: [
      {
        name: 'license',
        type: 'object',
        fields: [
          { name: 'slug', type: 'string' },
          { name: 'type', type: 'string' },
        ],
      },
      {
        name: 'entitlements',
        type: 'map',
        knownKeys: ['seats', 'customers'],
        values: {
          name: '',
          type: 'object',
          fields: [
            { name: 'remaining', type: 'number' },
            { name: 'unlimited', type: 'boolean' },
          ],
        },
      },
      {
        name: 'instance',
        type: 'object',
        fields: [
          { name: 'slug', type: 'string' },
          { name: 'metadata', type: 'map', values: { name: '', type: 'dyn' } },
        ],
      },
    ],
  },
  { name: 'targetingKey', type: 'string' },
];

describe('scanChain', () => {
  it('reads a chain of names', () => {
    expect(names('__kaiten.license.slug')).toEqual([
      '__kaiten',
      'license',
      'slug',
    ]);
  });

  it('reads an indexed key as a step of its own', () => {
    expect(names("__kaiten.entitlements['seats']")).toEqual([
      '__kaiten',
      'entitlements',
      'seats',
    ]);
    expect(names('__kaiten.entitlements["seats"]')).toEqual([
      '__kaiten',
      'entitlements',
      'seats',
    ]);
  });

  it('marks a computed key as one it cannot read', () => {
    const chain = scanChain('__kaiten.entitlements[someVar]');

    expect(chain?.map((segment) => segment.dynamic)).toEqual([
      false,
      false,
      true,
    ]);
  });

  // The chain runs from wherever it starts up to the cursor, so everything
  // before it has to end it rather than be dragged in.
  it.each([
    ['has(__kaiten.license', ['__kaiten', 'license']],
    ['a == __kaiten.license', ['__kaiten', 'license']],
    ["x == 'y' && __kaiten.license", ['__kaiten', 'license']],
    ['size(a) > 1 || __kaiten.license', ['__kaiten', 'license']],
    ['[__kaiten.license', ['__kaiten', 'license']],
  ])('stops the chain at %s', (text, expected) => {
    expect(names(text)).toEqual(expected);
  });

  it('tolerates whitespace around the dots', () => {
    expect(names('__kaiten . license')).toEqual(['__kaiten', 'license']);
  });

  it('refuses what is not a chain', () => {
    expect(scanChain('')).toBeNull();
    expect(scanChain('1.5')).toBeNull();
    expect(scanChain('a.b()')).toBeNull();
  });
});

describe('completionTargetAt', () => {
  it('offers roots for a bare name', () => {
    expect(completionTargetAt('')).toEqual({ kind: 'root', prefix: '' });
    expect(completionTargetAt('__kai')).toEqual({
      kind: 'root',
      prefix: '__kai',
    });
  });

  it('offers members after a dot', () => {
    const target = completionTargetAt('__kaiten.license.');

    expect(target.kind).toBe('member');
    expect(target.kind === 'member' && target.prefix).toBe('');
    expect(
      target.kind === 'member' && target.path.map((s) => s.name),
    ).toEqual(['__kaiten', 'license']);
  });

  it('keeps the partial name being typed after a dot', () => {
    const target = completionTargetAt('__kaiten.lic');

    expect(target.kind).toBe('member');
    expect(target.kind === 'member' && target.prefix).toBe('lic');
    expect(target.kind === 'member' && target.path.map((s) => s.name)).toEqual([
      '__kaiten',
    ]);
  });

  // The whole point of the index form: the slugs are the completion.
  it('offers keys inside an open index', () => {
    const target = completionTargetAt("__kaiten.entitlements['sea");

    expect(target.kind).toBe('key');
    expect(target.kind === 'key' && target.prefix).toBe('sea');
    expect(target.kind === 'key' && target.path.map((s) => s.name)).toEqual([
      '__kaiten',
      'entitlements',
    ]);
  });

  it('is not fooled by an index that is already closed', () => {
    const target = completionTargetAt("__kaiten.entitlements['seats'].");

    expect(target.kind).toBe('member');
    expect(target.kind === 'member' && target.path.map((s) => s.name)).toEqual([
      '__kaiten',
      'entitlements',
      'seats',
    ]);
  });

  /*
  `'` and `"` are completion triggers so an index can offer its keys — which
  makes every ordinary string literal fire the provider too. These are the
  positions where the only correct suggestion list is an empty one; offering
  the roots there popped a dropdown into the middle of every value typed.
  */
  describe('inside and around ordinary strings', () => {
    it.each([
      "__kaiten.license.slug == '",
      "__kaiten.license.slug == 'sca",
      'device.os == "io',
    ])('offers nothing inside the literal %s', (text) => {
      expect(completionTargetAt(text)).toEqual({ kind: 'none' });
    });

    it('offers nothing on the quote that closes a string', () => {
      expect(completionTargetAt("__kaiten.license.slug == 'scale'")).toEqual({
        kind: 'none',
      });
    });

    it('still reads the text after a closed string as what it is', () => {
      const target = completionTargetAt("x == 'a' && __kaiten.");

      expect(target.kind).toBe('member');
      expect(
        target.kind === 'member' && target.path.map((s) => s.name),
      ).toEqual(['__kaiten']);
    });

    it('does not mistake an escaped quote for the end of the string', () => {
      expect(completionTargetAt("x == 'it\\'s ")).toEqual({ kind: 'none' });
    });
  });

  /*
  A dot with no readable chain before it. The value has some shape — the
  scanner just cannot read it — except after a digit, where the dot is a
  float being typed and any suggestion is wrong.
  */
  describe('after a dot off something unreadable', () => {
    it('treats a parenthesised expression as a value of unknown shape', () => {
      expect(completionTargetAt('(a || b).')).toEqual({
        kind: 'member',
        path: [],
        prefix: '',
      });
    });

    it('treats a closed string literal the same way', () => {
      expect(completionTargetAt("'scale'.")).toEqual({
        kind: 'member',
        path: [],
        prefix: '',
      });
    });

    it('offers nothing in the middle of a number', () => {
      expect(completionTargetAt('1.')).toEqual({ kind: 'none' });
      expect(completionTargetAt('x > 1.')).toEqual({ kind: 'none' });
    });

    it('keeps a partial name typed after the unreadable dot', () => {
      const target = completionTargetAt('(a || b).sta');

      expect(target).toEqual({ kind: 'member', path: [], prefix: 'sta' });
    });
  });
});

describe('hoverPathAt', () => {
  it('reads the dotted chain ending at the word', () => {
    expect(
      hoverPathAt('__kaiten.license.slug', 'slug')?.map((s) => s.name),
    ).toEqual(['__kaiten', 'license', 'slug']);
  });

  // The two spellings of a map read are the same lookup, and hovering the
  // key inside the quotes deserves the same answer as the dotted form.
  it('reads an index key from inside its quotes', () => {
    expect(
      hoverPathAt("__kaiten.entitlements['seats", 'seats')?.map(
        (s) => s.name,
      ),
    ).toEqual(['__kaiten', 'entitlements', 'seats']);
  });

  it('says nothing inside an ordinary string', () => {
    expect(hoverPathAt("x == 'scale", 'scale')).toBeNull();
  });
});

describe('resolveNode', () => {
  const resolve = (text: string) => resolveNode(roots, scanChain(text) ?? []);

  it('walks to a leaf', () => {
    expect(resolve('__kaiten.license.slug')?.type).toBe('string');
  });

  // Both forms are the same lookup at evaluation, so both have to land on the
  // same shape here.
  it.each([
    "__kaiten.entitlements['seats'].remaining",
    '__kaiten.entitlements.seats.remaining',
    '__kaiten.entitlements[someVar].remaining',
  ])('reaches an entitlement field via %s', (text) => {
    expect(resolve(text)?.type).toBe('number');
  });

  it('stops where the description stops', () => {
    expect(resolve('__kaiten.license.nope')).toBeNull();
    expect(resolve('unknownRoot.field')).toBeNull();
    // A string has nothing below it.
    expect(resolve('__kaiten.license.slug.nope')).toBeNull();
  });

  // Free-form metadata is a map of anything: the editor should say "dyn"
  // rather than invent fields under it.
  it('resolves free-form metadata to an undeclared value', () => {
    expect(resolve('__kaiten.instance.metadata.whatever')?.type).toBe('dyn');
  });

  // An object is a map at evaluation, so indexing one by a literal is a
  // legitimate way to read a field.
  it('resolves a literal index into an object', () => {
    expect(resolve("__kaiten.license['slug']")?.type).toBe('string');
  });

  it('cannot resolve a computed index into an object', () => {
    expect(resolve('__kaiten.license[someVar]')).toBeNull();
  });
});
