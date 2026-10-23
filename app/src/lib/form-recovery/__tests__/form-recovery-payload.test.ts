import { describe, expect, it } from 'vite-plus/test';
import {
  decodePayload,
  encodePayload,
  FormRecoverySerializationError,
} from '../form-recovery-payload';

function roundTrip<T>(value: T): unknown {
  return decodePayload(encodePayload(value));
}

describe('form recovery payload codec', () => {
  it('keeps NaN and the infinities, which JSON turns into null', () => {
    const decoded = roundTrip({
      empty: Number.NaN,
      up: Number.POSITIVE_INFINITY,
      down: Number.NEGATIVE_INFINITY,
      plain: 12.5,
    }) as Record<string, number>;

    expect(Number.isNaN(decoded.empty)).toBe(true);
    expect(decoded.up).toBe(Number.POSITIVE_INFINITY);
    expect(decoded.down).toBe(Number.NEGATIVE_INFINITY);
    expect(decoded.plain).toBe(12.5);
  });

  it('keeps undefined in an object and in an array', () => {
    const decoded = roundTrip({ icon: undefined, list: [1, undefined, 3] }) as {
      icon: unknown;
      list: unknown[];
    };

    expect('icon' in decoded).toBe(true);
    expect(decoded.icon).toBeUndefined();
    expect(decoded.list).toHaveLength(3);
    expect(1 in decoded.list).toBe(true);
    expect(decoded.list[1]).toBeUndefined();
  });

  it('keeps null, booleans, strings and nesting', () => {
    const value = { a: null, b: true, c: 'x', d: { e: [{ f: 1 }] } };
    expect(roundTrip(value)).toEqual(value);
  });

  it('keeps a date by its instant', () => {
    const date = new Date('2026-10-22T14:32:10.123Z');
    const decoded = roundTrip({ date }) as { date: Date };

    expect(decoded.date).toBeInstanceOf(Date);
    expect(decoded.date.getTime()).toBe(date.getTime());
  });

  it('keeps an invalid date invalid', () => {
    const decoded = roundTrip({ date: new Date(Number.NaN) }) as {
      date: Date;
    };

    expect(Number.isNaN(decoded.date.getTime())).toBe(true);
  });

  it('writes a date at local midnight with its calendar day', () => {
    const midnight = new Date(2026, 9, 22);
    const text = encodePayload({ date: midnight });

    expect(text).toContain('"$day":"2026-10-22"');
    expect((roundTrip({ date: midnight }) as { date: Date }).date.getTime()).toBe(
      midnight.getTime(),
    );
  });

  it('reads a date at local midnight as that civil day even when the time zone moved', () => {
    // Written in a zone ahead of UTC, where midnight of the 22nd is the evening
    // of the 21st in UTC; read back anywhere, it is still the 22nd.
    const text = '{"date":{"$date":"2026-10-21T22:00:00.000Z","$day":"2026-10-22"}}';
    const decoded = decodePayload(text) as { date: Date };

    expect(decoded.date.getFullYear()).toBe(2026);
    expect(decoded.date.getMonth()).toBe(9);
    expect(decoded.date.getDate()).toBe(22);
    expect(decoded.date.getHours()).toBe(0);
  });

  it('does not tag a date that is not at local midnight', () => {
    expect(encodePayload(new Date(2026, 9, 22, 8, 30))).not.toContain('$day');
  });

  it('refuses a file or a blob', () => {
    const file = new File(['x'], 'a.txt');

    expect(() => encodePayload({ attachment: file })).toThrow(
      FormRecoverySerializationError,
    );
    expect(() => encodePayload({ nested: [new Blob(['x'])] })).toThrow(
      /nested\[0\]/,
    );
  });

  it('refuses a function, a symbol, a bigint and an object of a class', () => {
    class Thing {}

    expect(() => encodePayload({ f: () => 1 })).toThrow(
      FormRecoverySerializationError,
    );
    expect(() => encodePayload({ s: Symbol('x') })).toThrow(
      FormRecoverySerializationError,
    );
    expect(() => encodePayload({ b: 1n })).toThrow(
      FormRecoverySerializationError,
    );
    expect(() => encodePayload({ t: new Thing() })).toThrow(
      FormRecoverySerializationError,
    );
  });

  it('refuses a circular reference but accepts a shared one', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const shared = { n: 1 };

    expect(() => encodePayload(circular)).toThrow(/circular/);
    expect(roundTrip({ a: shared, b: shared })).toEqual({
      a: { n: 1 },
      b: { n: 1 },
    });
  });

  it('throws on text that is not JSON', () => {
    expect(() => decodePayload('{nope')).toThrow();
  });
});
