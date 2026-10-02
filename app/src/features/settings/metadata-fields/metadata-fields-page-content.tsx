import { Settings2, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GradientButton } from '@/components/gradient-button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page } from '@/functionals/page';
import {
  ArchiveDialog,
  DryRunDialog,
} from './components/metadata-field-confirm-dialogs';
import { MetadataFieldFormDialog } from './components/metadata-field-form-dialog';
import {
  ErrorState,
  RestrictedState,
} from './components/metadata-field-states';
import { MetadataFieldsBody } from './components/metadata-fields-body';
import { ResourceTypeIcon } from './components/resource-type-icon';
import { resourceTypeLabel } from './metadata-field-helpers';
import type { MetadataResourceType } from './types';
import {
  type MetadataFieldsPageState,
  useMetadataFieldsPage,
} from './use-metadata-fields-page';

type MetadataFieldsPageContentProps = {
  onResourceTypeChange?: (resourceType: MetadataResourceType) => void;
  resourceType: MetadataResourceType;
};

function ResourceTabs({
  onResourceTypeChange,
  resourceType,
}: MetadataFieldsPageContentProps) {
  return (
    <Tabs
      value={resourceType}
      onValueChange={(value) =>
        onResourceTypeChange?.(value as MetadataResourceType)
      }
      className="mt-6"
    >
      <TabsList>
        <TabsTrigger value="DEPLOYMENT_ZONE" className="gap-1.5">
          <ResourceTypeIcon resourceType="DEPLOYMENT_ZONE" className="size-4" />
          {resourceTypeLabel('DEPLOYMENT_ZONE')}
        </TabsTrigger>
        <TabsTrigger value="INSTANCE" className="gap-1.5">
          <ResourceTypeIcon resourceType="INSTANCE" className="size-4" />
          {resourceTypeLabel('INSTANCE')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function RestrictedBanner() {
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-warning-subtle-foreground/30 bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-foreground">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <p>
        {t(
          'Pages.Settings.Metadata.Restricted.mutationBanner',
          'Restricted access was returned by the API. Mutating actions are disabled until the next reload or refetch.',
        )}
      </p>
    </div>
  );
}

function PageDialogs({
  page,
  resourceType,
}: {
  page: MetadataFieldsPageState;
  resourceType: MetadataResourceType;
}) {
  return (
    <>
      <MetadataFieldFormDialog
        fields={page.fields}
        initialField={page.dialogField}
        initialValues={page.dialogValues}
        isSubmitting={page.isDialogSubmitting}
        mode={page.dialogMode}
        onOpenChange={(open) => !open && page.setDialogState(null)}
        onSubmit={page.handleSubmit}
        open={page.isDialogOpen}
        resourceType={resourceType}
      />

      <ArchiveDialog
        isPending={page.isArchivePending}
        onConfirm={page.handleArchiveConfirm}
        onOpenChange={(open) => !open && page.setArchivePending(null)}
        pending={page.archivePending}
      />

      <DryRunDialog
        confirmation={page.dryRunConfirmation}
        isPending={page.isUpdatePending}
        onCancel={() => page.setDryRunConfirmation(null)}
        onConfirm={page.handleDryRunConfirm}
      />
    </>
  );
}

function PageBody({
  page,
  resourceType,
}: {
  page: MetadataFieldsPageState;
  resourceType: MetadataResourceType;
}) {
  if (page.isQueryForbidden) {
    return <RestrictedState />;
  }
  if (page.fieldsQuery.isError) {
    return <ErrorState onRetry={() => page.fieldsQuery.refetch()} />;
  }

  const disabled = page.actionsDisabled || page.isMutating;

  return (
    <MetadataFieldsBody
      activeFields={page.activeFields}
      archivedFields={page.archivedFields}
      disabled={disabled}
      fields={page.fields}
      hasVisibleFields={page.hasVisibleFields}
      isLoading={page.fieldsQuery.isLoading}
      onArchive={page.handleArchiveRequest}
      onCreate={() => page.setDialogState({ mode: 'create' })}
      onDragEnd={page.handleDragEnd}
      onDuplicate={(field) =>
        page.setDialogState({ mode: 'duplicate', source: field })
      }
      onEdit={(field) => page.setDialogState({ field, mode: 'edit' })}
      onUnarchive={page.handleUnarchive}
      onShowArchivedChange={page.setShowArchived}
      reorderDisabled={disabled || page.activeFields.length < 2}
      resourceType={resourceType}
      sensors={page.sensors}
      showArchived={page.showArchived}
    />
  );
}

export function MetadataFieldsPageContent({
  onResourceTypeChange,
  resourceType,
}: MetadataFieldsPageContentProps) {
  const { t } = useTranslation();
  const page = useMetadataFieldsPage(resourceType);

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <Settings2 className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>
              {t('Pages.Settings.Metadata.title', 'Metadata fields')}
            </Page.Title>
            <Page.Subtitle>
              {t(
                'Pages.Settings.Metadata.subtitle',
                'Manage typed metadata fields for Deployment Zones and Instances.',
              )}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
        <Page.Actions>
          <GradientButton
            label={t('Pages.Settings.Metadata.createButton', 'Create field')}
            onClick={() => page.setDialogState({ mode: 'create' })}
            disabled={page.actionsDisabled || page.isMutating}
          />
        </Page.Actions>
      </Page.Header>

      <ResourceTabs
        onResourceTypeChange={onResourceTypeChange}
        resourceType={resourceType}
      />

      {page.mutationsRestricted ? <RestrictedBanner /> : null}

      <PageBody page={page} resourceType={resourceType} />

      <PageDialogs page={page} resourceType={resourceType} />
    </Page>
  );
}
