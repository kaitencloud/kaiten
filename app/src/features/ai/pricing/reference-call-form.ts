import { z } from 'zod';
import type { AiUsage } from '@/api-client';
import { type AiRequestType, validateReferenceCall } from './engine';

/**
 * The reference call as its small form holds it: one text per quantity, blank
 * when the call does not report it. A blank is left out of the usage, never
 * sent as 0: for the server a reported 0 is a quantity.
 */

export type ReferenceField =
  | 'inputTokens'
  | 'cacheReadInputTokens'
  | 'cacheWriteInputTokens'
  | 'outputTokens'
  | 'images'
  | 'seconds';

export type ReferenceDraft = Record<ReferenceField, string>;

export const REFERENCE_FIELDS: Readonly<
  Record<AiRequestType, readonly ReferenceField[]>
> = {
  COMPLETION: [
    'inputTokens',
    'cacheReadInputTokens',
    'cacheWriteInputTokens',
    'outputTokens',
  ],
  EMBEDDING: ['inputTokens'],
  IMAGE_GENERATION: ['images'],
  AUDIO: ['seconds'],
  VIDEO: ['seconds'],
};

const MS_PER_SECOND = 1000;
const WHOLE = /^\d{1,12}$/;
const text = (value: number | undefined) =>
  value == null ? '' : String(value);

export function toReferenceDraft(usage: AiUsage): ReferenceDraft {
  return {
    inputTokens: text(usage.inputTokens),
    cacheReadInputTokens: text(usage.cacheReadInputTokens),
    cacheWriteInputTokens: text(usage.cacheWriteInputTokens),
    outputTokens: text(usage.outputTokens),
    images: usage.unitType === 'image' ? (usage.units ?? '') : '',
    seconds:
      usage.durationMs == null ? '' : String(usage.durationMs / MS_PER_SECOND),
  };
}

/** The usage a draft says, with only the fields its request type has. */
export function toReferenceUsage(
  type: AiRequestType,
  draft: ReferenceDraft,
): AiUsage {
  const usage: AiUsage = {};
  for (const field of REFERENCE_FIELDS[type]) {
    const value = draft[field].trim();
    if (value === '') {
      continue;
    }
    if (field === 'images') {
      usage.units = value;
      usage.unitType = 'image';
    } else if (field === 'seconds') {
      usage.units = value;
      usage.unitType = 'second';
      usage.durationMs = Number(value) * MS_PER_SECOND;
    } else {
      usage[field] = Number(value);
    }
  }

  return usage;
}

const isBlankOrWhole = (value: string) =>
  value.trim() === '' || WHOLE.test(value.trim());

const quantity = z.string().refine(isBlankOrWhole, {
  message: 'AI.Pricing.reference.invalidCount',
});

/** Whole numbers only, and then whatever the engine's validator refuses. */
export const referenceDraftSchema = (type: AiRequestType) =>
  z
    .object({
      inputTokens: quantity,
      cacheReadInputTokens: quantity,
      cacheWriteInputTokens: quantity,
      outputTokens: quantity,
      images: quantity,
      seconds: quantity,
    })
    .superRefine((draft, context) => {
      if (!Object.values(draft).every(isBlankOrWhole)) {
        return;
      }
      for (const issue of validateReferenceCall(
        toReferenceUsage(type, draft),
      )) {
        context.addIssue({
          code: 'custom',
          message: 'AI.Pricing.reference.invalidCount',
          path: [
            issue.field === 'units' || issue.field === 'durationMs'
              ? REFERENCE_FIELDS[type].includes('images')
                ? 'images'
                : 'seconds'
              : issue.field,
          ],
        });
      }
    });
