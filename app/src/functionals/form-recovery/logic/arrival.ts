export type ArrivalInput = {
  /** The steps of the form now, in order; empty for a single page. */
  steps: readonly string[];
  stored: {
    stepId: string | null;
    furthestStepId: string | null;
    /** The steps when the entry was written, for conditional steps. */
    stepIds: readonly string[] | null;
  };
  /** The first-level fields of each step. */
  stepFields?: Readonly<Record<string, readonly string[]>>;
  /** First-level keys that were reset, lost an item or fail the schema. */
  problemKeys: readonly string[];
  /** Omitted paths the person had filled in. */
  omittedFilled: readonly string[];
};

export type Arrival = { stepIndex: number; furthestIndex: number };

/**
 * Where a step id lands among the steps of today. A step that no longer exists
 * lands on the closest earlier one the entry knew, else on the first.
 */
function resolveIndex(
  stepId: string | null,
  steps: readonly string[],
  stepIds: readonly string[] | null,
): number {
  if (stepId === null || steps.length === 0) return 0;

  const direct = steps.indexOf(stepId);
  if (direct >= 0) return direct;

  const position = stepIds?.indexOf(stepId) ?? -1;
  for (let before = position - 1; before >= 0; before -= 1) {
    const index = steps.indexOf(stepIds![before]!);
    if (index >= 0) return index;
  }
  return 0;
}

function topLevel(path: string): string {
  return path.split('.')[0]!;
}

/**
 * The step to land on: the stored one, or an earlier one that holds a field to
 * correct (reset, lost an item, invalid) or a field never kept that the person
 * had filled in. A disabled submit button on the last step would not show the
 * field at fault.
 */
export function resolveArrival(input: ArrivalInput): Arrival {
  const { steps, stored, stepFields } = input;
  if (steps.length === 0) {
    return { stepIndex: 0, furthestIndex: 0 };
  }

  const storedIndex = resolveIndex(stored.stepId, steps, stored.stepIds);
  const flagged = new Set([
    ...input.problemKeys,
    ...input.omittedFilled.map(topLevel),
  ]);

  let stepIndex = storedIndex;
  for (let index = 0; index < storedIndex; index += 1) {
    const fields = stepFields?.[steps[index]!] ?? [];
    if (fields.some((field) => flagged.has(field))) {
      stepIndex = index;
      break;
    }
  }

  const furthestIndex = Math.max(
    stepIndex,
    resolveIndex(stored.furthestStepId, steps, stored.stepIds),
  );
  return { stepIndex, furthestIndex };
}
