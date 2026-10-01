import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { DayGroup } from '@/domains/audit-trail';
import { useMarkNotificationsRead } from '../hooks/use-mark-notifications-read';
import { useNotificationDayGroups } from '../hooks/use-notification-day-groups';
import { useOpenNotification } from '../hooks/use-open-notification';
import { notificationsFeedQueryOptions } from '../queries';
import type { Notification } from '../types';
import { NotificationItem } from './notification-item';

const PANEL_ITEM_LIMIT = 6;

interface NotificationPanelProps {
  onClose: () => void;
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const { t } = useTranslation();
  const feedQuery = useInfiniteQuery(notificationsFeedQueryOptions('all'));
  const markRead = useMarkNotificationsRead();
  const openNotification = useOpenNotification();

  const notifications =
    feedQuery.data?.pages
      .flatMap((page) => page.data)
      .slice(0, PANEL_ITEM_LIMIT) ?? [];
  const groups = useNotificationDayGroups(notifications);
  const unreadCount = feedQuery.data?.pages[0]?.unreadCount ?? 0;

  const handleSelect = (notification: Notification) => {
    onClose();
    openNotification(notification);
  };

  const handleMarkAllRead = () => {
    markRead.mutate({ body: { all: true } });
  };

  function renderNotification(notification: Notification) {
    return (
      <NotificationItem
        key={notification.id}
        notification={notification}
        onSelect={handleSelect}
      />
    );
  }

  function renderGroup(group: DayGroup<Notification>) {
    return (
      <section key={group.key} className="flex flex-col gap-1">
        <h4 className="px-1 pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {group.heading}
        </h4>
        {group.entries.map(renderNotification)}
      </section>
    );
  }

  function renderList() {
    if (feedQuery.isPending) {
      return <PanelSkeleton />;
    }
    if (feedQuery.isError) {
      return (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {t(
            'Pages.Notifications.feed.error',
            'Notifications could not be loaded.',
          )}
        </p>
      );
    }
    if (notifications.length === 0) {
      return (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {t('Pages.Notifications.feed.empty', "You're all caught up")}
        </p>
      );
    }
    return <>{groups.map(renderGroup)}</>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Bell className="size-4" aria-hidden />
          {t('Pages.Notifications.title', 'Notifications')}
        </h3>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {t('Pages.Notifications.bell.unreadBadge', {
                count: unreadCount,
              })}
            </Badge>
          )}
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMarkAllRead}
              disabled={markRead.isPending}
              aria-label={t(
                'Pages.Notifications.markAllRead',
                'Mark all as read',
              )}
              title={t('Pages.Notifications.markAllRead', 'Mark all as read')}
            >
              <CheckCheck />
            </Button>
          )}
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-3 py-3">{renderList()}</div>
      </ScrollArea>
      <Separator />
      <div className="shrink-0 bg-muted/30 p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onClose}
          nativeButton={false}
          role="link"
          render={
            <Link to="/notifications">
              {t('Pages.Notifications.bell.viewAll', 'View all notifications')}
            </Link>
          }
        />
      </div>
    </div>
  );
}
