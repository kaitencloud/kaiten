import { createFileRoute } from '@tanstack/react-router';
import {
  NotificationPreferencesContent,
  notificationPreferencesQueryOptions,
} from '@/features/notifications';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/settings/notifications')({
  component: NotificationPreferencesContent,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(notificationPreferencesQueryOptions),
  beforeLoad: () => ({
    getTitle: () =>
      i18n.t('Pages.Settings.Notifications.title', 'Notifications'),
  }),
});
