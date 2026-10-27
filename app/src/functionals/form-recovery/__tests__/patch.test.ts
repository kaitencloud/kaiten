import { describe, expect, it } from 'vite-plus/test';
import {
  applyPatch,
  computePatch,
  patchCounts,
  stripIgnored,
} from '../logic/patch';
import { isEqualValue } from '../logic/values';
import { encodePayload } from '@/lib/form-recovery';

type Values = {
  name: string;
  count: number;
  start: Date | null;
  licenseDate: { from: Date | null; to: Date | null };
  metadata: Record<string, string>;
  grants: { key: string; priceId: string }[];
  code: string;
  secret: string;
};

const pristine = (): Values => ({
  name: '',
  count: Number.NaN,
  start: null,
  licenseDate: { from: new Date(2026, 9, 23), to: null },
  metadata: {},
  grants: [],
  code: '',
  secret: '',
});

const options = { omit: ['code'] };

describe('isEqualValue', () => {
  it('treats NaN as equal to NaN, which a blank number field holds', () => {
    expect(isEqualValue(Number.NaN, Number.NaN)).toBe(true);
  });

  it('compares strings once trimmed and dates by their instant', () => {
    expect(isEqualValue('  ', '')).toBe(true);
    expect(isEqualValue(new Date(1), new Date(1))).toBe(true);
    expect(isEqualValue(new Date(1), new Date(2))).toBe(false);
  });

  it('compares arrays and objects deeply', () => {
    expect(isEqualValue({ a: [1, { b: Number.NaN }] }, { a: [1, { b: Number.NaN }] })).toBe(true);
    expect(isEqualValue({ a: [1] }, { a: [1, 2] })).toBe(false);
  });
});

describe('computePatch', () => {
  it('is empty for a blank form, NaN included', () => {
    expect(computePatch(pristine(), pristine(), options)).toEqual({
      patch: [],
      omittedFilled: [],
    });
  });

  it('lists what differs, going down into plain objects', () => {
    const values = pristine();
    values.name = 'Gold';
    values.licenseDate.to = new Date(2027, 0, 1);
    values.metadata = { region: 'eu' };

    const { patch } = computePatch(values, pristine(), options);

    expect(patch.map(([path]) => path)).toEqual([
      'name',
      'licenseDate.to',
      'metadata.region',
    ]);
  });

  it('takes arrays and dates whole', () => {
    const values = pristine();
    values.grants = [{ key: 'grant-1', priceId: 'p1' }];
    values.start = new Date(2026, 10, 1);

    const { patch } = computePatch(values, pristine(), options);

    expect(patch).toEqual([
      ['start', values.start],
      ['grants', values.grants],
    ].sort((a, b) => ['name','count','start','licenseDate','metadata','grants'].indexOf(String(a[0])) - ['name','count','start','licenseDate','metadata','grants'].indexOf(String(b[0]))));
  });

  it('keeps a number the person entered over the NaN of a blank field', () => {
    const values = pristine();
    values.count = 3;

    expect(computePatch(values, pristine(), options).patch).toEqual([['count', 3]]);
  });

  it('never puts an omitted path in the patch, and lists it apart when filled', () => {
    const values = pristine();
    values.code = 'BLACKFRIDAY';
    values.name = 'Gold';

    const result = computePatch(values, pristine(), options);

    expect(result.patch).toEqual([['name', 'Gold']]);
    expect(result.omittedFilled).toEqual(['code']);
    expect(JSON.stringify(result)).not.toContain('BLACKFRIDAY');
  });

  it('does not list an omitted path that is empty or unchanged', () => {
    const values = pristine();
    values.code = '   ';

    expect(computePatch(values, pristine(), options).omittedFilled).toEqual([]);
  });

  it('omits a path under an omitted one, and a path inside an object', () => {
    const values = { ...pristine(), metadata: { apiKey: 'sk-live', region: 'eu' } };

    const result = computePatch(values, pristine(), { omit: ['metadata.apiKey'] });

    expect(result.patch).toEqual([['metadata.region', 'eu']]);
    expect(result.omittedFilled).toEqual(['metadata.apiKey']);
  });

  it('omits what omitWhen says, with the path as segments', () => {
    const seen: string[][] = [];
    const values = { ...pristine(), metadata: { token: 'secret', region: 'eu' } };

    const result = computePatch(values, pristine(), {
      omit: [],
      omitWhen: (path) => {
        seen.push([...path]);
        return path.join('.') === 'metadata.token';
      },
    });

    expect(result.patch).toEqual([['metadata.region', 'eu']]);
    expect(result.omittedFilled).toEqual(['metadata.token']);
    expect(seen).toContainEqual(['metadata', 'token']);
  });

  it('omits a whole object when omitWhen refuses it', () => {
    const values = { ...pristine(), metadata: { a: '1' } };

    const result = computePatch(values, pristine(), {
      omit: [],
      omitWhen: (path) => path[0] === 'metadata',
    });

    expect(result.patch).toEqual([]);
    expect(result.omittedFilled).toEqual(['metadata']);
  });

  it('does not count a field that only holds blanks', () => {
    const values = pristine();
    values.name = '   ';

    expect(computePatch(values, pristine(), options).patch).toEqual([]);
  });
});

describe('computePatch, omitted paths inside a value taken whole', () => {
  type Loose = {
    config: { token: string; url: string } | null | undefined;
    rows: { key: string; token: string }[];
  };
  const omit = ['config.token', 'rows[].token'];

  it('keeps a secret out when the reference at an ancestor is null', () => {
    const values: Loose = { config: { token: 'SECRET', url: 'x' }, rows: [] };
    const reference: Loose = { config: null, rows: [] };

    const result = computePatch(values, reference, { omit });

    expect(result.patch).toEqual([['config', { url: 'x' }]]);
    expect(result.omittedFilled).toEqual(['config.token']);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('keeps a secret out when the reference at an ancestor is undefined', () => {
    const values: Loose = { config: { token: 'SECRET', url: 'x' }, rows: [] };
    const reference: Loose = { config: undefined, rows: [] };

    const result = computePatch(values, reference, { omit });

    expect(result.patch).toEqual([['config', { url: 'x' }]]);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('keeps nothing when only an omitted part was typed under a null ancestor', () => {
    const values: Loose = { config: { token: 'SECRET', url: '' }, rows: [] };
    const reference: Loose = { config: null, rows: [] };

    const result = computePatch(values, reference, { omit: ['config'] });

    expect(result.patch).toEqual([]);
    expect(result.omittedFilled).toEqual(['config']);
  });

  it('applies omitWhen under an undefined reference too', () => {
    const values = { config: { token: 'SECRET', url: 'x' } };

    const result = computePatch(
      values,
      { config: undefined },
      { omit: [], omitWhen: (path) => path.join('.') === 'config.token' },
    );

    expect(result.patch).toEqual([['config', { url: 'x' }]]);
    expect(result.omittedFilled).toEqual(['config.token']);
  });

  it('reaches into the rows of an array with [] and with an index', () => {
    const values: Loose = {
      config: null,
      rows: [
        { key: 'a', token: 'S1' },
        { key: 'b', token: 'S2' },
      ],
    };
    const reference: Loose = { config: null, rows: [] };

    const withWildcard = computePatch(values, reference, { omit });
    expect(withWildcard.patch).toEqual([['rows', [{ key: 'a' }, { key: 'b' }]]]);
    expect(withWildcard.omittedFilled).toEqual(['rows.0.token', 'rows.1.token']);

    const withIndex = computePatch(values, reference, { omit: ['rows.1.token'] });
    expect(withIndex.patch).toEqual([
      ['rows', [{ key: 'a', token: 'S1' }, { key: 'b' }]],
    ]);
  });

  it('writes nothing secret to the encoded payload', () => {
    const values: Loose = {
      config: { token: 'SECRET', url: 'x' },
      rows: [{ key: 'a', token: 'S1' }],
    };
    const { patch } = computePatch(values, { config: null, rows: [] }, { omit });

    const stored = encodePayload(patch);

    expect(stored).not.toContain('SECRET');
    expect(stored).not.toContain('S1');
  });
});

describe('patchCounts', () => {
  it('does not count a blank form, an omitted field or a step change', () => {
    expect(patchCounts(pristine(), pristine(), options)).toBe(false);

    const withCode = { ...pristine(), code: 'X' };
    expect(patchCounts(withCode, pristine(), options)).toBe(false);
  });

  it('counts a change', () => {
    expect(patchCounts({ ...pristine(), name: 'Gold' }, pristine(), options)).toBe(true);
  });

  it('ignores the technical keys of the rows', () => {
    const reference = { ...pristine(), grants: [{ key: 'grant-1', priceId: 'p1' }] };
    const renumbered = { ...pristine(), grants: [{ key: 'grant-9', priceId: 'p1' }] };

    expect(patchCounts(renumbered, reference, options)).toBe(true);
    expect(patchCounts(renumbered, reference, { ...options, ignore: ['grants[].key'] })).toBe(false);
    expect(
      patchCounts(
        { ...pristine(), grants: [{ key: 'grant-9', priceId: 'p2' }] },
        reference,
        { ...options, ignore: ['grants[].key'] },
      ),
    ).toBe(true);
  });

  it('strips an ignored path from a copy, not from the original', () => {
    const original = { rows: [{ key: 'a', v: 1 }] };

    const stripped = stripIgnored(original, ['rows[].key']);

    expect(stripped).toEqual({ rows: [{ v: 1 }] });
    expect(original.rows[0]).toHaveProperty('key');
  });
});

describe('applyPatch', () => {
  it('lays the patch on the initial values of today, not those of the day it was written', () => {
    const today = { ...pristine(), licenseDate: { from: new Date(2026, 9, 30), to: null } };
    const entries: [string, unknown][] = [['name', 'Gold'], ['licenseDate.to', new Date(2027, 0, 1)]];

    const merged = applyPatch(today, entries, []);

    expect(merged.name).toBe('Gold');
    expect(merged.licenseDate.from).toEqual(new Date(2026, 9, 30));
    expect(merged.licenseDate.to).toEqual(new Date(2027, 0, 1));
  });

  it('does not touch the initial values it was given', () => {
    const base = pristine();

    applyPatch(base, [['metadata.region', 'eu']], []);

    expect(base.metadata).toEqual({});
  });

  it('skips an omitted path, even one an older version wrote', () => {
    const merged = applyPatch(pristine(), [['code', 'LEAK']], ['code']);

    expect(merged.code).toBe('');
  });
});

describe('applyPatch, hostile and older entries', () => {
  it('strips an omitted path carried by an ancestor an older version wrote', () => {
    const base = { config: null as null | { token?: string; url?: string } };

    const merged = applyPatch(
      base,
      [['config', { token: 'LEAK', url: 'x' }]],
      ['config.token'],
    );

    expect(merged.config).toEqual({ url: 'x' });
  });

  it('never sets a path that reaches the prototype chain', () => {
    const merged = applyPatch(
      pristine(),
      [
        ['__proto__.polluted', 'yes'],
        ['metadata.constructor.prototype.polluted', 'yes'],
      ],
      [],
    );

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('drops a __proto__ key inside a stored value', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":"yes"},"a":"1"}') as unknown;

    const merged = applyPatch(pristine(), [['metadata', hostile]], []);

    expect(merged.metadata).toEqual({ a: '1' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
