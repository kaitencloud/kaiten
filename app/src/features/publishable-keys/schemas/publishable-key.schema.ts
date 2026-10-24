import { z } from 'zod';
import type { PublishableKey } from '@/api-client';
import { zPublishableKeyDraft } from '@/api-client/zod.gen';
import { originsToText, parseOrigins } from '../utils/origins';
import {
  canOpenAnonymousCheckout,
  type TurnstileSecretAction,
} from '../utils/turnstile';

const ERRORS = 'Pages.Integrations.PublishableKeys.Form.Errors';

/**
 * The form of a publishable key: what it is for, the origins a page may send it from, one
 * to a line, and whether it opens the anonymous checkout, with the Turnstile site key and
 * secret that guard it. The form state is not the request body, since the origins are the
 * text of a field and the secret is something the person does to the stored one, so the
 * schema is built around the contract's fields instead of being the generated one: the
 * label, the site key and the secret are held to the contract's own rules, and the origins,
 * once read, to its limit on their number. The bounds are never written here, only the
 * words of the refusal, which are ours instead of the validator's.
 */
export const publishableKeyFormSchema = z
  .object({
    anonymousCheckout: z.boolean(),
    label: z
      .string()
      .trim()
      .superRefine((label, ctx) => {
        const { error } = zPublishableKeyDraft.shape.label.safeParse(label);
        for (const issue of error?.issues ?? []) {
          ctx.addIssue({
            code: 'custom',
            message: `${ERRORS}.${issue.code === 'too_big' ? 'labelTooLong' : 'label'}`,
          });
        }
      }),
    origins: z
      .string()
      .refine((text) => parseOrigins(text).rejected.length === 0, {
        error: `${ERRORS}.origins`,
      })
      .refine(
        (text) =>
          zPublishableKeyDraft.shape.allowedOrigins.safeParse(
            parseOrigins(text).origins,
          ).success,
        { error: `${ERRORS}.tooManyOrigins` },
      ),
    // What is typed in the secret field. Never read back from the API, and never kept
    // by the form once it was sent.
    turnstileSecret: z.string(),
    turnstileSecretAction: z.enum(['keep', 'remove', 'set']),
    // Whether the API holds a secret for the key as the form opened: a replacement is
    // asked to be typed, a first secret is optional.
    turnstileSecretOnFile: z.boolean(),
    turnstileSiteKey: z
      .string()
      .trim()
      .refine(
        (siteKey) =>
          siteKey === '' ||
          zPublishableKeyDraft.shape.turnstileSiteKey.safeParse(siteKey)
            .success,
        { error: `${ERRORS}.turnstileSiteKey` },
      ),
  })
  .superRefine((values, ctx) => {
    const typed = values.turnstileSecret.trim();
    const replacing =
      values.turnstileSecretAction === 'set' && values.turnstileSecretOnFile;

    if (
      values.turnstileSecretAction === 'set' &&
      typed !== '' &&
      !zPublishableKeyDraft.shape.turnstileSecret.safeParse(typed).success
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `${ERRORS}.turnstileSecretTooLong`,
        path: ['turnstileSecret'],
      });
    }
    if (replacing && typed === '') {
      ctx.addIssue({
        code: 'custom',
        message: `${ERRORS}.turnstileSecretRequired`,
        path: ['turnstileSecret'],
      });
    }
    // A secret being replaced and still empty has its own message; the switch does not
    // repeat it.
    if (
      values.anonymousCheckout &&
      !canOpenAnonymousCheckout(values) &&
      !(replacing && typed === '')
    ) {
      // A stored secret being removed is said here alone, in its own words: the line
      // of the secret only says that it will be removed.
      ctx.addIssue({
        code: 'custom',
        message:
          values.turnstileSecretAction === 'remove'
            ? `${ERRORS}.turnstileSecretRemoved`
            : `${ERRORS}.turnstileRequired`,
        path: ['anonymousCheckout'],
      });
    }
  });

export type PublishableKeyFormValues = z.infer<typeof publishableKeyFormSchema>;

/** A new key: no label yet, no browser origin until one is given, and no anonymous checkout. */
export const initialPublishableKeyFormValues: PublishableKeyFormValues = {
  anonymousCheckout: false,
  label: '',
  origins: '',
  turnstileSecret: '',
  turnstileSecretAction: 'set' satisfies TurnstileSecretAction,
  turnstileSecretOnFile: false,
  turnstileSiteKey: '',
};

/**
 * The values of the form of a key that exists. The secret is never among them: the API
 * says only whether one is stored, and the form then keeps it until the person says
 * otherwise.
 */
export const publishableKeyToFormValues = (
  key: Pick<
    PublishableKey,
    | 'allowedOrigins'
    | 'anonymousCheckout'
    | 'label'
    | 'turnstileSecretConfigured'
    | 'turnstileSiteKey'
  >,
): PublishableKeyFormValues => ({
  anonymousCheckout: key.anonymousCheckout,
  label: key.label,
  origins: originsToText(key.allowedOrigins),
  turnstileSecret: '',
  turnstileSecretAction: key.turnstileSecretConfigured ? 'keep' : 'set',
  turnstileSecretOnFile: key.turnstileSecretConfigured,
  turnstileSiteKey: key.turnstileSiteKey ?? '',
});
