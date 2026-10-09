import type {
  Customer,
  InvoiceLine,
  License,
  Redemption,
  Voucher,
} from '@/api-client';
import { buildInvoiceLine } from '../../../../e2e/app/_support/fixtures/build-invoice';
import {
  buildRedemption,
  buildVoucher,
} from '../../../../e2e/app/_support/fixtures/build-voucher';
import type { BillingVouchersSeed } from '../../../../e2e/app/_support/model/billing-vouchers';
import { addMonthsClamped } from '../../../../e2e/app/_support/model/license-invoice-preview';
import { bySlug } from './by-slug';
import { daysAgo, daysFromNow } from './dates';

/** What the vouchers of the world refer to: the customers and the license versions. */
type VouchersWorld = {
  customers: Customer[];
  licenses: License[];
};

/** The agreement Acme Production signed, whose first invoice carries its discount. */
export const ACME_AGREEMENT = {
  amount: 480_000,
  base: 4_800_000,
  instanceSlug: 'acme-production',
  redeemedDaysAgo: 181,
  redemptionId: 'redemption-acme-production-agreement',
  voucherId: 'voucher-acme-agreement',
} as const;

const licenseId = (licenses: License[], slug: string) =>
  bySlug(licenses, slug).id;

/**
 * Eight vouchers in every state a voucher is shown in: a launch discount that is
 * being redeemed, a boost of API calls an instance has, the agreement of one customer
 * whose single redemption is used, a draft being prepared, one that was archived, one
 * whose window has closed although the API never says so, a boost reserved for
 * Globex, and a discount on chosen prices.
 *
 * The redemptions are the instances': Globex Staging redeemed the launch discount
 * after its last renewal, so it applies to the invoice it will issue; Beta Staging
 * redeemed it on a trial, where it waits for the first invoice; Globex Production has
 * the boost; Acme Production's agreement discounted the invoice of its year. A
 * redemption of the archived voucher was revoked, another ran out.
 */
export function createVouchers({ customers, licenses }: VouchersWorld): {
  boostedInstances: string[];
  seed: BillingVouchersSeed;
} {
  const acme = bySlug(customers, 'acme-corp');
  const globex = bySlug(customers, 'globex');
  const enterpriseV2 = licenseId(licenses, 'enterprise-v2');
  const starterV2 = licenseId(licenses, 'starter-v2');

  const vouchers: Voucher[] = [
    buildVoucher({
      applicableLicenseIds: [enterpriseV2],
      code: 'ACME-ENTERPRISE-2026',
      createdAt: daysAgo(200),
      description: 'Ten percent off the base price of the first two years',
      duration: 'REPEATING',
      durationInPeriods: 2,
      id: ACME_AGREEMENT.voucherId,
      maxRedemptions: 1,
      name: 'Acme enterprise agreement',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '10',
      redemptionsCount: 1,
      restrictedCustomerSlug: acme.slug,
      status: 'EXHAUSTED',
      updatedAt: daysAgo(181),
    }),
    buildVoucher({
      code: 'LAUNCH-20-OFF',
      createdAt: daysAgo(60),
      description:
        'Twenty percent off the base price for the first three invoices',
      duration: 'REPEATING',
      durationInPeriods: 3,
      expiresAt: daysFromNow(90),
      id: 'voucher-launch',
      maxRedemptions: 100,
      name: 'Launch discount',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '20',
      redemptionsCount: 2,
    }),
    buildVoucher({
      code: 'API-BOOST-50K',
      createdAt: daysAgo(45),
      description: 'Fifty thousand more API calls for two billing periods',
      duration: 'REPEATING',
      durationInPeriods: 2,
      grants: [
        {
          entitlementSlug: 'api-calls',
          modifierType: 'ADD',
          modifierValue: '50000',
        },
      ],
      id: 'voucher-api-boost',
      maxRedemptions: 10,
      name: 'API calls boost',
      redemptionsCount: 1,
      voucherType: 'ENTITLEMENT_BOOST',
    }),
    buildVoucher({
      code: 'DOUBLE-SEATS-GLOBEX',
      createdAt: daysAgo(12),
      duration: 'REPEATING',
      durationInPeriods: 6,
      grants: [
        {
          entitlementSlug: 'seats',
          modifierType: 'MULTIPLY',
          modifierValue: '2',
        },
      ],
      id: 'voucher-double-seats',
      maxRedemptions: 2,
      name: 'Double seats for Globex',
      restrictedCustomerSlug: globex.slug,
      voucherType: 'ENTITLEMENT_BOOST',
    }),
    buildVoucher({
      applicableAddonPriceIds: ['extra-seats-monthly'],
      applicableLicensePriceIds: [`${starterV2}-monthly`],
      applicableLicenseIds: [starterV2],
      code: 'STARTER-BUNDLE-25',
      createdAt: daysAgo(20),
      description: 'A quarter off the Starter fee and the extra seats',
      expiresAt: daysFromNow(200),
      id: 'voucher-starter-bundle',
      maxRedemptions: 20,
      name: 'Starter bundle',
      priceAppliesTo: 'SELECTED_PRICES',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '25',
    }),
    buildVoucher({
      code: 'SUMMER-SALE-2026',
      createdAt: daysAgo(3),
      currency: 'USD',
      description: 'Fifty dollars off the first invoice',
      id: 'voucher-summer-sale',
      name: 'Summer sale',
      priceAppliesTo: 'BOTH',
      priceDiscountType: 'FIXED_AMOUNT',
      priceDiscountValue: '5000',
      status: 'DRAFT',
    }),
    buildVoucher({
      code: 'BLACKFRIDAY2025',
      createdAt: daysAgo(330),
      description: 'Fifteen percent off the base price of one invoice',
      id: 'voucher-black-friday',
      maxRedemptions: 50,
      name: 'Black Friday 2025',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '15',
      redemptionsCount: 2,
      status: 'ARCHIVED',
      updatedAt: daysAgo(300),
    }),
    // The API sets no voucher EXPIRED itself: this one is ACTIVE past its window.
    buildVoucher({
      code: 'SPRING-2026-PROMO',
      createdAt: daysAgo(240),
      description: 'Ten percent off the add-ons of one invoice',
      expiresAt: daysAgo(30),
      id: 'voucher-spring-promo',
      name: 'Spring 2026 promotion',
      priceAppliesTo: 'ADDONS',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '10',
    }),
  ];
  const voucher = (id: string) => {
    const found = vouchers.find((candidate) => candidate.id === id);
    if (!found) {
      throw new Error(`The dev world has no voucher "${id}"`);
    }

    return found;
  };

  const boostRedeemedAt = daysAgo(10);
  const redemptions: Redemption[] = [
    buildRedemption({
      applicationsCount: 1,
      applicationsMax: 2,
      id: ACME_AGREEMENT.redemptionId,
      instanceSlug: ACME_AGREEMENT.instanceSlug,
      redeemedAt: daysAgo(ACME_AGREEMENT.redeemedDaysAgo),
      voucher: voucher(ACME_AGREEMENT.voucherId),
    }),
    buildRedemption({
      applicationsMax: 3,
      id: 'redemption-globex-staging-launch',
      instanceSlug: 'globex-staging',
      redeemedAt: daysAgo(3),
      voucher: voucher('voucher-launch'),
    }),
    buildRedemption({
      applicationsMax: 3,
      id: 'redemption-beta-staging-launch',
      instanceSlug: 'beta-staging',
      redeemedAt: daysAgo(12),
      voucher: voucher('voucher-launch'),
    }),
    buildRedemption({
      effectiveExpiresAt: addMonthsClamped(
        new Date(boostRedeemedAt),
        2,
      ).toISOString(),
      id: 'redemption-globex-production-boost',
      instanceSlug: 'globex-production',
      redeemedAt: boostRedeemedAt,
      voucher: voucher('voucher-api-boost'),
    }),
    buildRedemption({
      applicationsCount: 1,
      applicationsMax: 1,
      expiredAt: daysAgo(290),
      id: 'redemption-acme-legacy-black-friday',
      instanceSlug: 'acme-legacy',
      redeemedAt: daysAgo(325),
      status: 'EXPIRED',
      voucher: voucher('voucher-black-friday'),
    }),
    buildRedemption({
      applicationsMax: 1,
      id: 'redemption-acme-us-black-friday',
      instanceSlug: 'acme-us',
      redeemedAt: daysAgo(320),
      revokedAt: daysAgo(310),
      revokedReason: 'Granted by mistake',
      status: 'REVOKED',
      voucher: voucher('voucher-black-friday'),
    }),
  ];

  return {
    boostedInstances: ['globex-production'],
    seed: {
      known: {
        customers: customers.flatMap(({ slug }) => (slug ? [slug] : [])),
        licenseIds: licenses.map(({ id }) => id),
      },
      redemptions,
      vouchers,
    },
  };
}

/**
 * The discount the agreement of Acme Production took off the invoice of its first
 * year: ten percent of the base price, the first of the two invoices it discounts.
 * The invoice carries the line, and the redemption its application.
 */
export function createAgreementDiscountLine(
  invoiceId: string,
  seq: number,
  serviceFrom: string,
  serviceTo: string,
): InvoiceLine {
  return buildInvoiceLine({
    amount: -ACME_AGREEMENT.amount,
    description: '10% of 4,800,000',
    discount: {
      allocations: [{ amount: ACME_AGREEMENT.amount, targetSeq: 1 }],
      application: 1,
      applicationsMax: 2,
      appliesTo: 'LICENSE_BASE',
      base: String(ACME_AGREEMENT.base),
      discountType: 'PERCENTAGE',
      discountValue: '10',
      targetSeqs: [1],
    },
    instanceVoucherId: ACME_AGREEMENT.redemptionId,
    invoiceId,
    label: 'Acme enterprise agreement',
    seq,
    serviceFrom,
    serviceTo,
    type: 'DISCOUNT',
    voucherId: ACME_AGREEMENT.voucherId,
  });
}
