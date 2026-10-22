import type { PublishableKeyDraft, PublishableKeyPatch } from '@/api-client';
import { parseOrigins } from '../utils/origins';
import type { PublishableKeyFormValues } from './publishable-key.schema';

/**
 * The body that issues a key. The anonymous checkout and the Turnstile members are in it
 * only when the person gave them: a key that is only for the catalog sends the label and
 * the origins, as it always did.
 */
export function publishableKeyFormValuesToCreateBody(
  values: PublishableKeyFormValues,
): PublishableKeyDraft {
  const siteKey = values.turnstileSiteKey.trim();
  const secret = values.turnstileSecret.trim();

  return {
    allowedOrigins: parseOrigins(values.origins).origins,
    label: values.label.trim(),
    ...(values.anonymousCheckout ? { anonymousCheckout: true } : {}),
    ...(siteKey ? { turnstileSiteKey: siteKey } : {}),
    ...(secret ? { turnstileSecret: secret } : {}),
  };
}

/**
 * The body that changes a key. The label and the origins are always stated, whatever
 * changed: the API replaces the origins as a whole, and a request that says what the
 * key should be is the same however often it is sent. The rest is a PATCH in the strict
 * sense, since an absent member keeps what the API stores: the anonymous checkout and the
 * site key are sent only when the person changed them (an empty site key clears it), and
 * the secret only when the person typed a new one or asked for it to be removed (an empty
 * secret deletes it). A label-only edit therefore never touches the secret.
 */
export function publishableKeyFormValuesToUpdateBody(
  values: PublishableKeyFormValues,
  opened: PublishableKeyFormValues,
): PublishableKeyPatch {
  const siteKey = values.turnstileSiteKey.trim();
  const secret = values.turnstileSecret.trim();

  return {
    allowedOrigins: parseOrigins(values.origins).origins,
    label: values.label.trim(),
    ...(values.anonymousCheckout !== opened.anonymousCheckout
      ? { anonymousCheckout: values.anonymousCheckout }
      : {}),
    ...(siteKey !== opened.turnstileSiteKey.trim()
      ? { turnstileSiteKey: siteKey }
      : {}),
    ...(values.turnstileSecretAction === 'set' && secret
      ? { turnstileSecret: secret }
      : {}),
    ...(values.turnstileSecretAction === 'remove'
      ? { turnstileSecret: '' }
      : {}),
  };
}
