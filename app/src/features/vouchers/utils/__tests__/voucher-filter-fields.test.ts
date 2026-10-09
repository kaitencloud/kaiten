import { describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import { buildVoucher } from '../../../../../e2e/app/_support/fixtures';
import {
  createVoucherFilterFields,
  getVoucherSearchTokens,
  VOUCHER_FILTER_IDS,
} from '../voucher-filter-fields';

useBillingTexts();

const t = testI18n.t.bind(testI18n);
const WELCOME = buildVoucher({
  code: 'WELCOME-SPRING-2027',
  id: 'voucher-welcome',
  name: 'Welcome spring',
  restrictedCustomerSlug: 'hooli',
});
const NAMES = { hooli: 'Hooli Inc.' };

describe('what the search of the list matches', () => {
  it('reads the name, the code, the end of the code and the customer, by name and by slug', () => {
    expect(getVoucherSearchTokens(WELCOME, NAMES)).toEqual([
      'Welcome spring',
      'WELCOME-SPRING-2027',
      '2027',
      'hooli',
      'Hooli Inc.',
    ]);
  });

  it('reads a voucher that has no code in the answer by the end of it alone, and one with no customer by nothing', () => {
    expect(
      getVoucherSearchTokens(
        { ...buildVoucher({ code: 'ABCDEFGH', id: 'v', name: 'N' }), code: undefined },
        NAMES,
      ),
    ).toEqual(['N', '', 'EFGH', '', '']);
  });
});

describe('the fields of the list', () => {
  const fields = createVoucherFilterFields({ customerNames: NAMES, t });
  const field = (id: string) => fields.find((candidate) => candidate.id === id);

  it('has the search first, then the state and the kind', () => {
    expect(fields.map(({ id }) => id)).toEqual([
      VOUCHER_FILTER_IDS.search,
      VOUCHER_FILTER_IDS.status,
      VOUCHER_FILTER_IDS.type,
    ]);
    expect(field(VOUCHER_FILTER_IDS.search)?.type).toBe('text');
  });

  it('filters by the state a person reads, which the console derives, not by the one the API stored', () => {
    const status = field(VOUCHER_FILTER_IDS.status);
    const lapsed = buildVoucher({
      code: 'SPRING-2026-PROMO',
      expiresAt: '2020-01-01T00:00:00.000Z',
      id: 'v-lapsed',
      name: 'Lapsed',
    });
    const full = buildVoucher({
      code: 'FULL-AGREEMENT-1',
      id: 'v-full',
      maxRedemptions: 1,
      name: 'Full',
      redemptionsCount: 1,
    });

    expect(status?.accessor(WELCOME)).toBe('ACTIVE');
    expect(status?.accessor(lapsed)).toBe('EXPIRED');
    expect(status?.accessor(full)).toBe('EXHAUSTED');
    expect(status?.options?.map(({ value }) => value)).toEqual([
      'DRAFT',
      'ACTIVE',
      'EXPIRED',
      'EXHAUSTED',
      'ARCHIVED',
    ]);
  });

  it('filters by kind, and offers the two the release ships', () => {
    const type = field(VOUCHER_FILTER_IDS.type);

    expect(type?.accessor(WELCOME)).toBe('PRICE');
    expect(type?.options?.map(({ value }) => value)).toEqual(['PRICE', 'ENTITLEMENT_BOOST']);
  });
});
