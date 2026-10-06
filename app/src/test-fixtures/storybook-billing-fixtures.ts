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
