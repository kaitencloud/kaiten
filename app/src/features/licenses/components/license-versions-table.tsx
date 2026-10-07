import { useRouter } from '@tanstack/react-router';
import { DataTable } from '@/functionals/table';
import type { LicenseWithInstances } from '../types';
import { useLicenseVersionsColumns } from './license-versions-table-columns';

type LicenseVersionsTableProps = {
  licenses: LicenseWithInstances[];
};

export const LicenseVersionsTable = ({
  licenses,
}: LicenseVersionsTableProps) => {
  const router = useRouter();
  const columns = useLicenseVersionsColumns();

  const getLicensePath = (license: LicenseWithInstances) =>
    license.slug
      ? router.buildLocation({
          to: '/licenses/$licenseSlug',
          params: { licenseSlug: license.slug },
        }).pathname
      : undefined;

  return (
    <DataTable
      columns={columns}
      data={licenses}
      variant="simple"
      pagination={false}
      getPath={getLicensePath}
      // Rows keep their component state -- an open confirmation, a pending
      // action -- with their version when a refetch reorders them.
      getRowId={(license) => license.id}
      linkColumnId="versionName"
    />
  );
};
