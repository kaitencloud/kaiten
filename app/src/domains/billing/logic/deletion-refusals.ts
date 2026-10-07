import { getProblem } from './billing-problem';

/**
 * The deletions the API refuses because the record is billed or still in use,
 * read from the problem it answers with: an instance whose subscription lives
 * or whose invoices are not settled, a customer in the same case, an
 * entitlement that a license grants, an instance counts or a price meters. The
 * body lists what stands in the way (`errors[0].value`), which a dialog shows
 * with links, so that the person knows what to settle first.
 */

const INSTANCE_CODE = 'DeleteInstance.BillingActive';
const CUSTOMER_CODE = 'DeleteCustomer.BillingActive';
const ENTITLEMENT_CODE = 'DeleteEntitlement.InUseConflict';

/** What can still reference an entitlement, in the order a dialog lists it. */
export const ENTITLEMENT_REFERENCE_KEYS = [
  'licenseGrants',
  'usageCounters',
  'licensePrices',
  'addonPrices',
  'addonGrants',
  'boostGrants',
] as const;

export type EntitlementReferenceKey =
  (typeof ENTITLEMENT_REFERENCE_KEYS)[number];

// A price and a boost grant are never deleted through the API, so an entitlement
// that is metered or boosted stays undeletable: asking for those references to be
// removed would send the person after something that cannot be done.
const PERMANENT_REFERENCE_KEYS: readonly EntitlementReferenceKey[] = [
  'licensePrices',
  'addonPrices',
  'boostGrants',
];

/**
 * Whether an entitlement is held by something that cannot be removed once it
 * exists, a price that meters it or a voucher boost that grants it. The dialog
 * then offers to hide the entitlement instead of deleting it.
 */
export function hasPermanentReference(
  references: ReadonlyArray<{ key: EntitlementReferenceKey }>,
): boolean {
  return references.some(({ key }) => PERMANENT_REFERENCE_KEYS.includes(key));
}

export type DeletionRefusal =
  | {
      /** The API's explanation, to show as it is. */
      detail?: string;
      kind: 'instance';
      /** The status of the subscription, when it has one; any word the API sends. */
      status?: string;
      unpaidInvoiceIds: string[];
    }
  | {
      detail?: string;
      kind: 'customer';
      /** Whether a subscription of one of its instances lives. */
      live: boolean;
      unpaidInvoiceIds: string[];
    }
  | {
      detail?: string;
      kind: 'entitlement';
      /** What references the entitlement, only the kinds there is at least one of. */
      references: Array<{ count: number; key: EntitlementReferenceKey }>;
    };

const ENTITLEMENT_REFERENCE_LABEL_KEYS = {
  addonGrants: 'Features.Billing.DeletionRefusal.references.addonGrants',
  addonPrices: 'Features.Billing.DeletionRefusal.references.addonPrices',
  boostGrants: 'Features.Billing.DeletionRefusal.references.boostGrants',
  licenseGrants: 'Features.Billing.DeletionRefusal.references.licenseGrants',
  licensePrices: 'Features.Billing.DeletionRefusal.references.licensePrices',
  usageCounters: 'Features.Billing.DeletionRefusal.references.usageCounters',
} as const satisfies Record<EntitlementReferenceKey, string>;

/** The translation key of a kind of reference, which takes a `count`. */
export function getEntitlementReferenceLabelKey(
  key: EntitlementReferenceKey,
): string {
  return ENTITLEMENT_REFERENCE_LABEL_KEYS[key];
}

const REFUSAL_TITLE_KEYS = {
  customer: 'Features.Billing.DeletionRefusal.title.customer',
  entitlement: 'Features.Billing.DeletionRefusal.title.entitlement',
  instance: 'Features.Billing.DeletionRefusal.title.instance',
} as const satisfies Record<DeletionRefusal['kind'], string>;

const REFUSAL_DESCRIPTION_KEYS = {
  customer: 'Features.Billing.DeletionRefusal.description.customer',
  entitlement: 'Features.Billing.DeletionRefusal.description.entitlement',
  instance: 'Features.Billing.DeletionRefusal.description.instance',
} as const satisfies Record<DeletionRefusal['kind'], string>;

/** The translation key of the title of the dialog that explains a refusal. */
export function getDeletionRefusalTitleKey(
  kind: DeletionRefusal['kind'],
): string {
  return REFUSAL_TITLE_KEYS[kind];
}

/** The translation key of what a refusal says when the API sent no explanation. */
export function getDeletionRefusalDescriptionKey(
  kind: DeletionRefusal['kind'],
): string {
  return REFUSAL_DESCRIPTION_KEYS[kind];
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id !== '')
    : [];

const asCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

/**
 * Reads what a refused deletion says is in the way, or `undefined` when the
 * failure is not one of these refusals (any other keeps its toast). A member the
 * body leaves out reads as nothing: the API of a release counts what it has, and
 * the dialog lists what it was told.
 */
export function readDeletionRefusal(
  error: unknown,
): DeletionRefusal | undefined {
  const problem = getProblem(error);
  const code = problem?.code;
  if (!problem || !code) {
    return undefined;
  }
  const value = asRecord(problem.errors?.[0]?.value);
  const detail = problem.detail || undefined;

  switch (code) {
    case INSTANCE_CODE:
      return {
        detail,
        kind: 'instance',
        status: typeof value.status === 'string' ? value.status : undefined,
        unpaidInvoiceIds: asIds(value.unpaidInvoiceIds),
      };
    case CUSTOMER_CODE:
      return {
        detail,
        kind: 'customer',
        live: value.live === true,
        unpaidInvoiceIds: asIds(value.unpaidInvoiceIds),
      };
    case ENTITLEMENT_CODE:
      return {
        detail,
        kind: 'entitlement',
        references: ENTITLEMENT_REFERENCE_KEYS.map((key) => ({
          count: asCount(value[key]),
          key,
        })).filter(({ count }) => count > 0),
      };
    default:
      return undefined;
  }
}
