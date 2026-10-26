import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { exceptionDefaults, exceptionFormSchema, exceptionToBody, exceptionLowersValue, overlapExceptionId } from '../exception.schema';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime('2026-10-26T12:00:00Z'); });
afterEach(() => vi.useRealTimers());
const values = { ...exceptionDefaults, entitlementSlug: 'seats', valueText: '5', reason: 'Customer evaluation' };

describe('exception requests derived from the generated contract', () => {
  it('keeps an explicit expiry and a past start as UTC instants', () => {
    expect(exceptionToBody({ ...values, startsAt: '2026-10-25T09:00', endsAt: '2026-11-02T09:00' })).toMatchObject({ startsAt: '2026-10-25T09:00:00.000Z', endsAt: '2026-11-02T09:00:00.000Z', value: 5 });
    expect(exceptionToBody(values).endsAt).toBeUndefined();
  });
  it.each(['2026-10-26T11:00', '2026-10-26T12:00'])('refuses an end at or before now: %s', (endsAt) => {
    expect(exceptionFormSchema.safeParse({ ...values, endsAt }).success).toBe(false);
  });
  it('allows SET zero and refuses ADD zero or a negative SET', () => {
    expect(exceptionFormSchema.safeParse({ ...values, valueText: '0' }).success).toBe(true);
    expect(exceptionFormSchema.safeParse({ ...values, valueText: '0', kind: 'ADD' }).success).toBe(false);
    expect(exceptionFormSchema.safeParse({ ...values, valueText: '-1' }).success).toBe(false);
    expect(exceptionToBody({ ...values, kind: 'UNLIMITED' })).not.toHaveProperty('value');
  });
  it('preserves false, accepts CONFIG objects and refuses incompatible operations', () => {
    expect(exceptionToBody({ ...values, entitlementType: 'BOOLEAN', booleanValue: false }).value).toBe(false);
    expect(exceptionToBody({ ...values, entitlementType: 'CONFIG', jsonValue: '{"retention":30}' }).value).toEqual({ retention: 30 });
    for (const entitlementType of ['BOOLEAN', 'CONFIG'] as const) expect(exceptionFormSchema.safeParse({ ...values, entitlementType, kind: 'ADD' }).success).toBe(false);
    for (const jsonValue of ['[]', 'null', '"string"']) expect(exceptionFormSchema.safeParse({ ...values, entitlementType: 'CONFIG', jsonValue }).success).toBe(false);
  });
  it('requires a nonblank reason up to 500 characters', () => {
    for (const reason of ['', '  ', 'x'.repeat(501)]) expect(exceptionFormSchema.safeParse({ ...values, reason }).success).toBe(false);
  });
  it('warns before lowering an unlimited number or disabling an effective BOOLEAN', () => {
    expect(exceptionLowersValue(values, { type: 'number', value: -1 })).toBe(true);
    expect(exceptionLowersValue({ ...values, entitlementType: 'BOOLEAN' }, { type: 'boolean', value: true })).toBe(true);
    expect(exceptionLowersValue({ ...values, kind: 'ADD' }, { type: 'number', value: 10 })).toBe(false);
  });
  it('retrieves the documented conflict id without interpreting the error prose', () => {
    expect(overlapExceptionId({ data: { errors: [{ value: { exceptionId: 'exception-1' } }] } })).toBe('exception-1');
    expect(overlapExceptionId({ detail: 'exception-1' })).toBeNull();
  });
});
