import { createFileRoute } from '@tanstack/react-router';
import { MetadataFieldsPageContent } from '@/features/settings';
import i18n from '@/lib/i18n/config';
import type { MetadataResourceType } from '@/features/settings';

type MetadataSearch = {
  resourceType: MetadataResourceType;
};

const parseResourceType = (value: unknown): MetadataResourceType =>
  value === 'INSTANCE' ? 'INSTANCE' : 'DEPLOYMENT_ZONE';

export const Route = createFileRoute('/settings/metadata')({
  component: MetadataFieldsRoute,
  validateSearch: (search): MetadataSearch => ({
    resourceType: parseResourceType(search.resourceType),
  }),
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Settings.Metadata.title', 'Metadata fields'),
  }),
});

function MetadataFieldsRoute() {
  const navigate = Route.useNavigate();
  const { resourceType } = Route.useSearch();

  const handleResourceTypeChange = (nextResourceType: MetadataResourceType) => {
    navigate({
      replace: true,
      search: { resourceType: nextResourceType },
    });
  };

  return (
    <MetadataFieldsPageContent
      resourceType={resourceType}
      onResourceTypeChange={handleResourceTypeChange}
    />
  );
}
