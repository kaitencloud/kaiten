import type { CheckoutSessionAdmin } from '@/api-client';

const CREATED_AT = '2026-10-01T09:00:00.000Z';

type CheckoutSessionStatus = CheckoutSessionAdmin['status'];

/** A moment `hours` after an ISO instant, for the moments a checkout is built from. */
const hoursAfter = (instant: string, hours: number) =>
  new Date(Date.parse(instant) + hours * 3_600_000).toISOString();

/**
 * Build an anonymous checkout as the vendor reads it (`GET /checkout-sessions`): the
 * e-mail the visitor gave, the licence and period it chose, the amount due today and the
 * key whose page started it. It never carries the token the visitor holds, nor a voucher
 * code. A checkout expires a day after it starts, and a customer and an instance exist
 * only once the completion has run: pass their slugs for a checkout that got there.
 * `closedAt` follows the status as the API sets it: null while the checkout is open or
 * waits for its payment, the moment it ended otherwise.
 */
export function buildCheckoutSession({
  addOns = [],
  billingPeriod = 'MONTHLY',
  clientReferenceId = null,
  closedAt,
  createdAt = CREATED_AT,
  customerSlug = null,
  dueToday,
  email,
  instanceSlug = null,
  licenseSlug = 'pro',
  priceId = 'price-pro-monthly',
  publishableKeyId = 'pk-checkout',
  sessionId,
  status = 'OPEN',
  trialEndsAt = null,
  trialRefusedReason = null,
}: {
  addOns?: CheckoutSessionAdmin['addOns'];
  billingPeriod?: string;
  clientReferenceId?: string | null;
  closedAt?: string | null;
  createdAt?: string;
  customerSlug?: string | null;
  /** What is due today; one base line of 49.00 EUR when left out. */
  dueToday?: CheckoutSessionAdmin['dueToday'];
  email: string;
  instanceSlug?: string | null;
  licenseSlug?: string;
  priceId?: string;
  publishableKeyId?: string;
  sessionId: string;
  status?: CheckoutSessionStatus;
  trialEndsAt?: string | null;
  trialRefusedReason?: string | null;
}): CheckoutSessionAdmin {
  const ended = status !== 'OPEN' && status !== 'AWAITING_PAYMENT';
  const closed =
    closedAt === undefined
      ? ended
        ? hoursAfter(createdAt, status === 'COMPLETED' ? 1 : 24)
        : null
      : closedAt;

  return {
    addOns,
    billingPeriod,
    clientReferenceId,
    closedAt: closed,
    completedAt: status === 'COMPLETED' ? closed : null,
    createdAt,
    customerSlug,
    dueToday: dueToday ?? {
      currency: 'EUR',
      discountTotal: 0,
      lines: [
        {
          amount: 4900,
          description: 'Pro, billed monthly',
          label: 'Pro',
          quantity: '1',
          seq: 1,
          serviceFrom: createdAt,
          serviceTo: hoursAfter(createdAt, 24 * 30),
          type: 'BASE',
          unitAmountDecimal: '4900',
        },
      ],
      subtotal: 4900,
      total: 4900,
    },
    email,
    expiresAt: hoursAfter(createdAt, 24),
    instanceSlug,
    licenseSlug,
    priceId,
    publishableKeyId,
    sessionId,
    status,
    trialEndsAt,
    trialRefusedReason,
  };
}
