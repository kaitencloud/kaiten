import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Addon } from '@/api-client';
import {
  createAddonMutation,
  updateAddonMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { handleBillingProblem, setProblemFieldError } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { addonHoldersQueryOptions, invalidateAddonQueries } from '../queries';
import {
  addonFormValuesToCreateBody,
  addonFormValuesToUpdateBody,
  addonToFormValues,
  initialAddonFormValues,
} from '../schemas';
import { addonFormOpts } from '../schemas/addon-form-options';
import { findBlockingHolder } from '../utils/addon-quantity.utils';

// The refusals of the API that are about one field of the form, by their code: the
// API names the field in prose, in `detail`, and does not locate it. Each is shown
// on its field, which is where the person is looking.
const FIELD_BY_CODE: Record<string, 'maxQuantity' | 'slug'> = {
  'CreateAddon.InvalidMaxQuantity': 'maxQuantity',
  'CreateAddon.InvalidSlug': 'slug',
  'CreateAddon.SlugConflict': 'slug',
  'UpdateAddon.InvalidMaxQuantity': 'maxQuantity',
};

type UseAddonFormOptions = {
  /** The version being edited; a new one when left out. */
  addon?: Addon;
  /** The version a new one starts from in name and pricing: the head of its family. */
  base?: Pick<Addon, 'name' | 'pricingType'>;
  /** The family a new version joins; a new family when left out. */
  familySlug?: string;
  /** Called once the API accepted the version, with what it answered. */
  onSaved: (saved: Addon) => void;
};

/**
 * The form of an add-on version, new or edited, and the request it sends. A billing
 * write is never optimistic: the page shows the version once the API has accepted it,
 * and a refusal leaves the form as it was typed, on its field when it is about one
 * and above the buttons otherwise.
 *
 * Lowering the most an instance can hold is the one rule the API does not check: it
 * takes any `maxQuantity` and leaves an instance holding more than the version allows.
 * So the console reads who holds the version first, and stops the change on the field
 * when an instance holds more. Raising the maximum, or removing it, needs no look.
 */
export function useAddonForm({
  addon,
  base,
  familySlug,
  onSaved,
}: UseAddonFormOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  const create = useMutation({
    ...createAddonMutation(),
    onSuccess: async () => {
      await invalidateAddonQueries(queryClient);
      toast.success(t('Pages.Addons.Form.Toasts.created'));
    },
  });
  const update = useMutation({
    ...updateAddonMutation(),
    onSuccess: async () => {
      await invalidateAddonQueries(queryClient, addon?.slug);
      toast.success(t('Pages.Addons.Form.Toasts.updated'));
    },
  });

  const form = useAppForm({
    ...addonFormOpts,
    defaultValues: addon
      ? addonToFormValues(addon)
      : initialAddonFormValues(base),
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        if (addon) {
          const holder = await findBlockingHolder(
            addon,
            value.maxQuantity,
            () => queryClient.fetchQuery(addonHoldersQueryOptions(addon.slug)),
          );
          if (holder) {
            setProblemFieldError(
              formApi,
              'maxQuantity',
              t('Pages.Addons.Form.Errors.maxQuantityHeld', {
                instance: holder.instanceName,
                quantity: holder.quantity,
              }),
            );

            return;
          }
          onSaved(
            await update.mutateAsync({
              body: addonFormValuesToUpdateBody(value, addon),
              path: { addonSlug: addon.slug },
            }),
          );

          return;
        }
        onSaved(
          await create.mutateAsync({
            body: addonFormValuesToCreateBody(value, { familySlug }),
          }),
        );
      } catch (error) {
        const problem = handleBillingProblem(error);
        const field = FIELD_BY_CODE[problem.code ?? ''];
        if (field && problem.detail) {
          setProblemFieldError(formApi, field, problem.detail);

          return;
        }
        setFailure(error);
      }
    },
  });

  return { failure, form };
}
