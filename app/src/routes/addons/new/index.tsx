import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import {
  AddonFormDialog,
  AddonsPageContent,
  addonFamiliesQueryOptions,
} from '@/features/addons';
import i18n from '@/lib/i18n/config';

// `?family=<slug>` makes the dialog the next version of that family; without it, it
// opens a new family.
const newAddonSearchSchema = z.object({ family: z.string().optional() });

export const Route = createFileRoute('/addons/new/')({
  component: NewAddonRoute,
  pendingComponent: () => null,
  validateSearch: (search) => newAddonSearchSchema.parse(search),
  beforeLoad: async ({ context, search }) => {
    const families = await context.queryClient.ensureQueryData(
      addonFamiliesQueryOptions,
    );
    const family = search.family
      ? families.items.find((candidate) => candidate.slug === search.family)
      : undefined;
    if (search.family && !family) {
      throw notFound();
    }

    return {
      family,
      getTitle: () =>
        family
          ? i18n.t('Pages.Addons.Form.titleNewVersion', {
              name: family.currentVersion?.name ?? family.slug,
            })
          : i18n.t('Pages.Addons.Form.titleNew'),
    };
  },
});

function NewAddonRoute() {
  const navigate = useNavigate();
  const { family } = Route.useRouteContext();

  return (
    <AddonsPageContent>
      <AddonFormDialog
        family={family}
        onClose={() => void navigate({ to: '/addons' })}
        // Lands on the version that was just made: a draft is for giving it its
        // entitlements, its prices and the licenses it fits.
        onSaved={(created) =>
          void navigate({
            params: { addonSlug: created.slug },
            to: '/addons/$addonSlug',
          })
        }
      />
    </AddonsPageContent>
  );
}
