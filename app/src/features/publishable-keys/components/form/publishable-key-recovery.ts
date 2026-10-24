import { defineFormRecovery } from '@/functionals/form-recovery';
import {
  type PublishableKeyFormValues,
  publishableKeyFormSchema,
} from '../../schemas';

const LABELS = 'Pages.Integrations.PublishableKeys.Form.Labels';

/**
 * What the issue of a publishable key keeps when it is left unsent: its label, its
 * origins and its anonymous checkout with the Turnstile site key, which is public by
 * design. The Turnstile secret is never written to the device: a secret is written to
 * the API and read by nobody, so the offer says it is to be entered again. The key the
 * API issues is never kept either: the send writes the tombstone before the form shows
 * it. One page: no steps.
 */
export const publishableKeyRecovery =
  defineFormRecovery<PublishableKeyFormValues>({
    formId: 'publishableKeys.create',
    version: 1,
    omit: ['turnstileSecret'],
    schema: publishableKeyFormSchema,
    fieldLabels: {
      anonymousCheckout: { key: `${LABELS}.anonymousCheckout` },
      label: { key: `${LABELS}.label` },
      origins: { key: `${LABELS}.origins` },
      turnstileSecret: { key: `${LABELS}.turnstileSecret` },
      // What the person does to the secret, and whether one is stored: both are the
      // secret's, as the form draws them.
      turnstileSecretAction: { key: `${LABELS}.turnstileSecret` },
      turnstileSecretOnFile: { key: `${LABELS}.turnstileSecret` },
      turnstileSiteKey: { key: `${LABELS}.turnstileSiteKey` },
    },
  });
