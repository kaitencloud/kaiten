import { useRouter } from '@tanstack/react-router';
import { useMarkNotificationsRead } from './use-mark-notifications-read';
import type { Notification } from '../types';

/**
 * Shared click behaviour for a notification row: mark it read, then follow
 * its `actionUrl` when present.
 */
export function useOpenNotification() {
  const router = useRouter();
  const markRead = useMarkNotificationsRead();

  return (notification: Notification) => {
    if (!notification.readAt) {
      markRead.mutate({ body: { ids: [notification.id] } });
    }
    if (notification.actionUrl) {
      // actionUrl is a server-rendered path, unknown to the typed route tree.
      router.history.push(notification.actionUrl);
    }
  };
}
