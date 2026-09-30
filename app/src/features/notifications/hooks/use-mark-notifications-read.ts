import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { markNotificationsReadMutation } from '@/api-client/@tanstack/react-query.gen';
import { getApiErrorMessage } from '@/lib/errors';
import { notificationsFeedBaseQueryKey, setUnreadCount } from '../queries';

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    ...markNotificationsReadMutation(),
    onSuccess: async (result) => {
      setUnreadCount(queryClient, result.unreadCount);
      await queryClient.invalidateQueries({
        queryKey: notificationsFeedBaseQueryKey,
      });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
}
