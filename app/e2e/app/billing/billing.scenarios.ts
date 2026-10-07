import type { BillingCapabilities, Invoice } from '@/api-client';
import {
  buildInvoice,
  buildInvoiceLine,
} from '../_support/fixtures/build-invoice';
import {
  BillingAppModel,
  CAPABILITIES_OUTAGES,
} from '../_support/model/billing-app-model';
import {
  billingCapabilities,
  billingCapabilitiesProfiles,
} from '../_support/model/billing-capabilities';
import { invoiceSet } from './invoice-fixtures';

/**
 * Billing on, as the API of the local stack serves it: NoOp as the only
 * provider, and no part of the release past the base loop. The profile the specs
 * use unless they say otherwise.
 */
export function createBillingStackModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
  });
}

/** Stripe connected, every part of billing shipped. */
export function createBillingFullModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.full(),
  });
}

/**
 * A release that ships the lifecycle and Stripe but not trials, add-ons,
 * vouchers, automatic collection nor the public surface: the console offers only
 * what this release can do.
 */
export function createBillingFeatureGatedModel() {
  return new BillingAppModel({
    capabilities: billingCapabilities({
      features: {
        addons: false,
        chargeAutomatically: false,
        lifecycle: true,
        publicSurface: false,
        stripe: true,
        trials: false,
        vouchers: false,
      },
    }),
  });
}

/** Billing off: on this deployment, or because the plan does not include it. */
export function createBillingDisabledModel(
  reason: NonNullable<BillingCapabilities['disabledReason']>,
) {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.disabled(reason),
  });
}

/**
 * Billing whose capabilities cannot be read: the caller lacks `read:billing`,
 * the entitlement check is down, the API predates billing, or it never answers.
 * Every one hides billing; none shows an error page.
 */
export function createBillingOutageModel(
  outage: keyof typeof CAPABILITIES_OUTAGES,
) {
  const model = createBillingStackModel();
  model.failCapabilities(CAPABILITIES_OUTAGES[outage]);
  return model;
}

/**
 * An organization with invoices: the set of `invoice-fixtures.ts`, on the
 * capabilities of the local stack (NoOp, nothing past the base loop) unless it
 * is given Stripe. Where the usage that is kept begins is `retentionStart`: a
 * line whose period starts before it has lost its reports.
 */
export function createInvoicesModel(
  options: { retentionStart?: string; stripe?: boolean } = {},
) {
  const { invoices, lineReports } = invoiceSet();
  const stripeInvoices: Invoice[] = options.stripe
    ? [
        buildInvoice({
          boundaryAt: '2026-04-01T00:00:00.000Z',
          createdAt: '2026-04-01T00:06:00.000Z',
          id: 'inv-s1',
          issuedAt: '2026-04-01T00:06:00.000Z',
          lines: [
            buildInvoiceLine({
              amount: 2900,
              description: '1 × $29.00 per month',
              invoiceId: 'inv-s1',
              label: 'Pro, monthly',
              seq: 1,
              serviceFrom: '2026-04-01T00:00:00.000Z',
              serviceTo: '2026-05-01T00:00:00.000Z',
              type: 'BASE',
              unitAmountDecimal: '2900',
            }),
          ],
          providerKind: 'STRIPE',
          status: 'PUSHED',
        }),
        buildInvoice({
          boundaryAt: '2026-04-01T00:00:00.000Z',
          createdAt: '2026-04-01T00:07:00.000Z',
          id: 'inv-f1',
          lines: [
            buildInvoiceLine({
              amount: 2900,
              description: '1 × $29.00 per month',
              invoiceId: 'inv-f1',
              label: 'Pro, monthly',
              seq: 1,
              serviceFrom: '2026-04-01T00:00:00.000Z',
              serviceTo: '2026-05-01T00:00:00.000Z',
              type: 'BASE',
              unitAmountDecimal: '2900',
            }),
          ],
          providerKind: 'STRIPE',
          status: 'PUSH_FAILED',
        }),
      ]
    : [];

  return new BillingAppModel({
    capabilities: options.stripe
      ? billingCapabilitiesProfiles.full()
      : billingCapabilitiesProfiles.stack(),
    deletedInstances: ['globex-prod'],
    invoices: [...invoices, ...stripeInvoices],
    lineReports,
    retentionStart: options.retentionStart,
  });
}

/** Billing on, and not one invoice composed yet. */
export function createEmptyInvoicesModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
  });
}

/**
 * More invoices than a page holds: sixty settled ones, which the list reads
 * fifty at a time. The newest is `inv-bulk-60`.
 */
export function createManyInvoicesModel() {
  const invoices = Array.from({ length: 60 }, (_, index) => {
    const number = index + 1;
    const id = `inv-bulk-${String(number).padStart(2, '0')}`;
    const boundaryAt = new Date(
      Date.UTC(2025, 0, 1) + number * 24 * 60 * 60 * 1000,
    ).toISOString();

    return buildInvoice({
      boundaryAt,
      createdAt: boundaryAt,
      id,
      lines: [
        buildInvoiceLine({
          amount: 2900,
          description: '1 × $29.00 per month',
          invoiceId: id,
          label: 'Pro, monthly',
          seq: 1,
          serviceFrom: boundaryAt,
          serviceTo: new Date(
            Date.parse(boundaryAt) + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          type: 'BASE',
          unitAmountDecimal: '2900',
        }),
      ],
      paidAt: boundaryAt,
      status: 'PAID',
    });
  });

  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    invoices,
  });
}
