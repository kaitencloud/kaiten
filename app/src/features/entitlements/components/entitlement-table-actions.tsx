import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import {
  deleteEntitlementMutation,
  listEntitlementsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { TableActions, TableDeleteDialog } from '@/functionals/table';
import { optimisticDeleteCallbacks } from '@/lib/optimistic-mutations';
import { useEntitlementLicenseLinks } from '../hooks';

type EntitlementTableActionsProps = {
  entitlement: Entitlement;
};

export const EntitlementTableActions = ({
  entitlement,
}: EntitlementTableActionsProps) => {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  // A license that still grants the entitlement blocks the delete (the
  // database restricts it). The check runs when the dialog opens, and the
  // confirmation waits for its answer.
  const licenseLinks = useEntitlementLicenseLinks(
    entitlement.slug,
    isDeleteDialogOpen,
  );
  const isGrantedByLicense = licenseLinks.linkedLicenseCount > 0;

  const deleteMutation = useMutation({
    ...deleteEntitlementMutation(),
    ...optimisticDeleteCallbacks<Entitlement>(
      queryClient,
      listEntitlementsQueryKey(),
      entitlement.id,
      {
        success: t('Pages.Entitlements.Mutation.deleteSuccess'),
        error: t('Common.deleteError', 'Error deleting entitlement'),
      },
    ),
  });

  const handleConfirm = async () => {
    deleteMutation.mutate({
      path: { entitlementSlug: entitlement.slug! },
    });
  };

  const getDeleteDescription = () => {
    if (licenseLinks.isPending) {
      return t('Pages.Entitlements.Delete.checkingLicenses');
    }

    if (isGrantedByLicense) {
      return t('Pages.Entitlements.Delete.grantedByLicenses', {
        count: licenseLinks.linkedLicenseCount,
      });
    }

    return undefined;
  };

  return (
    <TableActions>
      <TableDeleteDialog
        name={entitlement.name}
        description={getDeleteDescription()}
        confirmDisabled={licenseLinks.isPending || isGrantedByLicense}
        onConfirm={handleConfirm}
        onOpenChange={setIsDeleteDialogOpen}
      />
    </TableActions>
  );
};
