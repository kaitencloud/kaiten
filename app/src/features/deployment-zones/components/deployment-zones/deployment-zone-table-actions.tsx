import { Button } from '@/components/ui/button';
import { Pencil, Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TableActions, TableDeleteDialog } from '@/functionals/table';
import { useDeleteDeploymentZoneMutation } from '../../hooks';
import type { DeploymentZone, Release } from '../../types';

type DeploymentZoneTableActionsProps = {
  deploymentZone: DeploymentZone;
  releases: Release[];
  onEdit: () => void;
  onDeploy: () => void;
};

export const DeploymentZoneTableActions = ({
  deploymentZone,
  releases,
  onEdit,
  onDeploy,
}: DeploymentZoneTableActionsProps) => {
  const { t } = useTranslation();
  const deleteMutation = useDeleteDeploymentZoneMutation(deploymentZone);

  const handleConfirm = async () => {
    await deleteMutation.mutateAsync({
      path: { deploymentZoneSlug: deploymentZone.slug! },
    });
  };

  return (
    <TableActions>
      <Button
        variant="ghost"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      >
        <Pencil className="mr-2 size-4" />
        {t('Features.Releases.Actions.edit')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          onDeploy();
        }}
        disabled={releases.length === 0}
      >
        <Rocket className="mr-2 size-4" />
        {t('Features.Releases.Actions.deploy')}
      </Button>
      <TableDeleteDialog name={deploymentZone.name} onConfirm={handleConfirm} />
    </TableActions>
  );
};
