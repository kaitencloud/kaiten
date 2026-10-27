import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteVoucherMutation } from '@/api-client/@tanstack/react-query.gen';
import { invalidateVoucherQueries } from '@/domains/billing';
import { getApiErrorMessage } from '@/lib/errors';
import { voucherQueryOptions } from '../queries';

/**
 * Deletes a voucher no instance redeemed, from its page, and goes back to the list. A
 * refusal (409: an instance redeemed it meanwhile, or a checkout waiting for its payment
 * applies it) is said in a toast and refreshes the page, which then stops offering it.
 */
export function useDeleteVoucher(voucherId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    ...deleteVoucherMutation(),
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
      void invalidateVoucherQueries(queryClient, voucherId);
    },
    // The lists are read again, the voucher is forgotten. Its page is left first: it
    // observes the voucher, and dropping the query under it asks for the voucher again.
    // Dropped after, it cannot be drawn back from the cache by Back.
    onSuccess: async () => {
      toast.success(t('Pages.Vouchers.Actions.delete.success'));
      await invalidateVoucherQueries(queryClient);
      await navigate({ to: '/catalog/vouchers' });
      queryClient.removeQueries({
        queryKey: voucherQueryOptions(voucherId).queryKey,
      });
    },
  });
}
