import {
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { dryRunMetadataField } from '@/api-client/sdk.gen';
import { partitionFields } from '@/functionals/metadata-fields';
import {
  dialogInitialField,
  dialogInitialValues,
  isForbiddenError,
} from './metadata-field-helpers';
import type {
  MetadataFieldDialogState,
  MetadataFieldSubmitPayload,
  PendingArchive,
  PendingDryRunConfirmation,
} from './metadata-field-helpers';
import {
  getNextDisplayOrder,
  getReorderedActiveFieldIds,
  hasStructuralJsonSchemaChanged,
  sortMetadataFields,
} from './metadata-fields.diff';
import { metadataFieldsSettingsQueryOptions } from './metadata-fields.queries';
import type { MetadataResourceType, MetadataSettingsField } from './types';
import { useMetadataFieldMutations } from './use-metadata-field-mutations';

export function useMetadataFieldsPage(resourceType: MetadataResourceType) {
  const [dialogState, setDialogState] =
    useState<MetadataFieldDialogState | null>(null);
  const [archivePending, setArchivePending] = useState<PendingArchive | null>(
    null,
  );
  const [dryRunConfirmation, setDryRunConfirmation] =
    useState<PendingDryRunConfirmation | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [mutationsRestricted, setMutationsRestricted] = useState(false);
  const [prevResourceType, setPrevResourceType] = useState(resourceType);

  const {
    data: fieldsData,
    error: fieldsError,
    isError: fieldsIsError,
    isLoading: fieldsIsLoading,
    isSuccess: fieldsIsSuccess,
    dataUpdatedAt: fieldsDataUpdatedAt,
    refetch: fieldsRefetch,
  } = useQuery(metadataFieldsSettingsQueryOptions(resourceType));
  const fields = useMemo(() => fieldsData ?? [], [fieldsData]);
  const { active, archived } = useMemo(
    () => partitionFields(sortMetadataFields(fields)),
    [fields],
  );
  const activeFields = active as MetadataSettingsField[];
  const archivedFields = archived as MetadataSettingsField[];
  const isQueryForbidden = isForbiddenError(fieldsError);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const {
    createMutation,
    handleMutationError,
    isMutating,
    reorderMutation,
    submitUpdate,
    updateMutation,
    archiveMutation,
    unarchiveMutation,
  } = useMetadataFieldMutations({
    onArchived: () => setArchivePending(null),
    onCreated: () => setDialogState(null),
    onRestricted: () => setMutationsRestricted(true),
    onUnarchived: () => undefined,
    onUpdated: () => {
      setDialogState(null);
      setDryRunConfirmation(null);
    },
    resourceType,
  });

  const actionsDisabled =
    mutationsRestricted || fieldsIsLoading || isQueryForbidden;
  const hasVisibleFields =
    activeFields.length > 0 || (showArchived && archivedFields.length > 0);

  if (resourceType !== prevResourceType) {
    setPrevResourceType(resourceType);
    setDialogState(null);
    setArchivePending(null);
    setDryRunConfirmation(null);
    setShowArchived(false);
    setMutationsRestricted(false);
  }

  const [prevFieldsDataUpdatedAt, setPrevFieldsDataUpdatedAt] =
    useState(fieldsDataUpdatedAt);
  // Reset the restricted banner whenever a new successful fetch lands.
  if (fieldsDataUpdatedAt !== prevFieldsDataUpdatedAt) {
    setPrevFieldsDataUpdatedAt(fieldsDataUpdatedAt);
    if (fieldsIsSuccess) {
      setMutationsRestricted(false);
    }
  }

  async function handleSubmit(payload: MetadataFieldSubmitPayload) {
    const { jsonSchema, values } = payload;

    if (dialogState?.mode === 'edit') {
      const { field } = dialogState;

      // Only run the dry-run when the *structural* schema changed — a
      // pure-description edit can't invalidate values, so previewing the impact
      // is pointless then. The impact is now computed
      // server-side: we send only the candidate schema and get back the
      // aggregated count + sample instead of pulling every resource's metadata.
      if (hasStructuralJsonSchemaChanged(field, jsonSchema)) {
        let impact;
        try {
          const { data } = await dryRunMetadataField({
            body: { jsonSchema },
            path: { id: field.id },
            throwOnError: true,
          });
          // The generated `samples` is nullable (Go slice); normalize to an
          // array so it matches the dialog's MetadataDryRunImpact shape.
          impact = { count: data.count, samples: data.samples ?? [] };
        } catch (error) {
          handleMutationError(error);
          return;
        }

        if (impact.count > 0) {
          setDryRunConfirmation({ field, impact, jsonSchema, values });
          return;
        }
      }

      try {
        await submitUpdate(field, values, jsonSchema);
      } catch {
        // React Query onError already handles user-facing feedback.
      }
      return;
    }

    // create + duplicate share the same path — both POST a brand-new field
    // with a fresh `displayOrder` at the end of the list.
    try {
      await createMutation.mutateAsync({
        body: {
          displayOrder: getNextDisplayOrder(activeFields),
          jsonSchema,
          key: values.key.trim(),
          label: values.label.trim(),
          resourceType,
        },
      });
    } catch {
      // React Query onError already handles user-facing feedback.
    }
  }

  async function handleDryRunConfirm() {
    if (!dryRunConfirmation) return;
    try {
      await submitUpdate(
        dryRunConfirmation.field,
        dryRunConfirmation.values,
        dryRunConfirmation.jsonSchema,
      );
    } catch {
      // React Query onError already handles user-facing feedback.
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active: activeEvent, over } = event;
    if (!over || actionsDisabled || isMutating) return;

    const ids = getReorderedActiveFieldIds(
      activeFields,
      String(activeEvent.id),
      String(over.id),
    );
    if (!ids) return;

    reorderMutation.mutate({ body: { ids } });
  }

  function handleArchiveRequest(field: MetadataSettingsField) {
    setArchivePending({
      field,
      isLastActive:
        activeFields.length === 1 && activeFields[0]?.id === field.id,
    });
  }

  function handleArchiveConfirm() {
    if (!archivePending) return;
    archiveMutation.mutate({ path: { id: archivePending.field.id } });
  }

  function handleUnarchive(field: MetadataSettingsField) {
    if (actionsDisabled || isMutating) return;
    unarchiveMutation.mutate({ path: { id: field.id } });
  }

  const dialogValues = useMemo(
    () => dialogInitialValues(dialogState),
    [dialogState],
  );

  return {
    actionsDisabled,
    activeFields,
    archivedFields,
    archivePending,
    dialogField: dialogInitialField(dialogState),
    dialogMode: dialogState?.mode ?? 'create',
    dialogValues,
    dryRunConfirmation,
    fields,
    fieldsQuery: {
      isError: fieldsIsError,
      isLoading: fieldsIsLoading,
      refetch: fieldsRefetch,
    },
    handleArchiveConfirm,
    handleArchiveRequest,
    handleDragEnd,
    handleDryRunConfirm,
    handleSubmit,
    handleUnarchive,
    hasVisibleFields,
    isArchivePending: archiveMutation.isPending,
    isUnarchivePending: unarchiveMutation.isPending,
    isDialogOpen: Boolean(dialogState),
    isDialogSubmitting: createMutation.isPending || updateMutation.isPending,
    isMutating,
    isQueryForbidden,
    isUpdatePending: updateMutation.isPending,
    mutationsRestricted,
    sensors,
    setArchivePending,
    setDialogState,
    setDryRunConfirmation,
    setShowArchived,
    showArchived,
  } as const;
}

export type MetadataFieldsPageState = ReturnType<typeof useMetadataFieldsPage>;
