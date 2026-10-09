import { useRouter } from '@tanstack/react-router';
import type { Addon } from '@/api-client';
import { DataTable } from '@/functionals/table';
import { useAddonVersionsColumns } from './addon-versions-table-columns';

type AddonVersionsTableProps = {
  addons: Addon[];
};

/** The versions of a family, newest first as the API lists them; a row opens its version. */
export function AddonVersionsTable({ addons }: AddonVersionsTableProps) {
  const router = useRouter();
  const columns = useAddonVersionsColumns();

  const getAddonPath = (addon: Addon) =>
    router.buildLocation({
      params: { addonSlug: addon.slug },
      to: '/addons/$addonSlug',
    }).pathname;

  return (
    <DataTable
      columns={columns}
      data={addons}
      // Rows keep their component state -- an open confirmation, a pending action --
      // with their version when a refetch reorders them.
      getRowId={(addon) => addon.id}
      getPath={getAddonPath}
      linkColumnId="versionName"
      pagination={false}
      variant="simple"
    />
  );
}
