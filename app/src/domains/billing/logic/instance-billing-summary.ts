import type { GetInstancesBillingQuery } from '@/api-client/graphql/graphql';
import { zInstanceBilling } from '@/api-client/zod.gen';
import type { BillingProviderKind } from './billing-providers';
import type { SubscriptionStatus } from './subscription-status';

type BillingItem =
  GetInstancesBillingQuery['instances']['items'][number]['billing'];

/** What the GraphQL API sends of a subscription: the members, with their enums as plain strings. */
export type InstanceBillingSummaryInput = NonNullable<BillingItem>;

/**
 * What the lists of instances show of a subscription (`Instance.billing`). Its
 * enums are strings on the GraphQL API and enums on the REST one, so each is
 * checked against the REST contract before the console reads it: a value it does
 * not know leaves `status` (or `providerKind`) out, and `rawStatus` keeps what was
 * sent, to be shown as it is.
 */
export type InstanceBillingSummary = {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  pastDueSince?: string;
  providerKind?: BillingProviderKind;
  /** The status as the API wrote it, whether or not the console knows it. */
  rawStatus: string;
  /** The status, when it is one of the contract's. */
  status?: SubscriptionStatus;
  trialEndsAt?: string;
};

/** An instance of a page and its subscription; `null` is an instance that was never subscribed. */
export type InstanceBillingEntry = {
  instanceSlug: string;
  summary: InstanceBillingSummary | null;
};

/** A subscription as the REST contract has it, to check the strings of the GraphQL one against. */
const statusSchema = zInstanceBilling.shape.status;
const providerKindSchema = zInstanceBilling.shape.providerKind;

export function toInstanceBillingSummary(
  input: InstanceBillingSummaryInput,
): InstanceBillingSummary {
  const status = statusSchema.safeParse(input.status);
  const providerKind = providerKindSchema.safeParse(input.providerKind);

  return {
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    currentPeriodEnd: input.currentPeriodEnd,
    pastDueSince: input.pastDueSince ?? undefined,
    providerKind: providerKind.success ? providerKind.data : undefined,
    rawStatus: input.status,
    status: status.success ? status.data : undefined,
    trialEndsAt: input.trialEndsAt ?? undefined,
  };
}

/** The instances of one page of the document, each with the summary of its subscription. */
export function toInstanceBillingEntries(
  items: readonly {
    billing: BillingItem;
    slug: string;
  }[],
): InstanceBillingEntry[] {
  return items.map((item) => ({
    instanceSlug: item.slug,
    summary: item.billing ? toInstanceBillingSummary(item.billing) : null,
  }));
}
