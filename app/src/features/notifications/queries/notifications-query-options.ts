import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  getNotificationPreferencesOptions,
  getNotificationPreferencesQueryKey,
  listNotificationsInfiniteQueryKey,
  listNotificationsOptions,
  listNotificationsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { listNotifications } from '@/api-client/sdk.gen';
import type {
  NotificationObjectType,
  NotificationStatusFilter,
} from '../types';

const FEED_PAGE_SIZE = 25;

// The list's query for one feed. The object types are sorted into it, so the
// same selection, picked in another order, reads from the same cache entry.
function feedQuery(
  status: NotificationStatusFilter,
  objectTypes: readonly NotificationObjectType[],
) {
  return {
    query: {
      status,
      objectType: objectTypes.length > 0 ? [...objectTypes].sort() : undefined,
      limit: FEED_PAGE_SIZE,
    },
  };
}

/** Every feed, whatever its status and object types. */
export const notificationsFeedBaseQueryKey =
  listNotificationsInfiniteQueryKey();

// The generated call under the generated key, but not the generated
// listNotificationsInfiniteOptions: that one types its queryFn as possibly
// skipToken, which useSuspenseInfiniteQuery refuses.
export const notificationsFeedQueryOptions = (
  status: NotificationStatusFilter = 'all',
  objectTypes: readonly NotificationObjectType[] = [],
) => {
  const { query } = feedQuery(status, objectTypes);

  return infiniteQueryOptions({
    queryKey: listNotificationsInfiniteQueryKey({ query }),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listNotifications({
        query: { ...query, cursor: pageParam },
        signal,
        throwOnError: true,
      });

      return data;
    },
    // The first page asks for no cursor, each next one for the last page's.
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
};

// The badge's count travels on every page of the list, so the smallest page of
// unread notifications is where the badge reads it from.
const unreadCountQuery = { query: { status: 'unread' as const, limit: 1 } };

export const notificationsUnreadCountQueryKey =
  listNotificationsQueryKey(unreadCountQuery);

export const notificationsUnreadCountQueryOptions = queryOptions({
  ...listNotificationsOptions(unreadCountQuery),
  select: (list) => list.unreadCount,
  // Mounted app-wide via the bell: never retry-loop when the API is down.
  retry: false,
});

export const notificationPreferencesQueryKey =
  getNotificationPreferencesQueryKey();

export const notificationPreferencesQueryOptions =
  getNotificationPreferencesOptions();
