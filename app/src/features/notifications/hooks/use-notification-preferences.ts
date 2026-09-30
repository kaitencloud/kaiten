import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { putNotificationPreferencesMutation } from '@/api-client/@tanstack/react-query.gen';
import { getApiErrorMessage } from '@/lib/errors';
import { notificationPreferencesQueryKey } from '../queries';
import type {
  PreferenceMatrix,
  PutNotificationPreferencesInput,
} from '../types';

function applyPreferenceInput(
  matrix: PreferenceMatrix,
  input: PutNotificationPreferencesInput,
): PreferenceMatrix {
  const updates = new Map(
    (input.events ?? []).map((event) => [event.eventName, event.channels]),
  );

  return {
    ...matrix,
    events: matrix.events.map((event) => {
      const channels = updates.get(event.eventName);
      if (!channels) {
        return event;
      }
      return { ...event, channels: { ...event.channels, ...channels } };
    }),
  };
}

export function useNotificationPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...putNotificationPreferencesMutation(),
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({
        queryKey: notificationPreferencesQueryKey,
      });
      const previous = queryClient.getQueryData<PreferenceMatrix>(
        notificationPreferencesQueryKey,
      );

      if (previous) {
        queryClient.setQueryData(
          notificationPreferencesQueryKey,
          applyPreferenceInput(previous, body),
        );
      }

      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          notificationPreferencesQueryKey,
          context.previous,
        );
      }
      toast.error(getApiErrorMessage(error));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: notificationPreferencesQueryKey,
      });
    },
  });
}
