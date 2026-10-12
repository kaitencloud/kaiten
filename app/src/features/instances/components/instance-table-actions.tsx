import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteInstanceMutation } from '@/api-client/@tanstack/react-query.gen';
import { useDeletionRefusal } from '@/domains/billing';
import { TableActions, TableDeleteDialog } from '@/functionals/table';
import { forgetDeletedInstanceQueries } from '../hooks/instance-query-invalidation';
import { InstanceDeploymentTableAction } from './instance-deployment';

type InstanceTableActionsProps = {
  instance: {
    deploymentZoneId?: string | null;
    name: string;
    slug: string;
  };
};

export const InstanceTableActions = ({
  instance,
}: InstanceTableActionsProps) => {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });
  // An instance that bills cannot be deleted: the dialog says what to settle first.
  const deletion = useDeletionRefusal(instance.slug);

  const deleteMutation = useMutation({
    ...deleteInstanceMutation(),
    onSuccess: async () => {
      toast.success(t('Pages.Customers.Instances.Mutation.deleteSuccess'));
      await forgetDeletedInstanceQueries(queryClient, instance.slug);
    },
    onError: (error) => {
      if (!deletion.showRefusal(error)) {
        toast.error(t('Common.deleteError', 'Error deleting instance'));
      }
    },
  });

  const handleConfirm = async () => {
    deleteMutation.mutate({
      path: { instanceSlug: instance.slug },
    });
  };

  return (
    <TableActions>
      <InstanceDeploymentTableAction
        deploymentZoneId={instance.deploymentZoneId}
        instanceName={instance.name}
        instanceSlug={instance.slug}
      />
      <TableDeleteDialog
        name={instance.name}
        onConfirm={handleConfirm}
        title={t('Pages.Customers.Instances.confirmDeleteTitle')}
        description={t('Pages.Customers.Instances.confirmDeleteDescription', {
          name: instance.name,
        })}
      />
      {deletion.dialog}
    </TableActions>
  );
};
