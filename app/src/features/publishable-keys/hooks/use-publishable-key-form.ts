import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PublishableKey, PublishableKeyCreated } from '@/api-client';
import {
  createPublishableKeyMutation,
  updatePublishableKeyMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  clearProblemFieldError,
  getProblemCode,
  placeRefusalOnFields,
  setProblemFieldError,
} from '@/domains/billing';
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
  // The schema of the site key and of the secret answers a plain 422 that names the
  // member and no code.
  byLocation: {
    turnstileSecret: 'turnstileSecret',
    turnstileSiteKey: 'turnstileSiteKey',
  },
} as const;

/** The refusal of a change to a key that was revoked in the meantime. */
export const REVOKED_REFUSAL = 'UpdatePublishableKey.Revoked';

/**
 * The refusals of a key that would open the anonymous checkout without a site key and a
 * secret. The switch is what they are about, whichever of the two is missing; they are
 * said in the console's words, as the form's own rule says them, and not in the API's
 * developer-facing sentence.
 */
const TURNSTILE_REFUSALS = new Set([
  'CreatePublishableKey.TurnstileNotConfigured',
  'UpdatePublishableKey.TurnstileNotConfigured',
]);

/** The refusals of a secret on a deployment that has no Vault to store it in. */
const VAULT_REFUSALS = new Set([
  'CreatePublishableKey.VaultNotConfigured',
  'UpdatePublishableKey.VaultNotConfigured',
]);

// The fields whose change takes back the refusal of the switch: it is about what they
// say together. The choice made on a stored secret does the same from its buttons, which
// change a value no field is drawn for.
const TURNSTILE_FIELDS = new Set(['turnstileSecret', 'turnstileSiteKey']);

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
 * toast, a log, the address or the storage of the browser. The same goes for the change
 * of a key, which carries the Turnstile secret the person typed: a secret is written and
 * never read, so nothing keeps it once the request is answered.
 *
 * A change is a PATCH: it states the label and the origins, and the rest only when the
 * person changed it, so that an absent member keeps what the API stores (the secret,
 * above all, which the form never holds).
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
  const update = useMutation({ ...updatePublishableKeyMutation(), gcTime: 0 });
  // What the form opened with, kept as it was: the change is told against it.
  const [openedValues] = useState(() =>
    publishableKey
      ? publishableKeyToFormValues(publishableKey)
      : initialPublishableKeyFormValues,
  );

  const form = useAppForm({
    ...publishableKeyFormOpts,
    defaultValues: openedValues,
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        setFailure(null);
        if (TURNSTILE_FIELDS.has(fieldApi.name)) {
          clearProblemFieldError(formApi, 'anonymousCheckout');
        }
      },
    },
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        if (publishableKey) {
          const saved = await update.mutateAsync({
            body: publishableKeyFormValuesToUpdateBody(value, openedValues),
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
        if (
          VAULT_REFUSALS.has(getProblemCode(error) ?? '') &&
          formApi.state.values.turnstileSecretAction === 'set'
        ) {
          // Said plainly, in the console's words: the deployment cannot store a secret.
          setProblemFieldError(
            formApi,
            'turnstileSecret',
            'Pages.Integrations.PublishableKeys.Form.Errors.vaultNotConfigured',
          );
        } else if (TURNSTILE_REFUSALS.has(getProblemCode(error) ?? '')) {
          setProblemFieldError(
            formApi,
            'anonymousCheckout',
            'Pages.Integrations.PublishableKeys.Form.Errors.turnstileRequired',
          );
        } else if (!placeRefusalOnFields(formApi, error, REFUSAL_FIELDS)) {
          setFailure(error);
        }
      }
    },
    validators: { onChange: publishableKeyFormSchema },
  });

  return { failure, form };
}
