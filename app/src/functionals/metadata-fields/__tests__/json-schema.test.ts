import { describe, expect, it, vi } from 'vite-plus/test';
import {
  __clearCompileCacheForTests,
  ajv,
  compileSchema,
  extractEnumOptions,
  inferUiType,
} from '../json-schema';

describe('inferUiType', () => {
  it.each([
    [{ type: 'string' }, 'string'],
    [{ type: 'string', enum: ['a', 'b'] }, 'enum'],
    [{ type: 'string', format: 'date' }, 'date'],
    [{ type: 'number' }, 'number'],
    [{ type: 'integer' }, 'number'],
    [{ type: 'boolean' }, 'boolean'],
    [{ type: 'array', items: { type: 'string', enum: ['x', 'y'] } }, 'enum_list'],
  ])('maps %j → %s', (schema, expected) => {
    expect(inferUiType(schema)).toBe(expected);
  });

  it('falls back to "string" when the schema is missing or empty', () => {
    expect(inferUiType(undefined)).toBe('string');
    expect(inferUiType({})).toBe('string');
  });

  it('flags exotic schemas as "unsupported" so the form can render them read-only', () => {
    // type:"object" — structured value the form can't represent.
    expect(inferUiType({ type: 'object' })).toBe('unsupported');
    // type:"array" with non-enum items — same reason.
    expect(inferUiType({ type: 'array', items: { type: 'string' } })).toBe('unsupported');
    expect(inferUiType({ type: 'array', items: { type: 'object' } })).toBe('unsupported');
    // Unknown type string.
    expect(inferUiType({ type: 'whatsit' })).toBe('unsupported');
  });
});

describe('extractEnumOptions', () => {
  it('returns string-enum options', () => {
    expect(
      extractEnumOptions({ type: 'string', enum: ['prod', 'staging'] }),
    ).toEqual([
      { label: 'prod', value: 'prod' },
      { label: 'staging', value: 'staging' },
    ]);
  });

  it('returns items.enum options for arrays', () => {
    expect(
      extractEnumOptions({
        type: 'array',
        items: { type: 'string', enum: ['x', 'y'] },
      }),
    ).toEqual([
      { label: 'x', value: 'x' },
      { label: 'y', value: 'y' },
    ]);
  });

  it('drops non-string enum values', () => {
    expect(
      extractEnumOptions({ type: 'string', enum: ['a', 2, null] }),
    ).toEqual([{ label: 'a', value: 'a' }]);
  });

  it('returns [] when no enum is declared', () => {
    expect(extractEnumOptions({ type: 'string' })).toEqual([]);
  });
});

// Pins the content-keyed compile cache.
describe('compileSchema cache', () => {
  it('reuses the compiled validator for an identical schema object', () => {
    __clearCompileCacheForTests();
    const spy = vi.spyOn(ajv, 'compile');

    const schema = { type: 'string' };
    const v1 = compileSchema(schema);
    const v2 = compileSchema(schema);

    expect(v1).toBe(v2);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('reuses the compiled validator even for a fresh object with identical content', () => {
    __clearCompileCacheForTests();
    const spy = vi.spyOn(ajv, 'compile');

    // This is the case ajv's own cache misses — same schema rebuilt by
    // a React Query refetch / map.
    compileSchema({ type: 'string', minLength: 2 });
    compileSchema({ type: 'string', minLength: 2 });
    compileSchema({ type: 'string', minLength: 2 });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('does not collapse semantically-different schemas', () => {
    __clearCompileCacheForTests();
    const spy = vi.spyOn(ajv, 'compile');

    compileSchema({ type: 'string' });
    compileSchema({ type: 'string', minLength: 2 });

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
