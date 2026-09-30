import {
  extractTranslationKeys,
  findMissingKeys,
  hasTranslation,
  isExcluded,
  type KeyUsage,
  type LocaleTree,
} from './check-i18n-keys';

const ROOTS = ['Common', 'Pages'];

function extract(source: string, fileName = 'component.tsx') {
  return extractTranslationKeys(`/virtual/src/${fileName}`, source, ROOTS);
}

function keysOf(source: string, fileName?: string) {
  return extract(source, fileName).usages.map((usage) => usage.key);
}

describe('extractTranslationKeys', () => {
  test('collects t(), <x>.t() and tr() calls with their line', () => {
    const { usages, dynamicCount } = extract(
      [
        'const a = t("Pages.a.title", "Title");',
        '',
        'const b = i18n.t(\'Pages.b.title\');',
        'const c = tr(`Pages.c.title`, "Fallback");',
      ].join('\n'),
    );

    expect(
      usages.map(({ key, line, kind }) => ({ key, line, kind })),
    ).toEqual([
      { key: 'Pages.a.title', line: 1, kind: 'call' },
      { key: 'Pages.b.title', line: 3, kind: 'call' },
      { key: 'Pages.c.title', line: 4, kind: 'call' },
    ]);
    expect(dynamicCount).toBe(0);
  });

  test('keeps the inline default, given as a string or as defaultValue', () => {
    const { usages } = extract(
      [
        't("Pages.a", "Plain default");',
        't("Pages.b", { defaultValue: "Option default", count: 2 });',
        't("Pages.c", "Third default", { percent });',
        't("Pages.d", { count });',
        't("Pages.e");',
      ].join('\n'),
    );

    expect(usages.map((usage) => usage.defaultValue)).toEqual([
      'Plain default',
      'Option default',
      'Third default',
      undefined,
      undefined,
    ]);
  });

  test('records the context option, which lets key_<context> answer', () => {
    const { usages } = extract(
      't("Pages.a", { context: kind }); t("Pages.b", { count: 1 });',
    );

    expect(usages.map((usage) => usage.hasContext)).toEqual([true, false]);
  });

  test('reads each branch of a conditional or logical key', () => {
    const { usages, dynamicCount } = extract(
      [
        't(ok ? "Pages.yes" : "Pages.no");',
        't(a ? "Pages.first" : b ? "Pages.second" : "Pages.third");',
        't(message || "Pages.fallback");',
        't(errors[0] || "");',
      ].join('\n'),
    );

    expect(usages.map((usage) => usage.key)).toEqual([
      'Pages.yes',
      'Pages.no',
      'Pages.first',
      'Pages.second',
      'Pages.third',
      'Pages.fallback',
    ]);
    expect(dynamicCount).toBe(2);
  });

  test('sees through parentheses and TypeScript assertions', () => {
    expect(
      keysOf(
        [
          't(("Pages.paren"));',
          't("Pages.const" as const);',
          't("Pages.satisfies" satisfies string);',
          't("Pages.nonNull"!);',
        ].join('\n'),
      ),
    ).toEqual([
      'Pages.paren',
      'Pages.const',
      'Pages.satisfies',
      'Pages.nonNull',
    ]);
  });

  test('counts keys built at runtime instead of collecting them', () => {
    const { usages, dynamicCount } = extract(
      [
        't(key);',
        't(`Pages.${section}.title`);',
        't(TABLE[status]);',
        't(getKey());',
        't("Pages." + name);',
        't(...args);',
        'i18n.t(errorKey);',
      ].join('\n'),
    );

    expect(usages).toEqual([]);
    expect(dynamicCount).toBe(7);
  });

  test('ignores calls that are not translation calls', () => {
    expect(
      keysOf(
        [
          'translate(key);',
          'format("something");',
          'other.tx("x.y");',
          'const t = 1;',
          't();',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  test('ignores an empty key', () => {
    const { usages, dynamicCount } = extract('t("");');

    expect(usages).toEqual([]);
    expect(dynamicCount).toBe(0);
  });

  test('collects the i18nKey prop of Trans', () => {
    const { usages, dynamicCount } = extract(
      [
        'const view = (',
        '  <>',
        '    <Trans i18nKey="Pages.plain" />',
        '    <Trans i18nKey={"Pages.braced"} />',
        '    <Trans i18nKey={ok ? "Pages.yes" : "Pages.no"} />',
        '    <Trans i18nKey={runtimeKey} />',
        '    <Trans i18n="not a key" />',
        '  </>',
        ');',
      ].join('\n'),
    );

    expect(
      usages.map(({ key, line, kind }) => ({ key, line, kind })),
    ).toEqual([
      { key: 'Pages.plain', line: 3, kind: 'i18nKey' },
      { key: 'Pages.braced', line: 4, kind: 'i18nKey' },
      { key: 'Pages.yes', line: 5, kind: 'i18nKey' },
      { key: 'Pages.no', line: 5, kind: 'i18nKey' },
    ]);
    expect(dynamicCount).toBe(1);
  });

  test('collects a key stored in a table, once', () => {
    const { usages } = extract(
      [
        'const LABELS = {',
        '  active: "Pages.status.active",',
        '  idle: `Pages.status.idle`,',
        '};',
        'const label = t("Pages.status.direct");',
      ].join('\n'),
      'labels.ts',
    );

    expect(
      usages.map(({ key, line, kind }) => ({ key, line, kind })),
    ).toEqual([
      { key: 'Pages.status.active', line: 2, kind: 'table' },
      { key: 'Pages.status.idle', line: 3, kind: 'table' },
      { key: 'Pages.status.direct', line: 5, kind: 'call' },
    ]);
  });

  test('takes only namespaced, well-formed literals for stored keys', () => {
    expect(
      keysOf(
        [
          'const a = "Pages.";',
          'const b = "Pages";',
          'const c = "Unknown.namespace.key";',
          'const d = "Pages.with space";',
          'const e = "pages.lowercase.root";',
          'const f = "see Pages.a.b for details";',
          'const g = `Pages.${x}`;',
        ].join('\n'),
        'strings.ts',
      ),
    ).toEqual([]);
  });

  test('collects a key given to any other prop, as a stored key', () => {
    const { usages } = extract('<Card titleKey="Pages.card.title" />');

    expect(usages.map(({ key, kind }) => ({ key, kind }))).toEqual([
      { key: 'Pages.card.title', kind: 'table' },
    ]);
  });

  test('parses plain TypeScript as well as TSX', () => {
    expect(
      keysOf('const label = <string>t("Pages.generic");', 'helper.ts'),
    ).toEqual(['Pages.generic']);
  });

  test('throws on a file it cannot parse, so it is never skipped silently', () => {
    expect(() => extract('t("Pages.a"', 'broken.tsx')).toThrow('broken.tsx');
  });
});

describe('hasTranslation', () => {
  const tree: LocaleTree = {
    Common: {
      save: 'Save',
      rules_one: '{{count}} rule',
      rules_other: '{{count}} rules',
      gender_male: 'He',
      nested: { deep: 'Deep' },
    },
  };

  test('finds a string at the path', () => {
    expect(hasTranslation(tree, 'Common.save')).toBe(true);
    expect(hasTranslation(tree, 'Common.nested.deep')).toBe(true);
  });

  test('does not find what is absent', () => {
    expect(hasTranslation(tree, 'Common.cancel')).toBe(false);
    expect(hasTranslation(tree, 'Nope.save')).toBe(false);
    expect(hasTranslation(tree, 'Common.save.deeper')).toBe(false);
    expect(hasTranslation(tree, 'Common.nested.missing')).toBe(false);
  });

  test('does not read inherited object properties as keys', () => {
    expect(hasTranslation(tree, 'Common.constructor')).toBe(false);
    expect(hasTranslation(tree, 'toString')).toBe(false);
    expect(hasTranslation(tree, 'Common.__proto__')).toBe(false);
    expect(
      hasTranslation(tree, 'Common.__proto__', { allowNamespace: true }),
    ).toBe(false);
  });

  test('takes a plural form as the key', () => {
    expect(hasTranslation(tree, 'Common.rules')).toBe(true);
  });

  test('takes a context form only when the call passes a context', () => {
    expect(hasTranslation(tree, 'Common.gender')).toBe(false);
    expect(hasTranslation(tree, 'Common.gender', { allowContext: true })).toBe(
      true,
    );
  });

  test('takes a namespace only for a stored key literal', () => {
    expect(hasTranslation(tree, 'Common.nested')).toBe(false);
    expect(hasTranslation(tree, 'Common.nested', { allowNamespace: true })).toBe(
      true,
    );
    expect(hasTranslation(tree, 'Common.other', { allowNamespace: true })).toBe(
      false,
    );
  });
});

describe('findMissingKeys', () => {
  const tree: LocaleTree = {
    Common: { save: 'Save', rules_other: 'rules', group: { a: 'A' } },
  };

  function usage(overrides: Partial<KeyUsage> & { key: string }): KeyUsage {
    return { file: 'a.tsx', line: 1, kind: 'call', ...overrides };
  }

  test('returns the usages whose key en does not have', () => {
    const present = usage({ key: 'Common.save' });
    const missing = usage({ key: 'Common.cancel', defaultValue: 'Cancel' });

    expect(findMissingKeys(tree, [present, missing])).toEqual([missing]);
  });

  test('flags a namespace passed to t() but not one stored as a table key', () => {
    const called = usage({ key: 'Common.group', kind: 'call' });
    const stored = usage({ key: 'Common.group', kind: 'table' });

    expect(findMissingKeys(tree, [called, stored])).toEqual([called]);
  });

  test('accepts plural forms, and context forms when a context is passed', () => {
    const tree: LocaleTree = { Common: { a_other: 'x', b_formal: 'y' } };
    const plural = usage({ key: 'Common.a' });
    const withoutContext = usage({ key: 'Common.b' });
    const withContext = usage({ key: 'Common.b', hasContext: true });

    expect(findMissingKeys(tree, [plural, withoutContext, withContext])).toEqual(
      [withoutContext],
    );
  });
});

describe('isExcluded', () => {
  test.each([
    'lib/i18n/locales/en.ts',
    'api-client/sdk.gen.ts',
    'lib/api/scopes.gen.ts',
    'routeTree.gen.ts',
    'features/x/foo.test.tsx',
    'features/x/__tests__/helpers.tsx',
    'features/x/foo.stories.tsx',
    'features/x/stories/data.ts',
  ])('skips %s', (path) => {
    expect(isExcluded(path)).toBe(true);
  });

  test.each([
    'features/x/components/foo.tsx',
    'lib/i18n/config.ts',
    'domains/audit-trail/audit-trail-events.ts',
    'e2e/handlers.ts',
  ])('scans %s', (path) => {
    expect(isExcluded(path)).toBe(false);
  });
});
