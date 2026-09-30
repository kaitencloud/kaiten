import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  archiveMetadataFieldMutation,
  createMetadataFieldMutation,
  reorderMetadataFieldsMutation,
  unarchiveMetadataFieldMutation,
  updateMetadataFieldMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { getErrorMessage, isForbiddenError } from './metadata-field-helpers';
import { metadataFieldsSettingsQueryKey } from './metadata-fields.queries';
import { metadataFieldsActiveQueryKey } from '@/domains/metadata-fields';
import type {
  MetadataFieldFormValues,
  MetadataResourceType,
  MetadataSettingsField,
} from './types';

type UseMetadataFieldMutationsArgs = {
  onArchived: () => void;
  onCreated: () => void;
  onRestricted: () => void;
  onUnarchived: () => void;
  onUpdated: () => void;
  resourceType: MetadataResourceType;
};

// Owns the metadata-field mutations plus the shared error / invalidation
// plumbing. Split out of useMetadataFieldsPage to keep each hook focused.
export function useMetadataFieldMutations({
  onArchived,
  onCreated,
  onRestricted,
  onUnarchived,
  onUpdated,
  resourceType,
}: UseMetadataFieldMutationsArgs) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const invalidateFields = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: metadataFieldsSettingsQueryKey(resourceType),
      }),
      queryClient.invalidateQueries({
        queryKey: metadataFieldsActiveQueryKey(resourceType),
      }),
    ]);
  };

  const handleMutationError = (error: unknown) => {
    if (isForbiddenError(error)) {
      onRestricted();
      toast.error(
        t(
          'Pages.Settings.Metadata.Restricted.mutationToast',
          'Restricted access: metadata field changes are disabled until reload.',
        ),
      );
      return;
    }

    toast.error(
      getErrorMessage(
        error,
        t(
          'Pages.Settings.Metadata.Error.mutationFallback',
          'Metadata field update failed.',
        ),
      ),
    );
  };

  const createMutation = useMutation({
    ...createMetadataFieldMutation(),
    onError: handleMutationError,
    onSuccess: async () => {
      await invalidateFields();
      onCreated();
      toast.success(
        t('Pages.Settings.Metadata.Toast.created', 'Metadata field created.'),
      );
    },
  });

  const updateMutation = useMutation({
    ...updateMetadataFieldMutation(),
    onError: handleMutationError,
    onSuccess: async () => {
      await invalidateFields();
      onUpdated();
      toast.success(
        t('Pages.Settings.Metadata.Toast.updated', 'Metadata field updated.'),
      );
    },
  });

  const archiveMutation = useMutation({
    ...archiveMetadataFieldMutation(),
    onError: handleMutationError,
    onSuccess: async () => {
      await invalidateFields();
      onArchived();
      toast.success(
        t('Pages.Settings.Metadata.Toast.archived', 'Metadata field archived.'),
      );
    },
  });

  const unarchiveMutation = useMutation({
    ...unarchiveMetadataFieldMutation(),
    onError: handleMutationError,
    onSuccess: async () => {
      await invalidateFields();
      onUnarchived();
      toast.success(
        t(
          'Pages.Settings.Metadata.Toast.unarchived',
          'Metadata field unarchived.',
        ),
      );
    },
  });

  const reorderMutation = useMutation({
    ...reorderMetadataFieldsMutation(),
    onError: handleMutationError,
    onSuccess: async () => {
      await invalidateFields();
      toast.success(
        t(
          'Pages.Settings.Metadata.Toast.reordered',
          'Metadata fields reordered.',
        ),
      );
    },
  });

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    archiveMutation.isPending ||
    unarchiveMutation.isPending ||
    reorderMutation.isPending;

  // resourceType and key are immutable, so echoing back the value the
  // dialog opened with is always safe (see MetadataField's doc comment) --
  // the API requires them on this PATCH for that reason. displayOrder is
  // the opposite: B1 — it is *not* sent. The dedicated /reorder
  // endpoint owns ordering; sending it here would risk overwriting a fresh
  // value with a stale snapshot captured when the dialog opened.
  async function submitUpdate(
    field: MetadataSettingsField,
    values: MetadataFieldFormValues,
    jsonSchema: Record<string, unknown>,
  ) {
    await updateMutation.mutateAsync({
      body: {
        jsonSchema,
        key: field.key,
        label: values.label.trim(),
        resourceType: field.resourceType,
      },
      path: { id: field.id },
    });
  }

  return {
    archiveMutation,
    createMutation,
    handleMutationError,
    isMutating,
    reorderMutation,
    submitUpdate,
    unarchiveMutation,
    updateMutation,
  };
}
