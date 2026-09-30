import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  serviceAccountQueryOptions,
  TokenCreatePage,
} from '@/features/service-accounts';

export const Route = createFileRoute(
  '/integrations/service-accounts/$serviceAccountSlug/tokens/new/',
)({
  component: NewServiceAccountTokenRoute,
  pendingComponent: () => null,
  beforeLoad: async ({ context, params: { serviceAccountSlug } }) => {
    const serviceAccount = await context.queryClient.ensureQueryData(
      serviceAccountQueryOptions(serviceAccountSlug),
    );

    return { serviceAccount, getTitle: () => serviceAccount.name };
  },
});

function NewServiceAccountTokenRoute() {
  const navigate = useNavigate();
  const { serviceAccountSlug } = Route.useParams();
  const { serviceAccount } = Route.useRouteContext();
  const backToList = () => {
    navigate({ to: '/integrations/service-accounts' });
  };

  return (
    <TokenCreatePage
      serviceAccountSlug={serviceAccountSlug}
      serviceAccountName={serviceAccount.name}
      onCancel={backToList}
      onDone={backToList}
    />
  );
}
