import { z } from 'zod';
import type {
  PublishableKey,
  PublishableKeyDraft,
  PublishableKeyPatch,
} from '@/api-client';
import { zPublishableKeyDraft } from '@/api-client/zod.gen';
import { originsToText, parseOrigins } from '../utils/origins';

const ERRORS = 'Pages.Integrations.PublishableKeys.Form.Errors';

/**
 * The form of a publishable key: what it is for, and the origins a page may send it
 * from, one to a line. The form state is not the request body, since the origins are the
 * text of a field, so the schema is built around the contract's fields instead of being
 * the generated one: the label is held to the contract's own rule, one to a hundred
 * characters once trimmed, and the origins, once read, to its limit on their number. The
 * bounds are never written here, only the words of the refusal, which are ours instead of
 * the validator's.
 */
export const publishableKeyFormSchema = z.object({
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
});

export type PublishableKeyFormValues = z.infer<typeof publishableKeyFormSchema>;

/** A new key: no label yet, and no browser origin until one is given. */
export const initialPublishableKeyFormValues: PublishableKeyFormValues = {
  label: '',
  origins: '',
};

/** The values of the form of a key that exists. */
export const publishableKeyToFormValues = (
  key: Pick<PublishableKey, 'allowedOrigins' | 'label'>,
): PublishableKeyFormValues => ({
  label: key.label,
  origins: originsToText(key.allowedOrigins),
});

/** The body that issues a key. */
export function publishableKeyFormValuesToCreateBody(
  values: PublishableKeyFormValues,
): PublishableKeyDraft {
  return {
    allowedOrigins: parseOrigins(values.origins).origins,
    label: values.label.trim(),
  };
}

/**
 * The body that changes a key. It states both members, the label and the origins,
 * whatever changed: the API replaces the origins as a whole, and a request that says
 * what the key should be is the same however often it is sent.
 */
export function publishableKeyFormValuesToUpdateBody(
  values: PublishableKeyFormValues,
): PublishableKeyPatch {
  return publishableKeyFormValuesToCreateBody(values);
}
