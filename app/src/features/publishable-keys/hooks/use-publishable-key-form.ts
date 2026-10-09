import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PublishableKey, PublishableKeyCreated } from '@/api-client';
import {
  createPublishableKeyMutation,
  updatePublishableKeyMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { getProblemCode, placeRefusalOnFields } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { invalidatePublishableKeyQueries } from '../queries';
import {
  initialPublishableKeyFormValues,
  publishableKeyFormOpts,
  publishableKeyFormSchema,
  publishableKeyFormValuesToCreateBody,
  publishableKeyFormValuesToUpdateBody,
  publishableKeyToFormValues,
} from '../schemas';

// The refusals that are about one field of the form, by their code: the API says them in
// prose, in `detail`, and does not locate them.
const REFUSAL_FIELDS = {
  byCode: {
    'CreatePublishableKey.InvalidLabel': 'label',
    'CreatePublishableKey.InvalidOrigin': 'origins',
    'CreatePublishableKey.TooManyOrigins': 'origins',
    'UpdatePublishableKey.InvalidLabel': 'label',
    'UpdatePublishableKey.InvalidOrigin': 'origins',
    'UpdatePublishableKey.TooManyOrigins': 'origins',
  },
} as const;

/** The refusal of a change to a key that was revoked in the meantime. */
export const REVOKED_REFUSAL = 'UpdatePublishableKey.Revoked';

type UsePublishableKeyFormOptions = {
  /** Called once the API issued the key, with the only copy of it there will be. */
  onCreated?: (created: PublishableKeyCreated) => void;
  /** Called once the API accepted the change to the key. */
  onSaved?: (publishableKey: PublishableKey) => void;
  /** The key to change; without one the form issues a new key. */
  publishableKey?: PublishableKey;
};

/**
 * The form that issues a publishable key or changes one. A refusal leaves the form as it
 * was typed, on its field when it is about one and above the buttons otherwise. A key
 * revoked in the meantime (409) refreshes the list, which then shows it revoked.
 *
 * The key comes back once, in the answer to the creation, and goes to `onCreated` and
 * nowhere else. The mutation is dropped as soon as nothing observes it (`gcTime: 0`),
 * so that the key does not stay in the cache of the mutations, and it is never put in a
 * toast, a log, the address or the storage of the browser.
 */
export function usePublishableKeyForm({
  onCreated,
  onSaved,
  publishableKey,
}: UsePublishableKeyFormOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  const create = useMutation({ ...createPublishableKeyMutation(), gcTime: 0 });
  const update = useMutation(updatePublishableKeyMutation());

  const form = useAppForm({
    ...publishableKeyFormOpts,
    defaultValues: publishableKey
      ? publishableKeyToFormValues(publishableKey)
      : initialPublishableKeyFormValues,
    listeners: { onChange: () => setFailure(null) },
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        if (publishableKey) {
          const saved = await update.mutateAsync({
            body: publishableKeyFormValuesToUpdateBody(value),
            path: { keyId: publishableKey.id },
          });
          await invalidatePublishableKeyQueries(queryClient);
          toast.success(
            t('Pages.Integrations.PublishableKeys.Edit.saved', {
              label: saved.label,
            }),
          );
          onSaved?.(saved);
        } else {
          const created = await create.mutateAsync({
            body: publishableKeyFormValuesToCreateBody(value),
          });
          // The only copy of the key goes first: whatever happens to the list after,
          // it is shown.
          onCreated?.(created);
          void invalidatePublishableKeyQueries(queryClient);
        }
      } catch (error) {
        if (getProblemCode(error) === REVOKED_REFUSAL) {
          void invalidatePublishableKeyQueries(queryClient);
        }
        if (!placeRefusalOnFields(formApi, error, REFUSAL_FIELDS)) {
          setFailure(error);
        }
      }
    },
    validators: { onChange: publishableKeyFormSchema },
  });

  return { failure, form };
}
