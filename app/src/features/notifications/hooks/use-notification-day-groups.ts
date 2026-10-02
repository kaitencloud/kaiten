import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type DayGroup,
  formatDayHeading,
  groupItemsByDay,
} from '@/lib/feed-time';
import type { Notification } from '../types';

/**
 * Buckets an already-sorted (newest-first) notification list into the same
 * "Today / Yesterday / Thu, Jun 12" day groups as the audit-trail feed.
 */
export function useNotificationDayGroups(
  notifications: Notification[],
): DayGroup<Notification>[] {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';

  return useMemo(() => {
    const labels = {
      today: t('Pages.Notifications.feed.today', 'Today'),
      yesterday: t('Pages.Notifications.feed.yesterday', 'Yesterday'),
    };
    return groupItemsByDay(
      notifications,
      (notification) => notification.createdAt,
      (timestamp) => formatDayHeading(timestamp, locale, labels),
    );
  }, [locale, notifications, t]);
}
