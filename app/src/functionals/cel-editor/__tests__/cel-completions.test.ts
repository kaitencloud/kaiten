import { describe, it, expect } from 'vite-plus/test';
import {
  hoverFor,
  hoverForValue,
  proposalsFor,
} from '../logic/cel-completions';
import { completionTargetAt, scanChain } from '../logic/cel-path';
import type { CelContextNode } from '../types/cel-context.types';

const roots: CelContextNode[] = [
  {
    name: '__kaiten',
    type: 'object',
    description: 'Facts the server computes.',
    fields: [
      {
        name: 'license',
        type: 'object',
        fields: [
          { name: 'slug', type: 'string', description: 'License slug.' },
          { name: 'type', type: 'string' },
          {
            name: 'familySlug',
            type: 'string',
            description: 'Slug of the plan.',
            knownValues: [
              { value: 'bronze', label: 'Bronze' },
              {
                value: 'silver',
                label: 'Silver',
                description: 'The middle plan.',
              },
              { value: "o'neil", label: "O'Neil" },
            ],
          },
        ],
      },
      {
        name: 'entitlements',
        type: 'map',
        knownKeys: ['seats', 'customers', 'ai-credits', 'in'],
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
        name: 'customer',
        type: 'object',
        fields: [
          {
            name: 'domain',
            type: 'string',
            optional: true,
            description: 'Email domain.',
          },
        ],
      },
    ],
  },
  { name: 'targetingKey', type: 'string' },
];

const labelsAt = (text: string) =>
  proposalsFor(completionTargetAt(text), roots).map((p) => p.label);

const proposalAt = (text: string, label: string) =>
  proposalsFor(completionTargetAt(text), roots).find((p) => p.label === label);

describe('proposalsFor', () => {
  describe('at the start of a rule', () => {
    it('offers the roots the server guarantees', () => {
      expect(labelsAt('')).toContain('__kaiten');
      expect(labelsAt('')).toContain('targetingKey');
    });

    it('offers CEL literals and global callables', () => {
      const labels = labelsAt('');

      expect(labels).toContain('true');
      expect(labels).toContain('has');
      expect(labels).toContain('timestamp');
    });

    /*
    Reserved words cannot be identifiers and cannot be called, so suggesting
    them only ever produces a rule that does not parse. The old provider
    offered the whole reserved list, which put `while` and `import` in the
    dropdown of a boolean expression.
    */
    it('never offers reserved words', () => {
      const labels = labelsAt('');

      for (const reserved of ['while', 'import', 'for', 'if', 'return']) {
        expect(labels).not.toContain(reserved);
      }
    });

    it('puts the context above CEL vocabulary', () => {
      const context = proposalAt('', '__kaiten');
      const callable = proposalAt('', 'timestamp');

      expect(context!.sortText < callable!.sortText).toBe(true);
    });
  });

  describe('after a dot', () => {
    it('offers the fields of an object, several levels down', () => {
      expect(labelsAt('__kaiten.')).toContain('license');
      expect(labelsAt('__kaiten.license.')).toEqual(
        expect.arrayContaining(['slug', 'type']),
      );
    });

    it('offers the entitlement slugs the organization actually has', () => {
      expect(labelsAt('__kaiten.entitlements.')).toEqual(
        expect.arrayContaining(['seats', 'customers']),
      );
    });

    // `entitlements.ai-credits` reads as `entitlements.ai - credits`, which
    // is a subtraction and never the entitlement. Such a key can only be
    // written as an index, and the suggestion takes the dot with it.
    describe('a key that cannot follow a dot', () => {
      it('is offered as an index that replaces the dot', () => {
        const credits = proposalAt('__kaiten.entitlements.', 'ai-credits');

        expect(credits?.insertText).toBe("['ai-credits']");
        expect(credits?.replacesDot).toBe(true);
      });

      it('keeps the label the author filters on', () => {
        expect(proposalAt('__kaiten.entitlements.ai', 'ai-credits')?.label).toBe(
          'ai-credits',
        );
      });

      it('applies to a word CEL reserves, which is no field name either', () => {
        expect(proposalAt('__kaiten.entitlements.', 'in')?.insertText).toBe(
          "['in']",
        );
      });

      it('escapes what would end the literal', () => {
        const quoted: CelContextNode[] = [
          {
            name: 'm',
            type: 'map',
            knownKeys: ["it's", 'back\\slash'],
          },
        ];
        const insert = (key: string) =>
          proposalsFor(completionTargetAt('m.'), quoted).find(
            (p) => p.label === key,
          )?.insertText;

        expect(insert("it's")).toBe("['it\\'s']");
        expect(insert('back\\slash')).toBe("['back\\\\slash']");
      });

      it('leaves a key that is a plain identifier after the dot', () => {
        const seats = proposalAt('__kaiten.entitlements.', 'seats');

        expect(seats?.insertText).toBe('seats');
        expect(seats?.replacesDot).toBe(false);
      });
    });

    it('offers the fields of an entitlement below its key', () => {
      expect(labelsAt("__kaiten.entitlements['seats'].")).toEqual(
        expect.arrayContaining(['remaining', 'unlimited']),
      );
    });

    /*
    The functions offered used to be the same list everywhere, and five of them
    (toLowerCase, toUpperCase, trim, split, substring) belong to a CEL
    extension the server does not enable — so the editor suggested them and the
    save refused them.
    */
    it('never offers functions the server does not have', () => {
      const labels = labelsAt('__kaiten.license.slug.');

      for (const absent of ['toLowerCase', 'trim', 'split', 'substring']) {
        expect(labels).not.toContain(absent);
      }
    });

    it('offers string functions on a string', () => {
      expect(labelsAt('__kaiten.license.slug.')).toEqual(
        expect.arrayContaining(['startsWith', 'endsWith', 'matches']),
      );
    });

    it('offers nothing callable on a number', () => {
      expect(labelsAt("__kaiten.entitlements['seats'].remaining.")).toEqual([]);
    });

    it('offers the iteration macros on a map', () => {
      expect(labelsAt('__kaiten.entitlements.')).toEqual(
        expect.arrayContaining(['exists', 'all']),
      );
    });

    /*
    A host targets on attributes the server has never heard of, and those rules
    are accepted. Going silent there would be the editor claiming the world is
    closed when it is not.
    */
    it('falls back to CEL vocabulary for a name it does not know', () => {
      const labels = labelsAt('user.');

      expect(labels).toEqual(expect.arrayContaining(['startsWith', 'exists']));
    });

    it('treats a dot off an unreadable value the same way', () => {
      expect(labelsAt('(a || b).')).toEqual(
        expect.arrayContaining(['startsWith', 'exists']),
      );
    });
  });

  describe('where nothing should be offered', () => {
    it.each(["x == '", "x == 'sca", "x == 'scale'", '1.', "x.startsWith('"])(
      'offers nothing at %s',
      (text) => {
        expect(labelsAt(text)).toEqual([]);
      },
    );
  });

  describe('the value of a comparison', () => {
    const family = '__kaiten.license.familySlug';
    const values = (text: string) =>
      proposalsFor(completionTargetAt(text), roots).filter(
        (p) => p.kind === 'value',
      );

    it.each(['==', '!='])('offers the known values after %s', (operator) => {
      expect(values(`${family} ${operator} `).map((p) => p.label)).toEqual([
        'bronze',
        'silver',
        "o'neil",
      ]);
    });

    it('inserts the quoted literal when no quote is open', () => {
      expect(
        proposalAt(`${family} == `, 'bronze')?.insertText,
      ).toBe("'bronze'");
      expect(proposalAt(`${family} == br`, 'bronze')?.insertText).toBe(
        "'bronze'",
      );
    });

    it('escapes the quote a value contains', () => {
      expect(proposalAt(`${family} == `, "o'neil")?.insertText).toBe(
        "'o\\'neil'",
      );
      expect(proposalAt(`${family} == "`, "o'neil")?.insertText).toBe(
        "o'neil",
      );
      expect(proposalAt(`${family} == '`, "o'neil")?.insertText).toBe(
        "o\\'neil",
      );
    });

    // The quote is already typed, so the value goes in bare. Quoting it again
    // is what produced `''bronze''`.
    it('inserts the bare value inside an opened quote', () => {
      expect(proposalAt(`${family} == '`, 'bronze')?.insertText).toBe('bronze');
      expect(proposalAt(`${family} == 'br`, 'bronze')?.insertText).toBe(
        'bronze',
      );
      expect(proposalAt(`${family} != "si`, 'silver')?.insertText).toBe(
        'silver',
      );
    });

    it('offers only the values inside an opened quote', () => {
      expect(
        proposalsFor(completionTargetAt(`${family} == '`), roots).map(
          (p) => p.label,
        ),
      ).toEqual(['bronze', 'silver', "o'neil"]);
    });

    it('offers them for each element of a list', () => {
      expect(values(`${family} in [`).map((p) => p.label)).toContain('silver');
      expect(values(`${family} in ['bronze', `).map((p) => p.label)).toContain(
        'silver',
      );
      expect(
        proposalAt(`${family} in ['bronze', '`, 'silver')?.insertText,
      ).toBe('silver');
      expect(proposalAt(`${family} in ['bronze', `, 'silver')?.insertText).toBe(
        "'silver'",
      );
    });

    it('shows the label beside the value and the description as documentation', () => {
      const silver = proposalAt(`${family} == `, 'silver');

      expect(silver?.detail).toBe('Silver');
      expect(silver?.documentation).toBe('The middle plan.');
      expect(proposalAt(`${family} == `, 'bronze')?.documentation).toBe(
        undefined,
      );
    });

    it('puts the values above everything else', () => {
      const all = proposalsFor(completionTargetAt(`${family} == `), roots);
      const bronze = all.find((p) => p.label === 'bronze')!;

      for (const other of all.filter((p) => p.kind !== 'value')) {
        expect(bronze.sortText < other.sortText).toBe(true);
      }
    });

    // Unquoted, the author may be about to write another name instead.
    it('still offers the roots where a name could be written', () => {
      expect(
        proposalsFor(completionTargetAt(`${family} == `), roots).map(
          (p) => p.label,
        ),
      ).toEqual(expect.arrayContaining(['__kaiten', 'targetingKey', 'true']));
    });

    // Nothing is known about it, so the editor behaves as it always did.
    describe('on a name with no known values', () => {
      it('offers the roots where no quote is open', () => {
        const labels = labelsAt('__kaiten.license.slug == ');

        expect(labels).toEqual(expect.arrayContaining(['__kaiten', 'true']));
        expect(
          proposalsFor(completionTargetAt('__kaiten.license.slug == '), roots)
            .filter((p) => p.kind === 'value'),
        ).toEqual([]);
      });

      it.each(["'", "'sca", '"'])('offers nothing inside a quote: %s', (typed) => {
        expect(labelsAt(`__kaiten.license.slug == ${typed}`)).toEqual([]);
        expect(labelsAt(`user.plan != ${typed}`)).toEqual([]);
      });
    });
  });

  describe('inside an index', () => {
    it('offers the keys, and only the keys', () => {
      expect(labelsAt("__kaiten.entitlements['")).toEqual([
        'seats',
        'customers',
        'ai-credits',
        'in',
      ]);
    });

    it('inserts the bare key, since the quote is already typed', () => {
      expect(proposalAt("__kaiten.entitlements['sea", 'seats')!.insertText).toBe(
        'seats',
      );
    });

    it('offers nothing inside an index on something that is not a map', () => {
      expect(labelsAt("__kaiten.license['")).toEqual([]);
    });
  });

  describe('what a suggestion inserts', () => {
    it('leaves the caret inside the brackets of a callable', () => {
      expect(proposalAt('', 'has')!.insertText).toBe('has(${1:field})');
      expect(proposalAt('__kaiten.license.slug.', 'startsWith')!.insertText).toBe(
        "startsWith(${1:'value'})",
      );
      expect(proposalAt('__kaiten.entitlements.', 'exists')!.insertText).toBe(
        'exists(${1:item}, ${2:condition})',
      );
    });

    it('closes the brackets of a callable that takes nothing', () => {
      expect(proposalAt('__kaiten.license.slug.', 'size')!.insertText).toBe(
        'size()',
      );
    });

    it('carries the type and the description of a field', () => {
      const slug = proposalAt('__kaiten.license.', 'slug');

      expect(slug!.detail).toBe('string');
      expect(slug!.documentation).toBe('License slug.');
    });

    // CEL raises on a missing field rather than returning false, so an author
    // needs to know which ones can be absent.
    it('says when a value may be absent', () => {
      expect(proposalAt('__kaiten.customer.', 'domain')!.detail).toContain(
        'may be absent',
      );
    });
  });
});

describe('hoverForValue', () => {
  const hover = (text: string, value: string) =>
    hoverForValue(scanChain(text) ?? [], value, roots);

  it('names the field and what the value is', () => {
    expect(hover('__kaiten.license.familySlug', 'silver')).toEqual({
      title: '__kaiten.license.familySlug',
      label: 'Silver',
      description: 'The middle plan.',
    });
    expect(hover('__kaiten.license.familySlug', 'bronze')).toMatchObject({
      label: 'Bronze',
    });
  });

  // An unknown value is the check's to report.
  it('says nothing about a literal that is not known', () => {
    expect(hover('__kaiten.license.familySlug', 'gold')).toBeNull();
  });

  it('says nothing about a name that has no known values', () => {
    expect(hover('__kaiten.license.slug', 'bronze')).toBeNull();
    expect(hover('user.plan', 'bronze')).toBeNull();
  });
});

describe('hoverFor', () => {
  const hover = (text: string) => hoverFor(scanChain(text) ?? [], roots);

  it('names the value and its type', () => {
    expect(hover('__kaiten.license.slug')).toMatchObject({
      title: '__kaiten.license.slug',
      type: 'string',
      description: 'License slug.',
    });
  });

  it('reaches through an entitlement key', () => {
    expect(hover("__kaiten.entitlements['seats'].remaining")?.type).toBe(
      'number',
    );
  });

  it('tells an author to guard a value that may be absent', () => {
    expect(hover('__kaiten.customer.domain')?.description).toContain('has()');
  });

  // Saying nothing is the honest answer for a name nobody described.
  it('says nothing about a name it does not know', () => {
    expect(hover('user.cohort')).toBeNull();
    expect(hover('__kaiten.license.nope')).toBeNull();
  });
});

describe('proposalsFor on a map whose entries differ', () => {
  const typed: CelContextNode[] = [
    {
      name: '__kaiten',
      type: 'object',
      fields: [
        {
          name: 'entitlements',
          type: 'map',
          knownKeys: ['seats', 'sso'],
          entries: [
            {
              name: 'seats',
              type: 'object',
              fields: [{ name: 'remaining', type: 'number' }],
            },
            { name: 'sso', type: 'boolean', description: 'Granted or not.' },
          ],
        },
      ],
    },
  ];
  const proposal = (text: string, label: string) =>
    proposalsFor(completionTargetAt(text), typed).find(
      (p) => p.label === label,
    );

  it('details each key with its own shape', () => {
    expect(proposal("__kaiten.entitlements['", 'seats')?.detail).toBe('object');
    expect(proposal("__kaiten.entitlements['", 'sso')?.detail).toBe('boolean');
    expect(proposal('__kaiten.entitlements.', 'sso')?.documentation).toBe(
      'Granted or not.',
    );
  });

  it("offers a quantity's fields, and none on a capability", () => {
    expect(
      proposalsFor(
        completionTargetAt("__kaiten.entitlements['seats']."),
        typed,
      ).map((p) => p.label),
    ).toContain('remaining');
    expect(
      proposalsFor(
        completionTargetAt("__kaiten.entitlements['sso']."),
        typed,
      ).map((p) => p.label),
    ).not.toContain('remaining');
  });
});
