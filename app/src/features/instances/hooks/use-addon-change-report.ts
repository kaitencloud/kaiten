import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Entitlement, EntitlementUsage } from '@/api-client';
import { getEntitlementsUsageMetricsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { describeEffectiveChange } from '../utils/instance-addon-effects.utils';
import { diffEffectiveValues } from '../utils/instance-addons.utils';

/**
 * Makes a change to the add-ons of an instance and tells what it did to what the
 * instance is entitled to. An add-on applies at once, and the API composes the
 * effective value of each entitlement (the console cannot work out how an add-on
 * adds to, replaces or raises what the license grants), so the effective values are
 * read before the change and again once the screens have been refreshed from the
 * answer, and the difference is what the toast says. A change that is refused says
 * nothing: the caller shows the refusal.
 */
export function useAddonChangeReport(
  instanceSlug: string,
  entitlements: readonly Pick<Entitlement, 'name' | 'slug'>[],
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const usageKey = getEntitlementsUsageMetricsQueryKey({
    path: { instanceSlug },
  });
  const read = () => queryClient.getQueryData<EntitlementUsage[]>(usageKey);

  return async function report<T>(
    change: () => Promise<T>,
    title: string,
  ): Promise<T> {
    const before = read();
    const result = await change();
    const lines = diffEffectiveValues(before, read()).map((effect) =>
      describeEffectiveChange(effect, entitlements, t),
    );

    toast.success(
      title,
      lines.length > 0 ? { description: lines.join(' · ') } : undefined,
    );

    return result;
  };
}
