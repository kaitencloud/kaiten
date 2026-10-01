import { Button } from '@/components/ui/button';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Bell, CheckCheck, Settings2 } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FilterToolbarFilterButton,
  FilterToolbarFiltersRow,
  FilterToolbarProvider,
  FilterToolbarQuickAccessFilters,
} from '@/functionals/filters';
import { Page } from '@/functionals/page';
import { useMarkNotificationsRead } from '../hooks/use-mark-notifications-read';
import { useNotificationObjectFilter } from '../hooks/use-notification-object-filter';
import {
  notificationsFeedQueryOptions,
  notificationsUnreadCountQueryOptions,
} from '../queries';
import type { NotificationStatusFilter } from '../types';
import { NotificationStatusSegments } from './notification-status-segments';
import {
  NotificationsFeedList,
  NotificationsFeedListSkeleton,
} from './notifications-feed-list';

interface NotificationsPageContentProps {
  status: NotificationStatusFilter;
  onStatusChange: (status: NotificationStatusFilter) => void;
}

export function NotificationsPageContent({
  status,
  onStatusChange,
}: NotificationsPageContentProps) {
  const { t } = useTranslation();
  const unreadCountQuery = useQuery(notificationsUnreadCountQueryOptions);
  const markRead = useMarkNotificationsRead();
  const { controller, objectTypes } = useNotificationObjectFilter();
  // The same query the list suspends on: this reads its cache without a second
  // request, for the count that came with the (possibly filtered) page.
  const feedQuery = useInfiniteQuery(
    notificationsFeedQueryOptions(status, objectTypes),
  );

  // "Mark all as read" marks everything, so it follows the unfiltered count;
  // the count beside "Unread" describes the list under it, so it follows the
  // filter.
  const unreadCount = unreadCountQuery.data ?? 0;
  const listedUnreadCount =
    feedQuery.data?.pages[0]?.unreadCount ?? unreadCount;

  const handleMarkAllRead = () => {
    markRead.mutate({ body: { all: true } });
  };

  return (
    // Fixed header + full-bleed scroll body (docs/03-patterns/page-scrolling.md).
    <Page layout="scroll">
      <Page.Fixed>
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <Bell className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{t('Pages.Notifications.title')}</Page.Title>
              <Page.Subtitle>{t('Pages.Notifications.subtitle')}</Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
          <Page.Actions className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0 || markRead.isPending}
            >
              <CheckCheck />
              {t('Pages.Notifications.markAllRead', 'Mark all as read')}
            </Button>
            <Button
              variant="ghost"
              nativeButton={false}
              role="link"
              render={
                <Link to="/settings/notifications">
                  <Settings2 />
                  {t('Pages.Notifications.preferences', 'Preferences')}
                </Link>
              }
            />
          </Page.Actions>
        </Page.Header>

        {/* The feature-flags list's toolbar, without its search: the object
            filter is a quick-access chip. The "Filter" button and the row only
            appear once there is a filter that is not quick access. */}
        <FilterToolbarProvider controller={controller}>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <NotificationStatusSegments
              status={status}
              unreadCount={listedUnreadCount}
              onChange={onStatusChange}
            />
            <FilterToolbarQuickAccessFilters />
            <FilterToolbarFilterButton />
          </div>
          <FilterToolbarFiltersRow className="mt-3" />
        </FilterToolbarProvider>
      </Page.Fixed>

      {/* Its own boundary: a new filter suspends the list, and nothing above it
          -- the filter's own state included -- may unmount while it loads. */}
      <Suspense fallback={<NotificationsFeedListSkeleton />}>
        {/* Renders its own fixed column header and scroll body. */}
        <NotificationsFeedList status={status} objectTypes={objectTypes} />
      </Suspense>
    </Page>
  );
}
