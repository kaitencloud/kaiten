import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { NotificationStatusFilter } from '../types';

interface SegmentedOption {
  value: NotificationStatusFilter;
  label: string;
}

// Pill segmented control mirroring the audit-trail quick filters
// (domains/audit-trail/components/audit-trail-segmented-filters.tsx), but sized
// like the object filter's quick-access chip beside it: h-9 and text-sm, where
// the audit trail's is compact.
export function NotificationStatusSegments({
  status,
  unreadCount,
  onChange,
}: {
  status: NotificationStatusFilter;
  unreadCount: number;
  onChange: (value: NotificationStatusFilter) => void;
}) {
  const { t } = useTranslation();

  const options: SegmentedOption[] = [
    { value: 'all', label: t('Pages.Notifications.tabs.all', 'All') },
    {
      value: 'unread',
      label:
        unreadCount > 0
          ? t('Pages.Notifications.tabs.unreadWithCount', {
              count: unreadCount,
            })
          : t('Pages.Notifications.tabs.unread', 'Unread'),
    },
  ];

  const renderOption = (option: SegmentedOption) => (
    <button
      key={option.value}
      type="button"
      aria-pressed={option.value === status}
      onClick={() => onChange(option.value)}
      className={cn(
        'rounded-[5px] px-3 text-sm font-medium transition-colors',
        option.value === status
          ? 'bg-secondary text-secondary-foreground shadow-xs'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {option.label}
    </button>
  );

  return (
    <div
      role="group"
      aria-label={t('Pages.Notifications.tabs.label', 'Filter by status')}
      className="flex h-9 w-fit items-stretch gap-0.5 rounded-md border bg-background p-0.5"
    >
      {options.map(renderOption)}
    </div>
  );
}
