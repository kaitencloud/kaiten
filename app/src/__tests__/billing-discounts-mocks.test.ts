import { describe, expect, it } from 'vite-plus/test';
import {
  buildRedemption,
  buildVoucher,
} from '../../e2e/app/_support/fixtures';
import { buildInvoiceLine } from '../../e2e/app/_support/fixtures/build-invoice';
import {
  composeDiscounts,
  type DiscountSource,
} from '../../e2e/app/_support/model/billing-discounts';

// What the lines a voucher bears on are, as the composer of the API reads them: an
// ADDONS voucher takes every line from an add-on price, the fee of the add-on and the
// usage or the overage it rated, none of which has a license price.

const NOW = Date.parse('2026-09-15T00:00:00.000Z');

const voucher = (priceAppliesTo: 'ADDONS' | 'BOTH' | 'LICENSE_BASE') =>
  buildVoucher({
    code: 'ADDONS-10',
    id: 'voucher-1',
    name: 'Ten percent',
    priceAppliesTo,
    priceDiscountType: 'PERCENTAGE',
    priceDiscountValue: '10',
  });

const sourceOf = (priceAppliesTo: 'ADDONS' | 'BOTH' | 'LICENSE_BASE') => {
  const priced = voucher(priceAppliesTo);

  return {
    redemption: buildRedemption({
      id: 'redemption-1',
      instanceSlug: 'acme-production',
      voucher: priced,
    }),
    voucher: priced,
  } satisfies DiscountSource;
};

const lines = [
  buildInvoiceLine({
    amount: 49900,
    description: 'base',
    invoiceId: 'inv',
    label: 'Base',
    seq: 1,
    serviceFrom: '2026-09-15T00:00:00.000Z',
    serviceTo: '2026-10-15T00:00:00.000Z',
    type: 'BASE',
  }),
  buildInvoiceLine({
    addonPriceId: 'addon-price-seats',
    amount: 3000,
    description: 'seats',
    instanceAddonId: 'attachment-seats',
    invoiceId: 'inv',
    label: 'Seats',
    seq: 2,
    serviceFrom: '2026-09-15T00:00:00.000Z',
    serviceTo: '2026-10-15T00:00:00.000Z',
    type: 'ADDON',
  }),
  buildInvoiceLine({
    addonPriceId: 'addon-price-tokens',
    amount: 1000,
    description: 'tokens',
    instanceAddonId: 'attachment-tokens',
    invoiceId: 'inv',
    label: 'Tokens',
    seq: 3,
    serviceFrom: '2026-08-28T00:00:00.000Z',
    serviceTo: '2026-09-15T00:00:00.000Z',
    type: 'USAGE',
  }),
  buildInvoiceLine({
    amount: 500,
    description: 'calls',
    invoiceId: 'inv',
    label: 'Calls',
    licensePriceId: 'license-price-calls',
    seq: 4,
    serviceFrom: '2026-08-15T00:00:00.000Z',
    serviceTo: '2026-09-15T00:00:00.000Z',
    type: 'USAGE',
  }),
];

const discountOf = (applies: 'ADDONS' | 'BOTH' | 'LICENSE_BASE') =>
  composeDiscounts({
    at: NOW,
    currency: 'USD',
    invoiceId: 'inv',
    lines,
    sources: [sourceOf(applies)],
  }).map(({ line }) => line);

describe('the lines a voucher bears on, as the mocks compose them', () => {
  it('takes the fee of an add-on and the usage it rated for a voucher of the add-ons, and not the usage of a license', () => {
    const [discount] = discountOf('ADDONS');

    expect(discount.discount?.targetSeqs).toEqual([2, 3]);
    expect(discount.discount?.base).toBe('4000');
    expect(discount.amount).toBe(-400);
  });

  it('adds the base fee for a voucher of both', () => {
    const [discount] = discountOf('BOTH');

    expect(discount.discount?.targetSeqs).toEqual([1, 2, 3]);
  });

  it('leaves every add-on line alone for a voucher of the base fee', () => {
    const [discount] = discountOf('LICENSE_BASE');

    expect(discount.discount?.targetSeqs).toEqual([1]);
  });
});
