import { Button } from '@/components/ui/button';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { BellOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import type { DayGroup } from '@/lib/feed-time';
import { Page } from '@/functionals/page';
import { cn } from '@/lib/utils';
import { useNotificationDayGroups } from '../hooks/use-notification-day-groups';
import { useOpenNotification } from '../hooks/use-open-notification';
import { notificationsFeedQueryOptions } from '../queries';
import type {
  Notification,
  NotificationObjectType,
  NotificationStatusFilter,
} from '../types';
import { NOTIFICATIONS_GRID, NotificationRow } from './notification-row';

interface NotificationsFeedListProps {
  status: NotificationStatusFilter;
  objectTypes: readonly NotificationObjectType[];
}

function FeedColumnHeader() {
  const { t } = useTranslation();
  const headerClass =
    'text-xs font-medium tracking-wide text-muted-foreground uppercase';
  return (
    <div
      className={cn('hidden border-b px-3 pb-2 sm:grid', NOTIFICATIONS_GRID)}
    >
      <span aria-hidden />
      <span className={headerClass}>
        {t('Pages.Notifications.table.event', 'Event')}
      </span>
      <span className={headerClass}>
        {t('Pages.Notifications.table.status', 'Status')}
      </span>
      <span className={headerClass}>
        {t('Pages.Notifications.table.time', 'Time')}
      </span>
      <span aria-hidden />
    </div>
  );
}

function useEmptyStateCopy(
  status: NotificationStatusFilter,
  filtered: boolean,
): [title: string, description: string] {
  const { t } = useTranslation();
  // A filtered list says so: "You're all caught up" over a filter would read
  // as though there were nothing at all.
  if (filtered) {
    return [
      t(
        'Pages.Notifications.feed.emptyFiltered',
        'No notifications match these filters',
      ),
      t(
        'Pages.Notifications.feed.emptyFilteredDescription',
        'Try another object type, or reset the filters.',
      ),
    ];
  }
  if (status === 'unread') {
    return [
      t('Pages.Notifications.feed.emptyUnread', 'No unread notifications'),
      t(
        'Pages.Notifications.feed.emptyUnreadDescription',
        'Everything has been read.',
      ),
    ];
  }
  return [
    t('Pages.Notifications.feed.empty', "You're all caught up"),
    t(
      'Pages.Notifications.feed.emptyDescription',
      'New notifications will appear here.',
    ),
  ];
}

function FeedEmptyState({
  status,
  filtered,
}: {
  status: NotificationStatusFilter;
  filtered: boolean;
}) {
  const [title, description] = useEmptyStateCopy(status, filtered);
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <BellOff className="size-8 text-muted-foreground/40" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** What the list shows while a new filter or status loads. */
export function NotificationsFeedListSkeleton() {
  return (
    <Page.Scroll className="mt-4">
      <div className="flex flex-col gap-2 pt-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </Page.Scroll>
  );
}

/**
 * The feed as the body of a `Page layout="scroll"`: the column header in a
 * fixed section, so only the rows scroll under it — the list's own scroll, not
 * the page's (docs/03-patterns/page-scrolling.md).
 */
export function NotificationsFeedList({
  status,
  objectTypes,
}: NotificationsFeedListProps) {
  const { t } = useTranslation();
  const feedQuery = useSuspenseInfiniteQuery(
    notificationsFeedQueryOptions(status, objectTypes),
  );
  const openNotification = useOpenNotification();

  const notifications = feedQuery.data.pages.flatMap((page) => page.data);
  const groups = useNotificationDayGroups(notifications);

  const handleLoadMore = () => {
    void feedQuery.fetchNextPage();
  };

  function renderRow(notification: Notification) {
    return (
      <NotificationRow
        key={notification.id}
        notification={notification}
        onSelect={openNotification}
      />
    );
  }

  function renderGroup(group: DayGroup<Notification>) {
    return (
      <section key={group.key} className="flex flex-col gap-1">
        <div className="flex items-center gap-2 px-1 py-1">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group.heading}
          </h3>
          <span className="text-xs text-muted-foreground/50">
            {t('Pages.Notifications.feed.eventsCount', {
              count: group.entries.length,
            })}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {group.entries.map(renderRow)}
        </div>
      </section>
    );
  }

  if (notifications.length === 0) {
    return (
      <Page.Scroll className="mt-4">
        <FeedEmptyState status={status} filtered={objectTypes.length > 0} />
      </Page.Scroll>
    );
  }

  return (
    <>
      <Page.Fixed className="mt-4">
        <FeedColumnHeader />
      </Page.Fixed>
      <Page.Scroll>
        <div className="flex flex-col gap-5 pt-3">
          {groups.map(renderGroup)}
        </div>
        {feedQuery.hasNextPage && (
          <div className="flex justify-center py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={feedQuery.isFetchingNextPage}
            >
              {feedQuery.isFetchingNextPage && (
                <Loader2 className="animate-spin" aria-hidden />
              )}
              {t('Pages.Notifications.feed.loadMore', 'Load more')}
            </Button>
          </div>
        )}
      </Page.Scroll>
    </>
  );
}
