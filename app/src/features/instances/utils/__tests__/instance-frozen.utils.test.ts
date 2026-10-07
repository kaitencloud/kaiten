import { describe, expect, it } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import {
  FROZEN_FIELD_STEPS,
  getChangedFrozenFields,
  INSTANCE_FROZEN_CODE,
  readFrozenRefusal,
} from '../instance-frozen.utils';

const instance = { customerId: 'customer-1', licenseSlug: 'starter' };

describe('getChangedFrozenFields', () => {
  it('is the customer when it changed, the license when it changed, both when both did', () => {
    expect(
      getChangedFrozenFields({ customerId: 'customer-2', licenseSlug: 'starter' }, instance),
    ).toEqual(['customerId']);
    expect(
      getChangedFrozenFields({ customerId: 'customer-1', licenseSlug: 'growth' }, instance),
    ).toEqual(['licenseSlug']);
    expect(
      getChangedFrozenFields({ customerId: 'customer-2', licenseSlug: 'growth' }, instance),
    ).toEqual(['customerId', 'licenseSlug']);
  });

  it('is nothing when neither changed', () => {
    expect(getChangedFrozenFields({ ...instance }, instance)).toEqual([]);
  });
});

describe('readFrozenRefusal', () => {
  const refusal = (data: unknown) => new ApiError({ data, status: 409 });

  it('reads the explanation the API gave, to show as it wrote it', () => {
    expect(
      readFrozenRefusal(
        refusal({
          code: INSTANCE_FROZEN_CODE,
          detail: 'Instance "x" has a live subscription',
          status: 409,
        }),
      ),
    ).toEqual({ detail: 'Instance "x" has a live subscription' });
  });

  it('still reads it when the problem gives no explanation', () => {
    expect(
      readFrozenRefusal(refusal({ code: INSTANCE_FROZEN_CODE, status: 409 })),
    ).toEqual({ detail: INSTANCE_FROZEN_CODE });
  });

  it.each([
    ['another refusal', refusal({ code: 'UpdateInstance.SlugConflict', detail: 'taken', status: 409 })],
    ['a failure that is no problem', new Error('network')],
    ['nothing', undefined],
  ])('reads %s as no refusal of this kind', (_, error) => {
    expect(readFrozenRefusal(error)).toBeUndefined();
  });
});

describe('the steps of the frozen fields', () => {
  it('lead to the details, then to the license', () => {
    expect(FROZEN_FIELD_STEPS).toEqual({ customerId: 0, licenseSlug: 1 });
  });
});
