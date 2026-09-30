import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage, isApiError } from '@/lib/errors';
import { seedDemoData } from '../demo-sandbox.api';
import { demoStatusQueryKey } from './use-demo-status';

// POST /demo/seed creates the caller's demo sandbox data. Only valid when
// the org has no demo data yet; once seeded, use-reset-demo's mutation is
// the counterpart that clears it back to empty. A 409 means a seed/reset
// is already running -- expected if the user double-clicks or another tab
// kicked one off -- so it is surfaced as an informational toast rather
// than an error.
export function useSeedDemoData() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: seedDemoData,
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        toast.info(t('Features.DemoSandbox.Toasts.alreadyRunning'));
        return;
      }
      toast.error(getApiErrorMessage(error));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: demoStatusQueryKey,
      });
      toast.success(t('Features.DemoSandbox.Toasts.seedStarted'));
    },
  });
}
