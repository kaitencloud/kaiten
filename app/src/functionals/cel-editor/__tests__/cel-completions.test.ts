import { describe, it, expect } from 'vite-plus/test';
import { hoverFor, proposalsFor } from '../logic/cel-completions';
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
    it.each(["x == '", "x == 'sca", "x == 'scale'", '1.'])(
      'offers nothing at %s',
      (text) => {
        expect(labelsAt(text)).toEqual([]);
      },
    );
  });

  describe('inside an index', () => {
    it('offers the keys, and only the keys', () => {
      expect(labelsAt("__kaiten.entitlements['")).toEqual([
        'seats',
        'customers',
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
