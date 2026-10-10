import {
  createFileRoute,
  notFound,
  redirect,
  useNavigate,
} from '@tanstack/react-router';
import {
  ensurePublishableKey,
  PublishableKeyFormDialog,
} from '@/features/publishable-keys';

export const Route = createFileRoute(
  '/integrations/publishable-keys/$keyId/edit',
)({
  component: EditPublishableKeyRoute,
  pendingComponent: () => null,
  // The key is read from the list the page holds, or from the API when a link opens
  // the dialog first. A key that is not there is a page that does not exist, and a key
  // that was revoked takes no edit: the list is where it goes.
  beforeLoad: async ({ context, params: { keyId } }) => {
    const publishableKey = await ensurePublishableKey(
      context.queryClient,
      keyId,
    );

    if (!publishableKey) {
      throw notFound();
    }
    if (publishableKey.revokedAt) {
      throw redirect({
        search: (previous) => previous,
        to: '/integrations/publishable-keys',
      });
    }

    return { getTitle: () => publishableKey.label, publishableKey };
  },
});

function EditPublishableKeyRoute() {
  const navigate = useNavigate();
  const { publishableKey } = Route.useRouteContext();

  return (
    <PublishableKeyFormDialog
      onClose={() => {
        void navigate({
          search: (previous) => previous,
          to: '/integrations/publishable-keys',
        });
      }}
      publishableKey={publishableKey}
    />
  );
}
