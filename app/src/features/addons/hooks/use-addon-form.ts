import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Addon } from '@/api-client';
import { createAddonMutation } from '@/api-client/@tanstack/react-query.gen';
import { handleBillingProblem, setProblemFieldError } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { invalidateAddonQueries, saveAddonOnFresh } from '../queries';
import {
  addonFormValuesToCreateBody,
  addonFormValuesToUpdateBody,
  addonToFormValues,
  initialAddonFormValues,
} from '../schemas';
import { addonFormOpts } from '../schemas/addon-form-options';

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
 * The update restates the version, so it reads the version again and puts what
 * the form changed on top of it: the default moved to another version of the
 * family, or a description edited from another tab, since the form opened stay as
 * they are.
 *
 * The most an instance can hold may be lowered under what an instance holds already:
 * the API lets it be and the instances keep the quantities they hold, so the form
 * sends the change as it is and asks nobody.
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
  // The version and the form as they were when the form opened: what the save
  // compares the form with, to tell what was changed from what was not.
  const [openedAddon] = useState(addon);
  const [openedValues] = useState(() =>
    addon ? addonToFormValues(addon) : initialAddonFormValues(base),
  );
  const update = useMutation({
    mutationFn: saveAddonOnFresh,
    onSuccess: async () => {
      await invalidateAddonQueries(queryClient, addon?.slug);
      toast.success(t('Pages.Addons.Form.Toasts.updated'));
    },
  });

  const form = useAppForm({
    ...addonFormOpts,
    defaultValues: openedValues,
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        if (addon) {
          // The same version builds both bodies, so they differ by the form only.
          const snapshot = openedAddon ?? addon;
          onSaved(
            await update.mutateAsync({
              addonSlug: addon.slug,
              edited: addonFormValuesToUpdateBody(value, snapshot),
              opened: addonFormValuesToUpdateBody(openedValues, snapshot),
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
