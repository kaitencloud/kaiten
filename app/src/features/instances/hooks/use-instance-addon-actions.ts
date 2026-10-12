import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement, InstanceAddon } from '@/api-client';
import { useBoundaryRetry } from '@/domains/billing';
import { useAddonChangeReport } from './use-addon-change-report';
import { useInstanceAddonMutations } from './use-instance-addon-mutations';

/** A change to an add-on an instance holds, made from its list. */
export type AddonChange =
  | { held: InstanceAddon; kind: 'quantity'; label: string; quantity: number }
  | { held: InstanceAddon; kind: 'remove'; label: string };

export type InstanceAddonActions = ReturnType<typeof useInstanceAddonActions>;

/**
 * What the list of the add-ons of an instance does to them: it steps a quantity and
 * takes an add-on off, one change at a time. The first change takes the request, and
 * the ones asked for before the answer are ignored, so that a double click cannot
 * send two. A period being closed is waited out (`closing`) and the change is made
 * once more after it, as every change to a subscription is. Any other refusal is
 * kept (`failure`) with the change it was about, for the list to show above it with
 * a way to ask again; the quantity shown goes back to the one the API holds, since
 * nothing is optimistic.
 */
export function useInstanceAddonActions(
  instanceSlug: string,
  entitlements: readonly Pick<Entitlement, 'name' | 'slug'>[],
) {
  const { t } = useTranslation();
  const mutations = useInstanceAddonMutations(instanceSlug);
  const report = useAddonChangeReport(instanceSlug, entitlements);
  const { closing, send } = useBoundaryRetry();
  const [pending, setPending] = useState<AddonChange | null>(null);
  const [failure, setFailure] = useState<{
    change: AddonChange;
    error: unknown;
  } | null>(null);
  const busy = useRef(false);

  function request(change: AddonChange): Promise<unknown> {
    const path = { addonSlug: change.held.addonSlug, instanceSlug };

    return change.kind === 'quantity'
      ? mutations.setQuantity.mutateAsync({
          body: { quantity: change.quantity },
          path,
        })
      : mutations.detach.mutateAsync({ path });
  }

  async function perform(change: AddonChange): Promise<boolean> {
    if (busy.current) {
      return false;
    }
    busy.current = true;
    setPending(change);
    setFailure(null);
    try {
      await report(
        () => send(() => request(change)),
        change.kind === 'quantity'
          ? t(
              'Pages.Customers.Instances.Detail.Billing.Addons.Toasts.quantity',
              {
                name: change.label,
                quantity: change.quantity,
              },
            )
          : t(
              'Pages.Customers.Instances.Detail.Billing.Addons.Toasts.removed',
              {
                name: change.label,
              },
            ),
      );

      return true;
    } catch (error) {
      setFailure({ change, error });

      return false;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  return {
    closing,
    failure,
    pending,
    perform,
    retry: () => (failure ? perform(failure.change) : Promise.resolve(false)),
  };
}
