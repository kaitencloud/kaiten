import type { InvoicePreview } from '@/api-client';
import { ApiError } from '@/lib/errors';

export { billingCapabilitiesProfiles } from '../../e2e/app/_support/model/billing-capabilities';

/**
 * An `ApiError` carrying a problem document, as the Core API answers a billing
 * call it refuses, for the stories of the billing components.
 */
export const storyBillingProblem = (
  status: number,
  problem: {
    code?: string;
    detail?: string;
    errorId?: string;
    errors?: Array<{ location?: string; message?: string; value?: unknown }>;
  },
) =>
  new ApiError({
    data: { status, title: 'Error', ...problem },
    response: new Response(null, { status }),
    status,
  });

const SERVICE_PERIOD = {
  serviceFrom: '2027-03-01T00:00:00Z',
  serviceTo: '2027-04-01T00:00:00Z',
};

/**
 * The preview of a RENEWAL invoice as the API composes it: an overage line, a
 * usage line capped at what the license accepts, and the base, with the totals
 * the API states.
 */
export const storyInvoicePreview: InvoicePreview = {
  asOf: '2027-03-01T10:00:00Z',
  boundaryAt: '2027-03-01T10:00:00Z',
  currency: 'USD',
  discountTotal: 0,
  kind: 'RENEWAL',
  licenseSlug: 'pro-v2',
  lines: [
    {
      amount: 579,
      description:
        '72,345 above the allowance (100,000): 0.72345 × $8.00 per 100k traces',
      label: 'Traces, overage',
      quantity: '0.72345',
      seq: 1,
      type: 'OVERAGE',
      ...SERVICE_PERIOD,
    },
    {
      amount: 840,
      capped: true,
      description:
        '4.2 × $2.00 per 1M tokens; capped at what the license accepts',
      label: 'GPT-4 tokens',
      quantity: '4.2',
      seq: 2,
      type: 'USAGE',
      ...SERVICE_PERIOD,
    },
    {
      amount: 2900,
      description: '1 × $29.00',
      label: 'Pro, base',
      quantity: '1',
      seq: 3,
      type: 'BASE',
      ...SERVICE_PERIOD,
    },
  ],
  status: 'PREVIEW',
  subtotal: 4319,
  total: 4319,
  wouldHold: [],
};

// The invoices of the stories are built as the mocks build them, so that what a
// story shows is what the console is tested against.
export {
  buildInvoice,
  buildInvoiceLine,
  buildUsageReport,
} from '../../e2e/app/_support/fixtures/build-invoice';

// The subscription of an instance and the price it is pinned to, built as the
// mocks build them.
export { buildPrice } from '../../e2e/app/_support/fixtures/build-pricing';
export { buildSubscription } from '../../e2e/app/_support/fixtures/build-subscription';
export { buildLicense } from '../../e2e/app/_support/fixtures/build-license';

// The versions of an add-on, what they grant and what an instance holds of them, built
// as the mocks build them.
export {
  buildAddon,
  buildAddonGrant,
  buildInstanceAddon,
} from '../../e2e/app/_support/fixtures/build-addon';
