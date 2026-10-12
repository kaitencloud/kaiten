import { describe, expect, it } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import {
  ENTITLEMENT_REFERENCE_KEYS,
  getEntitlementReferenceLabelKey,
  readDeletionRefusal,
} from '../logic';
import { hasPermanentReference } from '../logic/deletion-refusals';

const refusal = (code: string, value?: unknown, detail = 'It is in use') =>
  new ApiError({
    data: {
      code,
      detail,
      errors: value === undefined ? [] : [{ location: 'x', message: 'm', value }],
      status: 409,
    },
    status: 409,
  });

describe('readDeletionRefusal', () => {
  it('reads what keeps a billed instance from being deleted', () => {
    expect(
      readDeletionRefusal(
        refusal('DeleteInstance.BillingActive', {
          status: 'PAST_DUE',
          unpaidInvoiceIds: ['inv-1', 'inv-2'],
        }),
      ),
    ).toEqual({
      detail: 'It is in use',
      kind: 'instance',
      status: 'PAST_DUE',
      unpaidInvoiceIds: ['inv-1', 'inv-2'],
    });
  });

  it('reads what keeps a customer from being deleted', () => {
    expect(
      readDeletionRefusal(
        refusal('DeleteCustomer.BillingActive', {
          live: true,
          unpaidInvoiceIds: ['inv-3'],
        }),
      ),
    ).toMatchObject({ kind: 'customer', live: true, unpaidInvoiceIds: ['inv-3'] });
  });

  it('lists only the kinds of reference an entitlement has, in a fixed order', () => {
    const result = readDeletionRefusal(
      refusal('DeleteEntitlement.InUseConflict', {
        addonGrants: 0,
        boostGrants: 1,
        licenseGrants: 2,
        licensePrices: 1,
        usageCounters: 0,
      }),
    );

    expect(result).toEqual({
      detail: 'It is in use',
      kind: 'entitlement',
      references: [
        { count: 2, key: 'licenseGrants' },
        { count: 1, key: 'licensePrices' },
        { count: 1, key: 'boostGrants' },
      ],
    });
  });

  it('reads a body that leaves members out as nothing, and never throws', () => {
    expect(
      readDeletionRefusal(refusal('DeleteInstance.BillingActive')),
    ).toEqual({
      detail: 'It is in use',
      kind: 'instance',
      status: undefined,
      unpaidInvoiceIds: [],
    });
    expect(
      readDeletionRefusal(
        refusal('DeleteCustomer.BillingActive', 'not an object'),
      ),
    ).toMatchObject({ live: false, unpaidInvoiceIds: [] });
    expect(
      readDeletionRefusal(
        refusal('DeleteInstance.BillingActive', {
          unpaidInvoiceIds: ['inv-1', 3, '', null],
        }),
      ),
    ).toMatchObject({ unpaidInvoiceIds: ['inv-1'] });
    expect(
      readDeletionRefusal(
        refusal('DeleteEntitlement.InUseConflict', {
          licenseGrants: -1,
          licensePrices: 'two',
          usageCounters: 2.9,
        }),
      ),
    ).toMatchObject({ references: [{ count: 2, key: 'usageCounters' }] });
  });

  it('leaves every other failure to the toast it had', () => {
    expect(readDeletionRefusal(refusal('DeleteInstance.NotFound'))).toBeUndefined();
    expect(readDeletionRefusal(new Error('network'))).toBeUndefined();
    expect(readDeletionRefusal(undefined)).toBeUndefined();
    expect(
      readDeletionRefusal(new ApiError({ data: 'not a problem', status: 500 })),
    ).toBeUndefined();
  });
});

describe('the references of an entitlement', () => {
  it('each have a label that takes a count', () => {
    for (const key of ENTITLEMENT_REFERENCE_KEYS) {
      expect(getEntitlementReferenceLabelKey(key)).toBe(
        `Features.Billing.DeletionRefusal.references.${key}`,
      );
    }
  });
});

describe('hasPermanentReference', () => {
  it.each([
    ['a price that meters the entitlement', 'licensePrices'],
    ['an add-on price that meters it', 'addonPrices'],
    ['a voucher boost that grants it', 'boostGrants'],
  ] as const)('is true for %s, which is never deleted through the API', (_name, key) => {
    expect(hasPermanentReference([{ key: 'usageCounters' }, { key }])).toBe(true);
  });

  it.each(['licenseGrants', 'usageCounters', 'addonGrants'] as const)(
    'is false when only %s holds it, which can be taken away',
    (key) => {
      expect(hasPermanentReference([{ key }])).toBe(false);
    },
  );

  it('is false for nothing', () => {
    expect(hasPermanentReference([])).toBe(false);
  });
});
