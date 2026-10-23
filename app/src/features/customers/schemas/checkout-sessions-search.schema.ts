import { z } from 'zod';
import {
  CHECKOUT_SESSION_STATUSES,
  type CheckoutSessionStatus,
} from '../utils/checkout-session';
import { CHECKOUT_SESSION_FILTER_IDS } from '../utils/checkout-session-filter-fields';

// The statuses as an address spells them.
const STATUS_PARAMS = CHECKOUT_SESSION_STATUSES.map((status) =>
  status.toLowerCase(),
) as [string, ...string[]];

/**
 * What a link can open the checkouts on. `?status=` is a filter already set, in the
 * words the address uses (`open`, `awaiting_payment`, `completed`, `abandoned`,
 * `expired`): it only seeds the filter when the list opens, and what the person then
 * changes is not written back. `?session=<id>` opens the panel of that checkout over the
 * list, so that a checkout can be linked to and the back button closes it. A link is not
 * an API call, so what does not read as one of these is dropped, field by field.
 */
const checkoutSessionsSearchSchema = z.object({
  session: z.string().trim().min(1).optional().catch(undefined),
  status: z.enum(STATUS_PARAMS).optional().catch(undefined),
});

export type CheckoutSessionsSearch = z.output<
  typeof checkoutSessionsSearchSchema
>;

export function readCheckoutSessionsSearch(
  search: Record<string, unknown>,
): CheckoutSessionsSearch {
  return checkoutSessionsSearchSchema.parse(search);
}

/** The status a `?status=` stands for. */
export function statusOfParam(
  param: string | undefined,
): CheckoutSessionStatus | undefined {
  return CHECKOUT_SESSION_STATUSES.find(
    (status) => status.toLowerCase() === param,
  );
}

/** The values the filters of the list open with, by filter id. */
export function toInitialFilterValues(
  search: CheckoutSessionsSearch,
): Record<string, string> {
  const status = statusOfParam(search.status);

  return status ? { [CHECKOUT_SESSION_FILTER_IDS.status]: status } : {};
}
