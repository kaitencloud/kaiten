import { encodePayload } from '@/lib/form-recovery';
import type { FormRecoveryDescriptor, FormRecoverySnapshot } from '../types';
import { computePatch, patchCounts, type PatchOptions } from './patch';

export type SnapshotInput = {
  descriptor: FormRecoveryDescriptor<any, any, any>;
  values: unknown;
  /** The values the patch is made against. */
  reference: unknown;
  /** The state outside the form, now and at the reference. */
  extra?: unknown;
  /**
   * The state outside the form at the reference. Absent when the reference is
   * unknown, as after a restore: what was restored then counts as modified.
   */
  extraReference?: { value: unknown };
  references: Record<string, unknown>;
  steps: readonly string[];
  stepIndex: number;
  furthestIndex: number;
};

function encodeExtra(extra: unknown): string | null {
  return extra === undefined ? null : encodePayload(extra);
}

/**
 * What the form has to tell the session: the patch against its reference,
 * encoded, with the paths that were omitted but filled, the names of catalog
 * objects, the state outside the form if it changed, and the step. Throws a
 * `FormRecoverySerializationError` for a value that cannot be stored (a file
 * whose path was not omitted); the caller logs it and keeps what it has.
 */
export function buildSnapshot(input: SnapshotInput): FormRecoverySnapshot {
  const { descriptor, references } = input;
  const options: PatchOptions = {
    omit: descriptor.omit,
    omitWhen: descriptor.omitWhen
      ? (path, value) => descriptor.omitWhen!(path, value, references)
      : undefined,
    ignore: descriptor.ignore,
  };

  const { patch, omittedFilled } = computePatch(
    input.values,
    input.reference,
    options,
  );
  const payload = encodePayload(patch);

  const extra = encodeExtra(input.extra);
  const extraChanged =
    extra !== null &&
    (input.extraReference === undefined ||
      extra !== encodeExtra(input.extraReference.value));

  const { steps } = input;
  return {
    counts: extraChanged || patchCounts(input.values, input.reference, options),
    payload,
    omittedFilled,
    labels: descriptor.labels?.(input.values, references) ?? {},
    extra: extraChanged ? extra : null,
    extraSource: extraChanged
      ? (descriptor.extraSource?.(references) ?? null)
      : null,
    stepId: steps[input.stepIndex] ?? null,
    furthestStepId: steps[input.furthestIndex] ?? null,
    stepIds: steps.length > 0 ? [...steps] : null,
  };
}
