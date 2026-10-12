import { useTranslation } from 'react-i18next';
import type { DayGroup } from '@/lib/feed-time';
import type { Notification } from '../types';
import { NotificationRow } from './notification-row';

type NotificationDayGroupProps = {
  group: DayGroup<Notification>;
  onSelect: (notification: Notification) => void;
};

/** One day of the feed: its heading, how many events it holds, and a row for each. */
export function NotificationDayGroup({
  group,
  onSelect,
}: NotificationDayGroupProps) {
  const { t } = useTranslation();

  function renderRow(notification: Notification) {
    return (
      <NotificationRow
        key={notification.id}
        notification={notification}
        onSelect={onSelect}
      />
    );
  }

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-1 py-1">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {group.heading}
        </h3>
        {/* The theme's muted foreground, not a fainter copy of it: the count is text, and
            a fraction of an already muted colour is below the contrast text needs. */}
        <span className="text-xs text-muted-foreground">
          {t('Pages.Notifications.feed.eventsCount', {
            count: group.entries.length,
          })}
        </span>
      </div>
      <div className="flex flex-col gap-1">{group.entries.map(renderRow)}</div>
    </section>
  );
}
