import type { QueryClient } from '@tanstack/react-query';
import type { NotificationListResponse } from '../types';
import {
  notificationsFeedBaseQueryKey,
  notificationsUnreadCountQueryKey,
} from './notifications-query-options';

export async function invalidateNotificationFeedQueries(
  queryClient: QueryClient,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: notificationsFeedBaseQueryKey }),
    queryClient.invalidateQueries({
      queryKey: notificationsUnreadCountQueryKey,
    }),
  ]);
}

// The badge's count lives on the page its query caches (see
// notificationsUnreadCountQueryOptions), so only a cached page can take it; with
// none yet, the badge's own fetch brings the count.
export function setUnreadCount(queryClient: QueryClient, unreadCount: number) {
  queryClient.setQueryData<NotificationListResponse>(
    notificationsUnreadCountQueryKey,
    (list) => (list ? { ...list, unreadCount } : list),
  );
}
