import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import {
  createComponentMutation,
  listComponentsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { useAppForm } from '@/hooks/form';
import { saveComponentOnFresh } from '../queries/component-save';
import {
  componentFormSchema,
  initialComponentFormValues,
  normalizeComponentFormValues,
} from '../schemas/component-form.schema';
import type { ComponentFormProps } from '../types';

export const useComponentForm = ({
  componentSlug,
  initialValues,
  mode = 'create',
  onSuccess,
}: ComponentFormProps = {}) => {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  // What the form opened with, kept as it was: an update sends the fields that
  // differ from it, and takes the others from the component as the API holds it.
  const [defaultValues] = useState(() => ({
    ...initialComponentFormValues,
    ...initialValues,
  }));

  const createMutation = useMutation({
    ...createComponentMutation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: listComponentsQueryKey(),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: saveComponentOnFresh,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: listComponentsQueryKey(),
      });
    },
  });

  const form = useAppForm({
    defaultValues,
    validators: {
      onChange: componentFormSchema as any,
      onSubmit: componentFormSchema as any,
    },
    onSubmit: async ({ value }) => {
      try {
        if (mode === 'edit') {
          if (!componentSlug) {
            throw new Error('Missing component slug for update');
          }
          const data = await updateMutation.mutateAsync({
            componentSlug,
            edited: normalizeComponentFormValues(value),
            opened: normalizeComponentFormValues(defaultValues),
          });
          if (data) {
            toast.success(t('Pages.Releases.Components.Success.updated'));
            onSuccess?.(data);
          }
        } else {
          const data = await createMutation.mutateAsync({
            body: normalizeComponentFormValues(value),
          });
          if (data) {
            toast.success(t('Pages.Releases.Components.Success.created'));
            onSuccess?.(data);
          }
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });

  return {
    form,
    isLoading:
      mode === 'edit' ? updateMutation.isPending : createMutation.isPending,
  };
};
