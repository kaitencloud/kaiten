import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { resolveArrival } from '../logic/arrival';
import { classifyOutcome } from '../logic/classify-outcome';
import { restoreValues } from '../logic/restore';
import { ApiError } from '@/lib/errors';

const schema = z.object({
  name: z.string().min(3),
  type: z.enum(['boolean', 'metered']),
  limit: z.number(),
  icon: z.string().optional(),
  saleUnitFactor: z.number().optional(),
  description: z.string().nullable(),
  variants: z.array(z.object({ key: z.string() })).nullable(),
  grants: z.array(z.object({ key: z.string(), priceId: z.enum(['p1', 'p2']) })),
  licenseDate: z.object({ from: z.date(), to: z.date().nullable() }),
  metadata: z.record(z.string(), z.string()),
});

type Values = z.infer<typeof schema>;

// Real defaults of the forms this was designed for: a blank number field is
// NaN, a required enum starts at '', and some values start null or undefined.
const pristine = (): Values => ({
  name: '',
  type: '' as unknown as Values['type'],
  limit: Number.NaN,
  icon: undefined,
  saleUnitFactor: undefined,
  description: null,
  variants: null,
  grants: [],
  licenseDate: { from: new Date(2026, 9, 23), to: null },
  metadata: {},
});

const context = { pristine: pristine(), schema, omit: [] as string[] };

describe('restoreValues', () => {
  it('restores a value whose initial value is null or undefined, from the schema', () => {
    const outcome = restoreValues(
      [
        ['variants', [{ key: 'on' }]],
        ['description', 'A text'],
        ['icon', 'Rocket'],
        ['saleUnitFactor', 5],
      ],
      context,
    );

    expect(outcome.values.variants).toEqual([{ key: 'on' }]);
    expect(outcome.values.description).toBe('A text');
    expect(outcome.values.icon).toBe('Rocket');
    expect(outcome.values.saleUnitFactor).toBe(5);
    expect(outcome.notes).toEqual([]);
  });

  it('accepts any value over a null initial value when there is no schema', () => {
    const outcome = restoreValues([['variants', [{ key: 'on' }]]], {
      pristine: pristine(),
      omit: [],
    });

    expect(outcome.values.variants).toEqual([{ key: 'on' }]);
  });

  it('makes no note for an empty number field or an enum still blank', () => {
    const outcome = restoreValues(
      [['name', 'Gold']],
      context,
    );

    // `limit` is NaN and `type` is '' in the blank form too: incomplete, not drifted.
    expect(Number.isNaN(outcome.values.limit)).toBe(true);
    expect(outcome.values.type).toBe('');
    expect(outcome.notes).toEqual([]);
    expect(outcome.resetKeys).toEqual([]);
  });

  it('resets a removed enum value to its initial value, with a note', () => {
    const outcome = restoreValues([['type', 'legacy']], {
      ...context,
      fieldLabels: { type: { key: 'Fields.type' } },
    });

    expect(outcome.values.type).toBe('');
    expect(outcome.notes).toEqual([{ kind: 'reset', field: { key: 'Fields.type' } }]);
    expect(outcome.resetKeys).toEqual(['type']);
  });

  it('names a field with no label by its key', () => {
    const outcome = restoreValues([['type', 'legacy']], context);

    expect(outcome.notes).toEqual([{ kind: 'reset', field: { text: 'type' } }]);
  });

  it('does not apply a value of the wrong shape, and says so', () => {
    const outcome = restoreValues([['description', 42]], context);

    expect(outcome.values.description).toBeNull();
    expect(outcome.notes).toEqual([{ kind: 'reset', field: { text: 'description' } }]);
  });

  it('removes the element of an array that fails, and says so once', () => {
    const outcome = restoreValues(
      [
        [
          'grants',
          [
            { key: 'g1', priceId: 'p1' },
            { key: 'g2', priceId: 'gone' },
            { key: 'g3', priceId: 'p2' },
            { key: 'g4', priceId: 'gone-too' },
          ],
        ],
      ],
      context,
    );

    expect(outcome.values.grants.map((grant) => grant.key)).toEqual(['g1', 'g3']);
    expect(outcome.notes).toEqual([{ kind: 'itemRemoved', field: { text: 'grants' } }]);
    expect(outcome.removedKeys).toEqual(['grants']);
  });

  it('keeps an incomplete value and lists the field as invalid', () => {
    const outcome = restoreValues([['name', 'ab']], context);

    expect(outcome.values.name).toBe('ab');
    expect(outcome.notes).toEqual([]);
    expect(outcome.invalidKeys).toEqual(['name']);
    expect(outcome.changedKeys).toEqual(['name']);
  });

  it('ignores a field the form no longer has', () => {
    const outcome = restoreValues([['retired', 'x']], context);

    expect(outcome.values).toEqual(context.pristine);
    expect(outcome.notes).toEqual([]);
  });

  it('keeps an omitted path at its initial value even if an older version wrote it', () => {
    const outcome = restoreValues([['metadata.apiKey', 'sk']], {
      ...context,
      omit: ['metadata.apiKey'],
    });

    expect(outcome.values.metadata).toEqual({});
  });

  it('makes no note when the stored value equals the value that replaces it', () => {
    // '' on the enum fails in the blank form too: not a drift, nothing to say.
    const outcome = restoreValues([['type', '']], context);

    expect(outcome.notes).toEqual([]);
  });

  it('replays on the initial values of today', () => {
    const today = { ...pristine(), licenseDate: { from: new Date(2026, 9, 30), to: null } };

    const outcome = restoreValues([['name', 'Gold']], { ...context, pristine: today });

    expect(outcome.values.licenseDate.from).toEqual(new Date(2026, 9, 30));
  });
});

describe('resolveArrival', () => {
  const steps = ['identity', 'type', 'review'];
  const stepFields = { identity: ['name'], type: ['type', 'limit'], review: [] };
  const base = {
    steps,
    stepFields,
    problemKeys: [] as string[],
    omittedFilled: [] as string[],
  };

  it('lands on the stored step', () => {
    expect(
      resolveArrival({
        ...base,
        stored: { stepId: 'type', furthestStepId: 'review', stepIds: steps },
      }),
    ).toEqual({ stepIndex: 1, furthestIndex: 2 });
  });

  it('lands on 0 for a single page', () => {
    expect(
      resolveArrival({
        ...base,
        steps: [],
        stored: { stepId: null, furthestStepId: null, stepIds: null },
      }),
    ).toEqual({ stepIndex: 0, furthestIndex: 0 });
  });

  it('falls back to the closest earlier step that still exists when the step is gone', () => {
    expect(
      resolveArrival({
        ...base,
        steps: ['identity', 'review'],
        stored: {
          stepId: 'metadata',
          furthestStepId: 'metadata',
          stepIds: ['identity', 'type', 'metadata', 'review'],
        },
      }),
    ).toEqual({ stepIndex: 0, furthestIndex: 0 });
  });

  it('falls back to the first step when nothing of the entry exists any more', () => {
    expect(
      resolveArrival({
        ...base,
        stored: { stepId: 'gone', furthestStepId: null, stepIds: null },
      }),
    ).toEqual({ stepIndex: 0, furthestIndex: 0 });
  });

  it('goes back to the first earlier step that holds a field to correct', () => {
    expect(
      resolveArrival({
        ...base,
        problemKeys: ['name'],
        stored: { stepId: 'review', furthestStepId: 'review', stepIds: steps },
      }),
    ).toEqual({ stepIndex: 0, furthestIndex: 2 });
  });

  it('goes back to the step of a never-kept field the person had filled in', () => {
    expect(
      resolveArrival({
        ...base,
        steps: ['type', 'eligibility', 'review'],
        stepFields: { type: [], eligibility: ['code'], review: [] },
        omittedFilled: ['code'],
        stored: { stepId: 'review', furthestStepId: 'review', stepIds: null },
      }),
    ).toEqual({ stepIndex: 1, furthestIndex: 2 });
  });

  it('does not move forward for a problem on a later step', () => {
    expect(
      resolveArrival({
        ...base,
        problemKeys: ['type'],
        stored: { stepId: 'identity', furthestStepId: 'identity', stepIds: steps },
      }),
    ).toEqual({ stepIndex: 0, furthestIndex: 0 });
  });
});

describe('classifyOutcome', () => {
  const api = (status?: number) => new ApiError({ status, data: null });

  it.each([400, 401, 403, 404, 409, 422, 429])('treats a %i as a refusal', (status) => {
    expect(classifyOutcome(api(status))).toBe('refused');
  });

  it.each([408, 500, 502, 503, 504])('treats a %i as an unknown outcome', (status) => {
    expect(classifyOutcome(api(status))).toBe('unknown');
  });

  it('treats no status, and an error that is not an API error, as unknown', () => {
    expect(classifyOutcome(api())).toBe('unknown');
    expect(classifyOutcome(new TypeError('Failed to fetch'))).toBe('unknown');
    expect(classifyOutcome('boom')).toBe('unknown');
  });
});
