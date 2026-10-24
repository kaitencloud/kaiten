import type { CheckoutSessionAdmin, PublishableKey } from '@/api-client';
import {
  buildCheckoutSession,
  buildCustomer,
  buildPublishableKey,
  SYSTEM_USER,
} from '../_support/fixtures';
import { BillingAppModel } from '../_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';
import { CustomerAppModel } from '../_support/model/customer-app-model';

/** The moment the specs freeze the page at: the checkouts below are judged from it. */
export const CHECKOUT_NOW = '2026-10-07T12:00:00.000Z';

/**
 * The page that opens the anonymous checkout, and a key retired since: the label of
 * each is what a checkout shows for the key that started it.
 */
export const CHECKOUT_KEYS: PublishableKey[] = [
  buildPublishableKey({
    allowedOrigins: ['https://shop.acme.test'],
    anonymousCheckout: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    id: 'pk-checkout',
    keyHint: 'k7Lm',
    label: 'Checkout page',
  }),
  buildPublishableKey({
    allowedOrigins: ['https://old.acme.test'],
    anonymousCheckout: true,
    createdAt: '2026-06-01T12:00:00.000Z',
    id: 'pk-old',
    keyHint: 'z9Y8',
    label: 'Legacy checkout',
    revokedAt: '2026-08-15T12:00:00.000Z',
  }),
];

/**
 * Six checkouts, one of every kind the page tells apart:
 * - open and waiting for its payment, two that are still going;
 * - completed, which created a customer and an instance, with a vendor reference;
 * - completed on an annual plan with a trial, an add-on and a discount, started from
 *   the retired key;
 * - expired after the completion ran, whose customer and instance stay (reference
 *   `cmp-42`);
 * - open but past its expiry, which the API reads as abandoned.
 */
export const CHECKOUT_SESSIONS: CheckoutSessionAdmin[] = [
  buildCheckoutSession({
    createdAt: '2026-10-07T11:00:00.000Z',
    email: 'dana@hooli.test',
    sessionId: 'cs-open',
    status: 'OPEN',
  }),
  buildCheckoutSession({
    createdAt: '2026-10-07T09:30:00.000Z',
    email: 'ravi@initech.test',
    sessionId: 'cs-awaiting',
    status: 'AWAITING_PAYMENT',
  }),
  buildCheckoutSession({
    clientReferenceId: 'cmp-17',
    createdAt: '2026-10-06T10:00:00.000Z',
    customerSlug: 'bought-online',
    email: 'alice@acme.test',
    instanceSlug: 'bought-online-prod',
    sessionId: 'cs-completed',
    status: 'COMPLETED',
    trialRefusedReason: 'ALREADY_CONSUMED',
  }),
  buildCheckoutSession({
    addOns: [{ addonSlug: 'extra-seats', quantity: 3 }],
    billingPeriod: 'ANNUAL',
    createdAt: '2026-10-05T08:00:00.000Z',
    customerSlug: 'annual-buyer',
    dueToday: {
      currency: 'EUR',
      discountTotal: 5880,
      lines: [
        {
          amount: 58800,
          description: 'Pro, billed yearly',
          label: 'Pro',
          quantity: '1',
          seq: 1,
          serviceFrom: '2026-10-19T00:00:00.000Z',
          serviceTo: '2027-10-19T00:00:00.000Z',
          type: 'BASE',
          unitAmountDecimal: '58800',
        },
        {
          amount: -5880,
          description: 'Voucher discount, 10%',
          label: 'Welcome discount',
          quantity: '1',
          seq: 2,
          serviceFrom: '2026-10-19T00:00:00.000Z',
          serviceTo: '2027-10-19T00:00:00.000Z',
          type: 'DISCOUNT',
          unitAmountDecimal: null,
        },
      ],
      subtotal: 58800,
      total: 52920,
    },
    email: 'carol@globex.test',
    instanceSlug: 'annual-buyer-prod',
    licenseSlug: 'pro-v2',
    priceId: 'price-pro-annual',
    publishableKeyId: 'pk-old',
    sessionId: 'cs-annual',
    status: 'COMPLETED',
    trialEndsAt: '2026-10-19T00:00:00.000Z',
  }),
  buildCheckoutSession({
    clientReferenceId: 'cmp-42',
    createdAt: '2026-10-01T08:00:00.000Z',
    customerSlug: 'lapsed-buyer',
    email: 'finance@globex.test',
    instanceSlug: 'lapsed-buyer-prod',
    sessionId: 'cs-expired',
    status: 'EXPIRED',
  }),
  buildCheckoutSession({
    createdAt: '2026-10-05T08:00:00.000Z',
    email: 'visitor@example.test',
    sessionId: 'cs-lapsed',
    status: 'OPEN',
  }),
];

/** Billing on with the public surface and the keys above, and the checkouts the keys started. */
export function createCheckoutSessionsBillingModel(
  sessions: CheckoutSessionAdmin[] = CHECKOUT_SESSIONS,
) {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    checkoutSessions: { sessions },
    publishableKeys: { keys: CHECKOUT_KEYS },
  });
}

/** Billing on, and not one checkout started yet. */
export function createEmptyCheckoutSessionsBillingModel() {
  return createCheckoutSessionsBillingModel([]);
}

/**
 * The customers the checkouts above created, recorded under Kaiten itself, and a
 * customer a person made whose slug is the path of the list of checkouts.
 */
export function createCheckoutSessionsCustomersModel() {
  const created = (id: string, name: string, slug: string) => ({
    ...buildCustomer({ id, name, slug }),
    createdBy: SYSTEM_USER,
    updatedBy: SYSTEM_USER,
  });

  return new CustomerAppModel({
    customers: [
      created('customer-bought', 'Bought Online', 'bought-online'),
      created('customer-annual', 'Annual Buyer', 'annual-buyer'),
      created('customer-lapsed', 'Lapsed Buyer', 'lapsed-buyer'),
      buildCustomer({
        id: 'customer-shadowed',
        name: 'Checkout Sessions Ltd',
        slug: 'checkout-sessions',
      }),
    ],
    instances: [],
  });
}
