import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStream } from '../hooks/use-notification-stream';
import { notificationsUnreadCountQueryOptions } from '../queries';
import { NotificationPanel } from './notification-panel';

export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const unreadCountQuery = useQuery(notificationsUnreadCountQueryOptions);
  useNotificationStream();

  const unreadCount = unreadCountQuery.data ?? 0;
  const ariaLabel =
    unreadCount > 0
      ? t('Pages.Notifications.bell.labelUnread', { count: unreadCount })
      : t('Pages.Notifications.bell.label', 'Notifications');

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={ariaLabel}
          >
            <Bell />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="flex w-[420px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 max-h-[var(--available-height)]"
      >
        <NotificationPanel onClose={handleClose} />
      </PopoverContent>
    </Popover>
  );
}
