import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  archiveVoucherMutation,
  publishVoucherMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateVoucherQueries } from '@/domains/billing';
import { getApiErrorMessage } from '@/lib/errors';

/**
 * Publishing a draft and archiving a voucher, from its page. Neither is optimistic: the
 * page shows the status the API answered, by reading the voucher again, and a refusal
 * (409: someone else published or archived it) is said in a toast and refreshes the page
 * so that it stops offering what the voucher no longer allows.
 */
export function useVoucherTransitions(voucherId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () => invalidateVoucherQueries(queryClient, voucherId);
  const onError = (error: unknown) => {
    toast.error(getApiErrorMessage(error));
    void refresh();
  };

  return {
    archive: useMutation({
      ...archiveVoucherMutation(),
      onError,
      onSuccess: async () => {
        await refresh();
        toast.success(t('Pages.Vouchers.Actions.archive.success'));
      },
    }),
    publish: useMutation({
      ...publishVoucherMutation(),
      onError,
      onSuccess: async () => {
        await refresh();
        toast.success(t('Pages.Vouchers.Actions.publish.success'));
      },
    }),
  };
}
