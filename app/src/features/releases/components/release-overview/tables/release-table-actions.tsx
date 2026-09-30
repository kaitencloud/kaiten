import { TableActions, TableDeleteDialog } from '@/functionals/table';
import { useDeleteReleaseMutation } from '../../../hooks';
import type { ReleaseManagementOverviewRelease } from '../../../types';

type ReleaseTableActionsProps = {
  release: ReleaseManagementOverviewRelease;
};

export const ReleaseTableActions = ({ release }: ReleaseTableActionsProps) => {
  const deleteMutation = useDeleteReleaseMutation(release);

  const handleConfirm = async () => {
    deleteMutation.mutate({
      path: { releaseSlug: release.slug },
    });
  };

  return (
    <TableActions>
      <TableDeleteDialog name={release.version} onConfirm={handleConfirm} />
    </TableActions>
  );
};
