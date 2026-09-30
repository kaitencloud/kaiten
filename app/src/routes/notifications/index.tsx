import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  NotificationsPageContent,
  notificationsFeedQueryOptions,
} from '@/features/notifications';
import i18n from '@/lib/i18n/config';

const notificationsSearchSchema = z.object({
  status: z.enum(['all', 'unread']).optional(),
});

export const Route = createFileRoute('/notifications/')({
  component: NotificationsRoute,
  validateSearch: (search) => notificationsSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ status: search.status ?? 'all' }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(
      notificationsFeedQueryOptions(deps.status),
    ),
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Notifications.title', 'Notifications'),
  }),
});

function NotificationsRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const status = search.status ?? 'all';

  const handleStatusChange = (nextStatus: 'all' | 'unread') => {
    void navigate({
      search: { status: nextStatus === 'all' ? undefined : nextStatus },
    });
  };

  return (
    <NotificationsPageContent
      status={status}
      onStatusChange={handleStatusChange}
    />
  );
}
