import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { revokePublishableKeyMutation } from '@/api-client/@tanstack/react-query.gen';
import { invalidatePublishableKeyQueries } from '../queries';

/**
 * Revokes a key. A revocation is final and answers the same when it is asked again, so
 * a key revoked from another tab is a success here too. Nothing is optimistic: the list
 * shows the key revoked once the API said so and the list was read again, and a refusal
 * is the caller's to show where the person is looking, in the dialog that asked.
 */
export function useRevokePublishableKey() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    ...revokePublishableKeyMutation(),
    onSuccess: async (revoked) => {
      await invalidatePublishableKeyQueries(queryClient);
      toast.success(
        t('Pages.Integrations.PublishableKeys.Revoke.success', {
          label: revoked.label,
        }),
      );
    },
  });
}
