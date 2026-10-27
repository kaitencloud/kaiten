import { type QueryClient, useMutation } from '@tanstack/react-query';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import { createFeatureFlagMutation } from '@/api-client/@tanstack/react-query.gen';
import { useAppForm } from '@/hooks/form';
import {
  mergeFeatureFlagIntoCache,
  revalidateFeatureFlagsListQuery,
  saveFeatureFlagOnFresh,
} from '../queries';
import type {
  FeatureFlagFormProps,
  FeatureFlagFormValues,
  FeatureFlagValueType,
} from '../types';
import { getFeatureFlagFormInitialValues } from '../utils/feature-flag-form-values';
import { featureFlagFormOpts } from '../utils/shared-form';

function removeFallbackMetadata(metadata: Record<string, unknown>) {
  const { fallback_value: _fallbackValue, ...rest } = metadata;

  return rest;
}

function hasTypeChangeData(
  values: Pick<FeatureFlagFormValues, 'targetings' | 'variants'>,
) {
  return Boolean(values.variants?.length) || Boolean(values.targetings?.length);
}

function navigateToFeatureFlagsList(router: {
  navigate: (options: any) => void;
}) {
  router.navigate({ to: '/feature-flags' });
}

function navigateToFeatureFlagDetail(
  router: { navigate: (options: any) => void },
  featureFlagSlug: string,
) {
  router.navigate({
    to: '/feature-flags/$featureFlagSlug',
    params: { featureFlagSlug },
    search: {},
  });
}

function useCreateFeatureFlagFormMutation(queryClient: {
  invalidateQueries: QueryClient['invalidateQueries'];
}) {
  return useMutation({
    ...createFeatureFlagMutation(),
    onSuccess: () => {
      revalidateFeatureFlagsListQuery(queryClient as QueryClient);
    },
  });
}

function useUpdateFeatureFlagFormMutation(
  currentFeatureFlag: FeatureFlagFormProps['featureFlag'],
  queryClient: QueryClient,
) {
  return useMutation({
    mutationFn: saveFeatureFlagOnFresh,
    // What the update sent, merged with the flag as the API held it: the caches
    // are given that, and not the form.
    onSuccess: (sent, variables) => {
      if (currentFeatureFlag) {
        mergeFeatureFlagIntoCache(
          queryClient,
          {
            ...currentFeatureFlag,
            ...sent,
            slug: sent.slug || currentFeatureFlag.slug,
          },
          variables.featureFlagSlug,
        );
      }

      revalidateFeatureFlagsListQuery(queryClient);
    },
  });
}

export const useFeatureFlagForm = ({ featureFlag }: FeatureFlagFormProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { queryClient } = useRouteContext({ from: '__root__' });
  const initialType: FeatureFlagValueType =
    featureFlag?.type || featureFlagFormOpts.defaultValues.type;

  // What the form opened with, kept as it was: an update sends the fields that
  // differ from it, and takes the others from the flag as the API holds it.
  const [openedValues] = useState(() =>
    getFeatureFlagFormInitialValues(featureFlag),
  );
  const [pendingTypeChange, setPendingTypeChange] =
    useState<FeatureFlagValueType | null>(null);
  const [previousType, setPreviousType] =
    useState<FeatureFlagValueType>(initialType);
  const [typeChangeDialogOpen, setTypeChangeDialogOpen] = useState(false);
  const createMutation = useCreateFeatureFlagFormMutation(queryClient);
  const updateMutation = useUpdateFeatureFlagFormMutation(
    featureFlag,
    queryClient,
  );

  const form = useAppForm({
    ...featureFlagFormOpts,
    defaultValues: openedValues,
    listeners: {
      onChange: ({ formApi }) => {
        const currentType = formApi.state.values.type;

        if (currentType === previousType) {
          return;
        }

        if (hasTypeChangeData(formApi.state.values)) {
          if (!typeChangeDialogOpen || pendingTypeChange !== currentType) {
            setPendingTypeChange(currentType);
            setTypeChangeDialogOpen(true);
          }

          return;
        }

        setPreviousType(currentType);
      },
    },
    onSubmit: async ({ value }) => {
      try {
        if (featureFlag?.slug) {
          const nextFeatureFlagSlug = value.slug || featureFlag.slug;

          await updateMutation.mutateAsync({
            edited: value,
            featureFlagSlug: featureFlag.slug,
            opened: openedValues,
          });
          navigateToFeatureFlagDetail(router, nextFeatureFlagSlug);
          toast.success(
            t('Pages.FeatureFlags.Mutation.Form.Dialog.updateSuccess'),
          );
          return;
        }

        await createMutation.mutateAsync({
          body: value as any,
        });
        navigateToFeatureFlagsList(router);
        toast.success(
          t('Pages.FeatureFlags.Mutation.Form.Dialog.createSuccess'),
        );
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    },
  });

  const handleTypeChangeConfirm = () => {
    if (!pendingTypeChange) {
      return;
    }

    const currentMetadata =
      (form.state.values.metadata as Record<string, unknown>) ?? {};

    form.setFieldValue('variants', featureFlagFormOpts.defaultValues.variants);
    form.setFieldValue(
      'default_variant',
      featureFlagFormOpts.defaultValues.default_variant,
    );
    form.setFieldValue(
      'targetings',
      featureFlagFormOpts.defaultValues.targetings,
    );
    form.setFieldValue('metadata', removeFallbackMetadata(currentMetadata));

    form.setFieldValue('type', pendingTypeChange);

    setPreviousType(pendingTypeChange);
    setPendingTypeChange(null);
    setTypeChangeDialogOpen(false);
  };

  const handleTypeChangeCancel = () => {
    form.setFieldValue('type', previousType);
    setPendingTypeChange(null);
    setTypeChangeDialogOpen(false);
  };

  const handleCancel = () => {
    if (featureFlag?.slug) {
      navigateToFeatureFlagDetail(router, featureFlag.slug);
      return;
    }

    navigateToFeatureFlagsList(router);
  };

  return {
    form,
    handleCancel,
    dialog: {
      open: typeChangeDialogOpen,
      onOpenChange: (open: boolean) => {
        if (open) {
          setTypeChangeDialogOpen(open);
          return;
        }

        handleTypeChangeCancel();
      },
      onConfirm: handleTypeChangeConfirm,
      onCancel: handleTypeChangeCancel,
    },
  };
};
