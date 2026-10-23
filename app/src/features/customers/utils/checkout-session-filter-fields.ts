import type { TFunction } from 'i18next';
import type { CheckoutSessionAdmin } from '@/api-client';
import type { FilterFieldDefinition } from '@/functionals/filters';
import {
  CHECKOUT_SESSION_STATUS_LABEL_KEYS,
  CHECKOUT_SESSION_STATUSES,
} from './checkout-session';

/** The ids of the filters of the list: the search is pinned, the others are picked from the Filter menu. */
export const CHECKOUT_SESSION_FILTER_IDS = {
  clientReference: 'clientReference',
  email: 'email',
  search: 'query',
  status: 'status',
} as const;

/**
 * What the search of the list matches: the e-mail the visitor gave, the vendor's own
 * reference, the licence, the customer and the instance the checkout created, the label
 * of the key whose page started it, and the id of the checkout. A part of any of them is
 * enough, in any case. The search runs in the browser on the list the page holds: what is
 * typed in it is never sent anywhere.
 */
export function getCheckoutSessionSearchTokens(
  session: CheckoutSessionAdmin,
  keyLabels: Readonly<Record<string, string>>,
): string[] {
  return [
    session.email,
    session.clientReferenceId ?? '',
    session.licenseSlug,
    session.customerSlug ?? '',
    session.instanceSlug ?? '',
    keyLabels[session.publishableKeyId] ?? '',
    session.sessionId,
  ];
}

/**
 * The fields of the list: the search, then the status (the API reads a checkout left
 * open past its expiry as abandoned), the e-mail of the visitor and the vendor's
 * reference.
 */
export function createCheckoutSessionFilterFields({
  keyLabels,
  t,
}: {
  keyLabels: Readonly<Record<string, string>>;
  t: TFunction;
}): FilterFieldDefinition<CheckoutSessionAdmin>[] {
  const prefix = 'Pages.Customers.CheckoutSessions.Filters';

  return [
    {
      accessor: (session) => getCheckoutSessionSearchTokens(session, keyLabels),
      id: CHECKOUT_SESSION_FILTER_IDS.search,
      label: t(`${prefix}.search`),
      placeholder: t(`${prefix}.searchPlaceholder`),
      type: 'text',
    },
    {
      accessor: (session) => session.status,
      id: CHECKOUT_SESSION_FILTER_IDS.status,
      label: t(`${prefix}.status`),
      options: CHECKOUT_SESSION_STATUSES.map((status) => ({
        label: t(CHECKOUT_SESSION_STATUS_LABEL_KEYS[status]),
        value: status,
      })),
      type: 'enum_list',
    },
    {
      accessor: (session) => session.email,
      id: CHECKOUT_SESSION_FILTER_IDS.email,
      label: t(`${prefix}.email`),
      placeholder: t(`${prefix}.emailPlaceholder`),
      type: 'text',
    },
    {
      accessor: (session) => session.clientReferenceId ?? '',
      id: CHECKOUT_SESSION_FILTER_IDS.clientReference,
      label: t(`${prefix}.clientReference`),
      placeholder: t(`${prefix}.clientReferencePlaceholder`),
      type: 'text',
    },
  ];
}
