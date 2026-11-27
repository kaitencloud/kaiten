import { describe, it, expect } from 'vite-plus/test';
import {
  completionTargetAt,
  hoverPathAt,
  resolveNode,
  scanChain,
} from '../logic/cel-path';
import { comparedLiteralAt } from '../logic/cel-value-position';
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
          {
            name: 'familySlug',
            type: 'string',
            knownValues: [{ value: 'bronze', label: 'Bronze' }],
          },
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
      "__kaiten.license.slug.startsWith('",
      "__kaiten.license.slug.startsWith('sca",
      'device.os.matches("io',
      "x + '",
      "x < '",
    ])('offers nothing inside the literal %s', (text) => {
      expect(completionTargetAt(text)).toEqual({ kind: 'none' });
    });

    it('offers nothing on the quote that closes a string', () => {
      expect(completionTargetAt("__kaiten.license.slug == 'scale'")).toEqual({
        kind: 'none',
      });
    });

    // A comparison is the one place a literal has something to offer.
    it('offers nothing inside a literal compared with something it cannot read', () => {
      expect(completionTargetAt("size(x) == '")).toEqual({ kind: 'none' });
      expect(completionTargetAt("(a || b) != '")).toEqual({ kind: 'none' });
    });

    it('still reads the text after a closed string as what it is', () => {
      const target = completionTargetAt("x == 'a' && __kaiten.");

      expect(target.kind).toBe('member');
      expect(
        target.kind === 'member' && target.path.map((s) => s.name),
      ).toEqual(['__kaiten']);
    });

    it('does not mistake an escaped quote for the end of the string', () => {
      expect(completionTargetAt("x.startsWith('it\\'s ")).toEqual({
        kind: 'none',
      });
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
        dotLength: 1,
      });
    });

    it('treats a closed string literal the same way', () => {
      expect(completionTargetAt("'scale'.")).toEqual({
        kind: 'member',
        path: [],
        prefix: '',
        dotLength: 1,
      });
    });

    it('offers nothing in the middle of a number', () => {
      expect(completionTargetAt('1.')).toEqual({ kind: 'none' });
      expect(completionTargetAt('x > 1.')).toEqual({ kind: 'none' });
    });

    it('keeps a partial name typed after the unreadable dot', () => {
      const target = completionTargetAt('(a || b).sta');

      expect(target).toEqual({
        kind: 'member',
        path: [],
        prefix: 'sta',
        dotLength: 1,
      });
    });
  });
});

describe('after a dot', () => {
  // What a suggestion that is spelled as an index replaces: the dot, and
  // whatever whitespace CEL allows between it and the name.
  it('says how far back the dot is', () => {
    const near = completionTargetAt('__kaiten.entitlements.ai');
    const far = completionTargetAt('__kaiten.entitlements .  ai');

    expect(near.kind === 'member' && near.dotLength).toBe(1);
    expect(far.kind === 'member' && far.dotLength).toBe(3);
  });
});

describe('the value of a comparison', () => {
  const valueAt = (text: string) => {
    const target = completionTargetAt(text);

    return target.kind === 'value'
      ? {
          path: target.path.map((segment) => segment.name).join('.'),
          prefix: target.prefix,
          quote: target.quote,
        }
      : target;
  };

  it.each(['==', '!='])('is the right operand of %s', (operator) => {
    expect(valueAt(`__kaiten.license.familySlug ${operator} `)).toEqual({
      path: '__kaiten.license.familySlug',
      prefix: '',
      quote: null,
    });
  });

  it('keeps the name typed before the quote is opened', () => {
    expect(valueAt('__kaiten.license.familySlug == br')).toEqual({
      path: '__kaiten.license.familySlug',
      prefix: 'br',
      quote: null,
    });
  });

  it.each([
    ["__kaiten.license.familySlug == '", "'", ''],
    ["__kaiten.license.familySlug == 'br", "'", 'br'],
    ['__kaiten.license.familySlug != "br', '"', 'br'],
  ])('is inside an opened quote at %s', (text, quote, prefix) => {
    expect(valueAt(text)).toEqual({
      path: '__kaiten.license.familySlug',
      prefix,
      quote,
    });
  });

  it.each([
    ['__kaiten.license.familySlug in [', '', null],
    ["__kaiten.license.familySlug in ['bronze', ", '', null],
    ["__kaiten.license.familySlug in ['bronze',", '', null],
    ["__kaiten.license.familySlug in ['bronze', 'si", 'si', "'"],
    ['__kaiten.license.familySlug in ["bronze", "si', 'si', '"'],
    ["__kaiten.license.familySlug in ['a,b', 'it\\'s', ", '', null],
  ])('is an element of the list at %s', (text, prefix, quote) => {
    expect(valueAt(text)).toEqual({
      path: '__kaiten.license.familySlug',
      prefix,
      quote,
    });
  });

  it('reads the name through an index', () => {
    expect(valueAt("__kaiten.entitlements['support'].tier == '")).toMatchObject(
      { path: '__kaiten.entitlements.support.tier', quote: "'" },
    );
  });

  it('is found after other clauses of the rule', () => {
    expect(
      valueAt("x == 'a' && __kaiten.license.familySlug == '"),
    ).toMatchObject({ path: '__kaiten.license.familySlug', quote: "'" });
  });

  // `<=` and `>=` compare order, not membership in a set of values.
  it.each([
    '__kaiten.license.familySlug <= ',
    '__kaiten.license.familySlug >= ',
    '__kaiten.license.familySlug < ',
    '__kaiten.license.familySlug + ',
  ])('is not the right operand of %s', (text) => {
    expect(completionTargetAt(text).kind).toBe('root');
  });

  it.each([
    // A list that is not the right operand of `in`.
    "x = [",
    "has(a, [",
    // `in` must be the keyword, not the end of a name.
    "__kaiten.license.min [",
    // An element that is not a literal ends what can be read.
    "__kaiten.license.familySlug in [other, ",
    // An index is not a list.
    "__kaiten.entitlements[",
  ])('is not a value at %s', (text) => {
    expect(completionTargetAt(text).kind).not.toBe('value');
  });

  it('leaves a literal of a call alone', () => {
    expect(completionTargetAt("__kaiten.license.familySlug.startsWith('")).toEqual({
      kind: 'none',
    });
  });
});

describe('comparedLiteralAt', () => {
  const compared = (line: string, offset: number) => {
    const found = comparedLiteralAt(line, offset);

    return found
      ? { path: found.path.map((s) => s.name).join('.'), value: found.value }
      : null;
  };

  it('finds the literal after == and !=', () => {
    const line = "__kaiten.license.familySlug == 'bronze'";

    expect(compared(line, line.indexOf('bronze') + 2)).toEqual({
      path: '__kaiten.license.familySlug',
      value: 'bronze',
    });
    expect(
      compared("__kaiten.license.familySlug != 'bronze'", 34),
    ).toMatchObject({ value: 'bronze' });
  });

  it('finds the literal before the name, in either order', () => {
    expect(compared("'bronze' == __kaiten.license.familySlug", 3)).toEqual({
      path: '__kaiten.license.familySlug',
      value: 'bronze',
    });
    expect(compared("'bronze' != __kaiten.license.familySlug", 3)).toEqual({
      path: '__kaiten.license.familySlug',
      value: 'bronze',
    });
  });

  it('finds each element of a list', () => {
    const line = "__kaiten.license.familySlug in ['bronze', 'silver']";

    expect(compared(line, line.indexOf('bronze'))).toMatchObject({
      value: 'bronze',
    });
    expect(compared(line, line.indexOf('silver'))).toMatchObject({
      value: 'silver',
    });
  });

  it('spans the whole literal, quotes included', () => {
    const line = "a.b == 'bronze' && c";
    const found = comparedLiteralAt(line, 10);

    expect(line.slice(found?.start, found?.end)).toBe("'bronze'");
  });

  it('unescapes what the literal spells', () => {
    expect(compared("a.b == 'it\\'s'", 9)).toEqual({
      path: 'a.b',
      value: "it's",
    });
  });

  it('is not a literal outside the quotes', () => {
    expect(comparedLiteralAt("a.b == 'bronze'", 3)).toBeNull();
  });

  // A literal is only about a name when it is compared with it.
  it.each([
    "__kaiten.license.familySlug.startsWith('bro')",
    "__kaiten.entitlements['seats'].remaining > 1",
    "'bronze' == size(x)",
    "'bronze' == a.b()",
    "x + 'bronze'",
  ])('says nothing about %s', (line) => {
    expect(comparedLiteralAt(line, line.indexOf("'") + 2)).toBeNull();
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
    expect(hoverPathAt("x.startsWith('scale", 'scale')).toBeNull();
  });

  // A name written where a value could be is still a name.
  it('reads a name compared with another', () => {
    expect(
      hoverPathAt('x == __kaiten.license', 'license')?.map((s) => s.name),
    ).toEqual(['__kaiten', 'license']);
    expect(hoverPathAt('x == targetingKey', 'targetingKey')?.map((s) => s.name)).toEqual([
      'targetingKey',
    ]);
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

// `__kaiten.entitlements` holds a different shape under each key: a NUMBER
// entitlement is an object, a BOOLEAN one a boolean, a CONFIG one a map.
describe('resolveNode on a map whose entries differ', () => {
  const typed: CelContextNode[] = [
    {
      name: '__kaiten',
      type: 'object',
      fields: [
        {
          name: 'entitlements',
          type: 'map',
          knownKeys: ['seats', 'sso', 'support'],
          entries: [
            {
              name: 'seats',
              type: 'object',
              fields: [{ name: 'remaining', type: 'number' }],
            },
            { name: 'sso', type: 'boolean' },
            {
              name: 'support',
              type: 'map',
              values: { name: '', type: 'dyn' },
            },
          ],
        },
      ],
    },
  ];
  const resolve = (text: string) => resolveNode(typed, scanChain(text) ?? []);

  it.each([
    ["__kaiten.entitlements['seats']", 'object'],
    ['__kaiten.entitlements.seats.remaining', 'number'],
    ["__kaiten.entitlements['sso']", 'boolean'],
    ["__kaiten.entitlements['support'].tier", 'dyn'],
  ])('lands %s on its own shape', (text, type) => {
    expect(resolve(text)?.type).toBe(type);
  });

  // There is no shape the entries share, so neither a bool's fields nor an
  // unknown key's are invented.
  it('stops where the entry stops', () => {
    expect(resolve("__kaiten.entitlements['sso'].limit")).toBeNull();
    expect(resolve("__kaiten.entitlements['sieges'].remaining")).toBeNull();
    expect(resolve('__kaiten.entitlements[someVar]')).toBeNull();
  });
});
