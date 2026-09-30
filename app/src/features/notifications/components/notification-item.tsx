import { useTranslation } from 'react-i18next';
import { formatRelativeTimeToNow } from '@/domains/audit-trail';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import type { Notification } from '../types';
import {
  getNotificationEventMeta,
  toneCircleClass,
  toneIconClass,
  toneUnreadBackgroundClass,
} from './notification-event-meta';

interface NotificationItemProps {
  notification: Notification;
  onSelect: (notification: Notification) => void;
}

export function NotificationItem({
  notification,
  onSelect,
}: NotificationItemProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const { Icon, tone } = getNotificationEventMeta(notification.eventName);
  const isUnread = !notification.readAt;

  const handleClick = () => {
    onSelect(notification);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex w-full cursor-pointer items-start gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border',
        isUnread ? toneUnreadBackgroundClass[tone] : 'bg-muted/40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          toneCircleClass[tone],
        )}
      >
        <Icon className={cn('size-4', toneIconClass[tone])} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm leading-tight',
            isUnread ? 'font-medium' : 'text-muted-foreground',
          )}
        >
          {notification.title}
        </p>
        {notification.body ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {notification.body}
          </p>
        ) : null}
        <p
          className="mt-0.5 text-xs text-muted-foreground"
          title={formatDateTime(notification.createdAt)}
        >
          {formatRelativeTimeToNow(notification.createdAt, locale)}
        </p>
      </div>
      {isUnread && (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
          role="status"
          aria-label={t('Pages.Notifications.item.unread', 'Unread')}
        />
      )}
    </button>
  );
}
