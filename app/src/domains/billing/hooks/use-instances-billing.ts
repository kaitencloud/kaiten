import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useBillingCapabilities } from '../queries/billing-capabilities';
import { instancesBillingQueryOptions } from '../queries/instances-billing-query-options';
import type { InstanceBillingSummary } from '../logic/instance-billing-summary';
import { useCanPerform } from './use-can-perform';

/** What a list of instances knows of their subscriptions, once it may. */
export type InstancesBilling = {
  /** Whether the list has a Billing column: billing is on, the session may read it, and the read did not fail. */
  available: boolean;
  /** The subscriptions are being read: the column is there, its cells are not filled yet. */
  isPending: boolean;
  /**
   * The subscription of an instance: `null` for one that was never subscribed, which
   * is also what an instance the read did not return (created since) comes to.
   */
  summaryOf: (instanceSlug: string) => InstanceBillingSummary | null;
};

/** No column: billing is off, or the session may not read it, or the read failed. */
export const NO_INSTANCES_BILLING: InstancesBilling = {
  available: false,
  isPending: false,
  summaryOf: () => null,
};

/**
 * The subscription of each instance, for the Billing column of the lists of
 * instances. Nothing is asked for unless `GET /billing/capabilities` says billing
 * is on and the session holds the scope that reads a subscription (read:billing):
 * the API refuses a whole document when one of its scopes is missing, so the
 * document is not sent to a session it would be refused for, and the lists keep
 * the instances document they have always had. A token that does not say which
 * scopes it carries is given the benefit of the doubt, and the list drops the column
 * if the API refuses.
 */
export function useInstancesBilling(): InstancesBilling {
  const { isEnabled } = useBillingCapabilities();
  const mayRead = useCanPerform('subscription.read');
  const enabled = isEnabled && mayRead;
  const { data, isError, isPending } = useQuery({
    ...instancesBillingQueryOptions,
    enabled,
  });

  return useMemo<InstancesBilling>(() => {
    if (!enabled || isError) {
      return NO_INSTANCES_BILLING;
    }
    const summaries = new Map(
      (data ?? []).map((entry) => [entry.instanceSlug, entry.summary]),
    );

    return {
      available: true,
      isPending,
      summaryOf: (instanceSlug) => summaries.get(instanceSlug) ?? null,
    };
  }, [data, enabled, isError, isPending]);
}
