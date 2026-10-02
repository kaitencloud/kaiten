import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { EntitlementWritable, Entitlement } from '@/api-client';
import { useAppForm } from '@/hooks/form';
import { getApiErrorMessage } from '@/lib/errors';
import { useEntitlementFormMutations } from '../../hooks';
import { conditionUnitFields } from '../../utils/entitlement-writable';
import {
  entitlementFormSchema,
  getEntitlementFormDefaults,
} from './entitlement-form.shared';
import { resolveResetFields } from './entitlement-reset-period.shared';

export const useEntitlementMutationForm = (
  entitlement?: Entitlement,
  onSuccess?: (entitlement: Entitlement) => void,
) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createMutation, updateMutation } = useEntitlementFormMutations();

  return useAppForm({
    defaultValues: getEntitlementFormDefaults(entitlement),
    validators: {
      onChange: entitlementFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const body: EntitlementWritable = {
          ...value,
          groupSlugs: value.groupSlugs?.filter(Boolean) ?? [],
          // Overwrites the sentinel the form carries, and re-echoes a period
          // the API already stored rather than letting this full-replace PUT
          // read as an attempted change.
          ...resolveResetFields(value, entitlement),
        };
        if (body.type !== 'NUMBER') {
          body.aggregationMethod = undefined;
        }
        conditionUnitFields(body);

        // An update may answer with no body; the entitlement being edited
        // then stands in, since only its slug is needed downstream.
        const savedEntitlement = entitlement
          ? ((await updateMutation.mutateAsync({
              path: { entitlementSlug: entitlement.slug! },
              body,
            })) ?? entitlement)
          : await createMutation.mutateAsync({
              body,
            });

        toast.success(
          t(
            entitlement
              ? 'Pages.Entitlements.Mutation.Form.updateSuccess'
              : 'Pages.Entitlements.Mutation.Form.createSuccess',
          ),
        );

        if (onSuccess) {
          onSuccess(savedEntitlement);
          return;
        }

        navigate({ to: '/entitlements' });
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });
};
