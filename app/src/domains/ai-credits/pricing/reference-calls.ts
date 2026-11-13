import type { AiUsage } from '@/api-client';

import { isNegative, parseDecimal } from './decimal';
import type { AiRequestType, ModelModality, PricingModel } from './types';

/**
 * Reference calls: the usage a rate card prices to compare models. Defaults
 * are the product owner's validated mockup values. Quantities that do not
 * apply are left out rather than set to 0: for the server a reported 0 is a
 * present quantity (it adds a zero line and is not "missing input").
 */

export const AI_REQUEST_TYPES: readonly AiRequestType[] = [
  'COMPLETION',
  'EMBEDDING',
  'IMAGE_GENERATION',
  'AUDIO',
  'VIDEO',
];

export const DEFAULT_REFERENCE_CALLS: Readonly<Record<AiRequestType, AiUsage>> =
  {
    COMPLETION: { inputTokens: 1500, outputTokens: 500 },
    EMBEDDING: { inputTokens: 2000 },
    IMAGE_GENERATION: { units: '1', unitType: 'image' },
    AUDIO: { units: '60', unitType: 'second', durationMs: 60000 },
    VIDEO: { units: '8', unitType: 'second', durationMs: 8000 },
  };

export type PreviewCallKind = 'SMALL' | 'REFERENCE' | 'LARGE';

/** Three calls for the editor's live preview: small, the reference, large. */
export function previewCalls(
  requestType: AiRequestType,
  reference: AiUsage = DEFAULT_REFERENCE_CALLS[requestType],
): { kind: PreviewCallKind; usage: AiUsage }[] {
  const around: Record<AiRequestType, [AiUsage, AiUsage]> = {
    COMPLETION: [
      { inputTokens: 300, outputTokens: 100 },
      { inputTokens: 12000, cacheReadInputTokens: 40000, outputTokens: 2000 },
    ],
    EMBEDDING: [{ inputTokens: 40 }, { inputTokens: 60000 }],
    IMAGE_GENERATION: [
      { units: '1', unitType: 'image' },
      { units: '4', unitType: 'image' },
    ],
    AUDIO: [
      { units: '10', unitType: 'second', durationMs: 10000 },
      { units: '900', unitType: 'second', durationMs: 900000 },
    ],
    VIDEO: [
      { units: '4', unitType: 'second', durationMs: 4000 },
      { units: '30', unitType: 'second', durationMs: 30000 },
    ],
  };
  const [small, large] = around[requestType];

  return [
    { kind: 'SMALL', usage: small },
    { kind: 'REFERENCE', usage: reference },
    { kind: 'LARGE', usage: large },
  ];
}

export type ReferenceCallIssue = {
  field: keyof Omit<AiUsage, 'unitType'>;
  code: 'NOT_A_COUNT' | 'NOT_A_QUANTITY';
};

const COUNT_FIELDS = [
  'inputTokens',
  'cacheReadInputTokens',
  'cacheWriteInputTokens',
  'outputTokens',
  'durationMs',
] as const;

/**
 * What the server would refuse in an edited reference call: a token count or
 * duration that is not a nonnegative integer, units that are not a
 * nonnegative decimal. An empty call is valid (a per-request rule needs none).
 */
export function validateReferenceCall(usage: AiUsage): ReferenceCallIssue[] {
  const issues: ReferenceCallIssue[] = [];
  for (const field of COUNT_FIELDS) {
    const value = usage[field];
    if (
      value !== undefined &&
      value !== null &&
      !(Number.isSafeInteger(value) && value >= 0)
    ) {
      issues.push({ field, code: 'NOT_A_COUNT' });
    }
  }
  if (usage.units !== undefined && usage.units !== null) {
    const units = parseDecimal(usage.units);
    if (units === null || isNegative(units)) {
      issues.push({ field: 'units', code: 'NOT_A_QUANTITY' });
    }
  }

  return issues;
}

const MODALITY_REQUEST_TYPES: Readonly<
  Record<ModelModality, readonly AiRequestType[]>
> = {
  TEXT: ['COMPLETION'],
  // Read as "chat with images in": a completion.
  MULTIMODAL: ['COMPLETION'],
  EMBEDDING: ['EMBEDDING'],
  IMAGE: ['IMAGE_GENERATION'],
  AUDIO: ['AUDIO'],
  VIDEO: ['VIDEO'],
};

/**
 * The request types a modality shows a tab for. A display heuristic only: the
 * server prices any request type for any model.
 */
export function requestTypesForModality(
  modality: ModelModality,
): readonly AiRequestType[] {
  return MODALITY_REQUEST_TYPES[modality] ?? [];
}

export function modelShowsRequestType(
  model: Pick<PricingModel, 'modality'>,
  requestType: AiRequestType,
): boolean {
  return (
    model.modality !== undefined &&
    requestTypesForModality(model.modality).includes(requestType)
  );
}
