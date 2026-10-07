import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadUsageHistory, type UsageHistoryRange } from '../queries';

/**
 * Saves the usage reports of a period as a CSV: a request like another, with its
 * own pending state. A refusal of the API (a period that is too long, or that
 * reaches before what is kept) is shown as it was written, and the drawer stays
 * as it was.
 */
export function useExportUsageHistory() {
  return useMutation({
    mutationFn: ({
      entitlementSlug,
      instanceSlug,
      range,
    }: {
      entitlementSlug: string;
      instanceSlug: string;
      range: UsageHistoryRange;
    }) => downloadUsageHistory(instanceSlug, entitlementSlug, range),
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
}
