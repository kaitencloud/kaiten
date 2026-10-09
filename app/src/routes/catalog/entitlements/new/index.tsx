import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { Entitlement } from '@/api-client';
import { EntitlementCreatePage } from '@/features/entitlements';

export const Route = createFileRoute('/catalog/entitlements/new/')({
  component: NewEntitlementRoute,
  pendingComponent: () => null,
});

function NewEntitlementRoute() {
  const navigate = useNavigate();
  const backToList = () => {
    navigate({ to: '/catalog/entitlements' });
  };
  // Land on what was just created: the next step is almost always to attach
  // it to a license or to check it, not to find it again in the list.
  const openCreatedEntitlement = (entitlement: Entitlement) => {
    if (!entitlement.slug) {
      backToList();
      return;
    }

    navigate({
      to: '/catalog/entitlements/$entitlementSlug',
      params: { entitlementSlug: entitlement.slug },
    });
  };

  return (
    <EntitlementCreatePage
      onCancel={backToList}
      onSuccess={openCreatedEntitlement}
    />
  );
}
