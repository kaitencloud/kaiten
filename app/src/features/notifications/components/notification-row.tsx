import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatRelativeTimeToNow, formatTimeOfDay } from '@/lib/feed-time';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import type { Notification } from '../types';
import {
  getNotificationEventMeta,
  toneCircleClass,
  toneIconClass,
  toneUnreadBackgroundClass,
} from './notification-event-meta';

// Same column rhythm as the audit-trail feed (AUDIT_GRID), minus the columns
// notifications do not have: icon | Event | Status | Time | chevron.
export const NOTIFICATIONS_GRID =
  'grid grid-cols-[2.25rem_minmax(0,2.5fr)_7rem_8rem_1.25rem] items-center gap-3';

function NotificationIconCircle({
  notification,
}: {
  notification: Notification;
}) {
  const { Icon, tone } = getNotificationEventMeta(notification.eventName);
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full',
        toneCircleClass[tone],
      )}
    >
      <Icon className={cn('size-4', toneIconClass[tone])} aria-hidden />
    </span>
  );
}

// Both states are a badge, so the column lines up whichever one a row shows;
// read stays muted, like a read row's title.
function NotificationStatusBadge({ isUnread }: { isUnread: boolean }) {
  const { t } = useTranslation();
  if (!isUnread) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t('Pages.Notifications.item.read', 'Read')}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-primary/30 bg-primary/10 text-primary-subtle-foreground"
    >
      {t('Pages.Notifications.item.unread', 'Unread')}
    </Badge>
  );
}

interface NotificationRowVariantProps {
  notification: Notification;
  locale: string;
  isUnread: boolean;
}

function NotificationRowDesktop({
  notification,
  locale,
  isUnread,
}: NotificationRowVariantProps) {
  return (
    <div className={cn('hidden px-3 py-2.5 sm:grid', NOTIFICATIONS_GRID)}>
      <NotificationIconCircle notification={notification} />
      <div className="min-w-0">
        <p
          className={cn(
            'truncate text-sm',
            isUnread ? 'font-medium' : 'text-muted-foreground',
          )}
        >
          {notification.title}
        </p>
        {notification.body ? (
          <p className="truncate text-xs text-muted-foreground">
            {notification.body}
          </p>
        ) : null}
      </div>
      <div>
        <NotificationStatusBadge isUnread={isUnread} />
      </div>
      <div title={formatDateTime(notification.createdAt)}>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTimeToNow(notification.createdAt, locale)}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground/70">
          {formatTimeOfDay(notification.createdAt, locale)}
        </p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </div>
  );
}

function NotificationRowMobile({
  notification,
  locale,
  isUnread,
}: NotificationRowVariantProps) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 sm:hidden">
      <NotificationIconCircle notification={notification} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'truncate text-sm',
              isUnread ? 'font-medium' : 'text-muted-foreground',
            )}
          >
            {notification.title}
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </div>
        {notification.body ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {notification.body}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <NotificationStatusBadge isUnread={isUnread} />
          <span
            className="text-xs text-muted-foreground"
            title={formatDateTime(notification.createdAt)}
          >
            {formatRelativeTimeToNow(notification.createdAt, locale)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface NotificationRowProps {
  notification: Notification;
  onSelect: (notification: Notification) => void;
}

export function NotificationRow({
  notification,
  onSelect,
}: NotificationRowProps) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const { tone } = getNotificationEventMeta(notification.eventName);
  const isUnread = !notification.readAt;

  const handleClick = () => {
    onSelect(notification);
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-transparent transition-colors hover:border-border',
        isUnread ? toneUnreadBackgroundClass[tone] : 'hover:bg-muted/20',
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        className="w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <NotificationRowDesktop
          notification={notification}
          locale={locale}
          isUnread={isUnread}
        />
        <NotificationRowMobile
          notification={notification}
          locale={locale}
          isUnread={isUnread}
        />
      </button>
    </div>
  );
}
