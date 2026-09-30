import { useCreateServiceAccountToken } from '../../hooks/use-service-accounts-mutations';
import { TokenCreatedView } from './token-created-view';
import { TokenCreateForm } from './token-create-form';

type TokenCreatePageProps = {
  serviceAccountSlug: string;
  serviceAccountName: string;
  onCancel: () => void;
  onDone: () => void;
};

/**
 * The form, then the token it created. Both live on one route: the value is
 * shown once and must not survive a reload or reach the URL, so the switch is
 * the mutation's own result rather than a navigation.
 */
export function TokenCreatePage({
  serviceAccountSlug,
  serviceAccountName,
  onCancel,
  onDone,
}: TokenCreatePageProps) {
  const { createToken, createdToken } =
    useCreateServiceAccountToken(serviceAccountSlug);

  if (createdToken) {
    return (
      <TokenCreatedView
        token={createdToken}
        serviceAccountName={serviceAccountName}
        onDone={onDone}
      />
    );
  }

  return (
    <TokenCreateForm
      serviceAccountName={serviceAccountName}
      onCancel={onCancel}
      onSubmit={createToken}
    />
  );
}
