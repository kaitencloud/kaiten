import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import {
  LicenseFamilySettingsDialog,
  LicensesPageContent,
  licenseFamiliesQueryOptions,
  licensesWithInstancesQueryOptions,
} from '@/features/licenses';

// `?familySettings=<slug>` opens the dialog the settings of that family are edited
// in, over the list, as `?mode=configure` opens the edit dialog of a version. Any
// other search param is kept, as it is on the routes of a version and an instance.
const licensesSearchSchema = z
  .object({
    familySettings: z.string().optional(),
  })
  .loose();

export const Route = createFileRoute('/catalog/licenses/')({
  component: LicensesIndex,
  validateSearch: (search) => licensesSearchSchema.parse(search),
  loader: ({ context }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(licensesWithInstancesQueryOptions),
      context.queryClient.ensureQueryData(licenseFamiliesQueryOptions),
    ]);
  },
});

function LicensesIndex() {
  const navigate = useNavigate();
  const { familySettings } = Route.useSearch();

  const closeFamilySettings = () => {
    void navigate({
      search: (previous) => ({ ...previous, familySettings: undefined }),
      to: '.',
    });
  };

  return (
    <>
      <LicensesPageContent />
      {familySettings ? (
        <LicenseFamilySettingsDialog
          familySlug={familySettings}
          onClose={closeFamilySettings}
        />
      ) : null}
    </>
  );
}
