import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { EntitlementWritable, Entitlement } from '@/api-client';
import { useAppForm } from '@/hooks/form';
import { getApiErrorMessage } from '@/lib/errors';
import { useEntitlementFormMutations } from '../../hooks';
import { conditionUnitFields } from '../../utils/entitlement-writable';
import {
  type EntitlementFormValues,
  entitlementFormSchema,
  getEntitlementFormDefaults,
} from './entitlement-form.shared';
import { resolveResetFields } from './entitlement-reset-period.shared';
import { toOptionalSlug } from './entitlement-slug.shared';

/**
 * The body a form sends for its values. `entitlement` is the one the form edits:
 * the same one builds the body of the values the form opened with, so that the two
 * differ by what the person changed alone.
 */
const entitlementFormValuesToBody = (
  value: EntitlementFormValues,
  entitlement?: Entitlement,
): EntitlementWritable => {
  const body: EntitlementWritable = {
    ...value,
    groupSlugs: value.groupSlugs?.filter(Boolean) ?? [],
    // A blank slug is left out so the API generates one. An update never
    // sends it: the slug is fixed, and the API answers 422 to a new one.
    slug: entitlement ? undefined : toOptionalSlug(value.slug),
    // Overwrites the sentinel the form carries, and re-echoes a period
    // the API already stored rather than letting this full-replace PUT
    // read as an attempted change.
    ...resolveResetFields(value, entitlement),
  };
  if (body.type !== 'NUMBER') {
    body.aggregationMethod = undefined;
  }
  conditionUnitFields(body);

  return body;
};

export const useEntitlementMutationForm = (
  entitlement?: Entitlement,
  onSuccess?: (entitlement: Entitlement) => void,
) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createMutation, updateMutation } = useEntitlementFormMutations();
  // The entitlement and the form as they were when the form opened: an update
  // sends the fields that differ from them, and takes the others from the
  // entitlement as the API holds it.
  const [openedEntitlement] = useState(entitlement);
  const [openedValues] = useState(() =>
    getEntitlementFormDefaults(entitlement),
  );

  return useAppForm({
    defaultValues: openedValues,
    validators: {
      onChange: entitlementFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const body = entitlementFormValuesToBody(value, openedEntitlement);

        // An update may answer with no body; the entitlement being edited
        // then stands in, since only its slug is needed downstream.
        const savedEntitlement = entitlement
          ? ((await updateMutation.mutateAsync({
              edited: body,
              entitlementSlug: entitlement.slug!,
              opened: entitlementFormValuesToBody(
                openedValues,
                openedEntitlement,
              ),
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

        navigate({ to: '/catalog/entitlements' });
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });
};
