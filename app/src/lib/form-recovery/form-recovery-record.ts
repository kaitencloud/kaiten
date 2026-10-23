import { z } from 'zod';

/** The shape of the stored records. Another value is purged, silently. */
export const FORM_RECOVERY_ENVELOPE = 1;
/** One record is rewritten as a whole on every change: it stays small. */
export const FORM_RECOVERY_MAX_RECORD_BYTES = 64 * 1024;
/** Entries in the browser; the oldest one that no tab holds is evicted. */
export const FORM_RECOVERY_MAX_RECORDS = 20;
/** Entries for one form, one person and one context. */
export const FORM_RECOVERY_MAX_LINEAGES_PER_SCOPE = 3;
export const FORM_RECOVERY_DEFAULT_RETENTION_DAYS = 7;
/** Tombstones and the mark of a sign-out. */
export const FORM_RECOVERY_MARK_RETENTION_HOURS = 24;

/**
 * Where an entry belongs: one person, one organization, one form, one context.
 * `context` is what changes the meaning of the created object (a locked
 * customer, the voucher a boost is made for), never a secret.
 */
const scopeShape = {
  envelope: z.literal(FORM_RECOVERY_ENVELOPE),
  userId: z.string().min(1),
  /** The external organization id; empty outside an organization. */
  organizationId: z.string(),
  formId: z.string().min(1),
  context: z.string(),
  /** One unsent input: created at its first write, adopted by "Resume". */
  lineageId: z.string().min(1),
};

/**
 * Every record is complete: an optional field is present, as null, when it has
 * no value. A write replaces the record whole, so it never depends on what the
 * previous one held.
 */
export const formRecoveryEntrySchema = z.object({
  kind: z.literal('entry'),
  /** Scope key, a bar, the lineage id. */
  key: z.string(),
  ...scopeShape,
  /** The mount that wrote last. */
  sessionId: z.string().min(1),
  formVersion: z.number().int().nonnegative(),
  status: z.enum(['editing', 'submitting']),
  /** Number of the future idempotency key; only a plain refusal raises it. */
  attempt: z.number().int().nonnegative(),
  /** A send went out without a verdict; cleared by a verdict. */
  attemptedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  stepId: z.string().nullable(),
  furthestStepId: z.string().nullable(),
  /** The steps at the time of the write, for conditional steps. */
  stepIds: z.array(z.string()).nullable(),
  /** The patch against the initial values, encoded by the payload codec. */
  payload: z.string(),
  /** Omitted paths that were filled; never their values. */
  omittedFilled: z.array(z.string()),
  /** Id to name of catalog objects, to name what later disappears. */
  labels: z.record(z.string(), z.string()),
  /** State outside the form, encoded, only when it was modified. */
  extra: z.string().nullable(),
  /** Fingerprint of what `extra` was copied from. */
  extraSource: z.string().nullable(),
});

export const formRecoveryTombstoneSchema = z.object({
  kind: z.literal('tombstone'),
  key: z.string(),
  ...scopeShape,
  reason: z.enum(['sent', 'discarded', 'evicted']),
  at: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** On a `sent`: what the server created. */
  created: z
    .object({ id: z.string(), label: z.string().nullable() })
    .nullable(),
  /** A `sent` of a chain whose next request has yet to succeed. */
  followUp: z.boolean(),
  /** The notice about that chain was dismissed. */
  followUpSeen: z.boolean(),
});

export const formRecoveryUserMarkSchema = z.object({
  kind: z.literal('userMark'),
  /** `user|` and the user id. */
  key: z.string(),
  envelope: z.literal(FORM_RECOVERY_ENVELOPE),
  userId: z.string().min(1),
  /** An explicit sign-out: no write older than this goes through. */
  signedOutAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export const formRecoveryRecordSchema = z.discriminatedUnion('kind', [
  formRecoveryEntrySchema,
  formRecoveryTombstoneSchema,
  formRecoveryUserMarkSchema,
]);

export type FormRecoveryEntry = z.infer<typeof formRecoveryEntrySchema>;
export type FormRecoveryTombstone = z.infer<typeof formRecoveryTombstoneSchema>;
export type FormRecoveryUserMark = z.infer<typeof formRecoveryUserMarkSchema>;
export type FormRecoveryRecord = z.infer<typeof formRecoveryRecordSchema>;

export type FormRecoveryScope = Pick<
  FormRecoveryEntry,
  'userId' | 'organizationId' | 'formId' | 'context'
>;
