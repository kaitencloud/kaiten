import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { z } from 'zod';
import type { EntitlementGroup } from '@/api-client';
import { zEntitlementGroupWritable } from '@/api-client/zod.gen';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { useEntitlementGroupFormMutations } from '../hooks';

const entitlementGroupFormSchema = zEntitlementGroupWritable.pick({
  name: true,
  description: true,
});

type EntitlementGroupFormValues = z.infer<typeof entitlementGroupFormSchema>;

const initialValues: EntitlementGroupFormValues = {
  name: '',
  description: '',
};

type EntitlementGroupFormProps = {
  group?: EntitlementGroup;
  initialDescription?: string;
  initialName?: string;
  onSuccess?: (group: EntitlementGroup) => void;
  onCancel?: () => void;
};

const getDefaults = (
  group?: EntitlementGroup,
  initialName?: string,
  initialDescription?: string,
): EntitlementGroupFormValues => {
  if (!group) {
    return {
      ...initialValues,
      description: initialDescription ?? initialValues.description,
      name: initialName ?? initialValues.name,
    };
  }
  return {
    name: group.name,
    description: group.description ?? '',
  };
};

const useGroupMutationForm = (
  group?: EntitlementGroup,
  initialName?: string,
  initialDescription?: string,
  onSuccess?: (group: EntitlementGroup) => void,
) => {
  const { createMutation, updateMutation } = useEntitlementGroupFormMutations();

  return useAppForm({
    defaultValues: getDefaults(group, initialName, initialDescription),
    validators: {
      onChange: entitlementGroupFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        let savedGroup: EntitlementGroup;
        if (group) {
          await updateMutation.mutateAsync({
            path: { entitlementGroupSlug: group.slug! },
            body: value,
          });
          savedGroup = {
            ...group,
            ...value,
          };
        } else {
          savedGroup = await createMutation.mutateAsync({
            body: value,
          });
        }

        if (onSuccess) {
          onSuccess(savedGroup);
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });
};

export const EntitlementGroupForm = ({
  group,
  initialDescription,
  initialName,
  onSuccess,
  onCancel,
}: EntitlementGroupFormProps) => {
  const { t } = useTranslation();
  const form = useGroupMutationForm(
    group,
    initialName,
    initialDescription,
    onSuccess,
  );

  function handleCancel() {
    onCancel?.();
  }

  return (
    <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <div className="space-y-4">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label={t('Pages.EntitlementGroups.Mutation.Form.Labels.name')}
                required
                placeholder={t(
                  'Pages.EntitlementGroups.Mutation.Form.Placeholders.name',
                )}
                description={t(
                  'Pages.EntitlementGroups.Mutation.Form.Descriptions.name',
                )}
              />
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.TextAreaField
                label={t(
                  'Pages.EntitlementGroups.Mutation.Form.Labels.description',
                )}
                placeholder={t(
                  'Pages.EntitlementGroups.Mutation.Form.Placeholders.description',
                )}
                description={t(
                  'Pages.EntitlementGroups.Mutation.Form.Descriptions.description',
                )}
              />
            )}
          </form.AppField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              {t('Common.cancel')}
            </Button>
            <form.SubmitButton
              label={
                group
                  ? t('Pages.EntitlementGroups.Mutation.Form.updateButton')
                  : t('Pages.EntitlementGroups.Mutation.Form.createButton')
              }
            />
          </div>
        </div>
      </form.AppForm>
    </form>
  );
};
