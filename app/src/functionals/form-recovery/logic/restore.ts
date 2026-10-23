import type { z } from 'zod';
import type { FormRecoveryLabel, FormRecoveryNote } from '../types';
import { applyPatch, type PatchEntry } from './patch';
import { expectedShape, matchesShape } from './shape';
import {
  cloneValue,
  getAtPath,
  isEqualValue,
  isPathUnder,
  joinPath,
  setAtPath,
  splitPath,
} from './values';

/**
 * A drift is a value the form no longer accepts and that is not the blank one:
 * an enum value that was removed, a field whose type changed. An incomplete
 * value (empty, too short, wrong format) is not one: the field shows its usual
 * message. An interrupted input is incomplete by nature, and a strict parse
 * would reject it whole.
 */
const DRIFT_CODES = new Set([
  'invalid_type',
  'invalid_value',
  'invalid_union',
  'unrecognized_keys',
  'invalid_key',
  'invalid_element',
]);

export type RestoreContext<TValues extends object> = {
  pristine: TValues;
  schema?: z.ZodType<TValues>;
  omit: readonly string[];
  fieldLabels?: Partial<Record<string, FormRecoveryLabel>>;
};

export type RestoreOutcome<TValues> = {
  values: TValues;
  notes: FormRecoveryNote[];
  /** First-level keys the restore reset to their initial value. */
  resetKeys: string[];
  /** First-level keys that lost an item of an array. */
  removedKeys: string[];
  /** First-level keys the person filled in that do not pass the schema. */
  invalidKeys: string[];
  /** First-level keys that differ from the initial values. */
  changedKeys: string[];
};

type Issue = { code: string; path: PropertyKey[] };

function issuesOf(schema: z.ZodType, value: unknown): Issue[] {
  const result = schema.safeParse(value);
  return result.success ? [] : (result.error.issues as Issue[]);
}

function pathKey(path: readonly PropertyKey[]): string {
  return path.map(String).join('.');
}

function labelOf(
  context: { fieldLabels?: Partial<Record<string, FormRecoveryLabel>> },
  key: string,
): FormRecoveryLabel {
  return context.fieldLabels?.[key] ?? { text: key };
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

/** Keeps the entries the form can take, and the keys of those it cannot. */
function selectApplicable<TValues extends object>(
  entries: readonly PatchEntry[],
  context: RestoreContext<TValues>,
): { applicable: PatchEntry[]; mismatched: string[] } {
  const applicable: PatchEntry[] = [];
  const mismatched: string[] = [];

  for (const entry of entries) {
    const segments = splitPath(entry[0]);
    const [top] = segments;
    if (top === undefined || !(top in context.pristine)) {
      continue; // the field was removed from the form
    }
    if (context.omit.some((omitted) => isPathUnder(entry[0], omitted))) {
      continue; // an older version may have written it
    }

    const shape = expectedShape(context.schema, context.pristine, segments);
    if (matchesShape(entry[1], shape)) {
      applicable.push(entry);
    } else {
      pushUnique(mismatched, top);
    }
  }

  return { applicable, mismatched };
}

type Drift = { path: string[]; arrayAt: number };

function findDrifts<TValues extends object>(
  context: RestoreContext<TValues>,
  merged: TValues,
): Drift[] {
  const { schema, pristine } = context;
  if (!schema) return [];

  const atPristine = new Set(
    issuesOf(schema, pristine).map((issue) => pathKey(issue.path)),
  );
  const drifts = new Map<string, Drift>();

  for (const issue of issuesOf(schema, merged)) {
    const key = pathKey(issue.path);
    const path = issue.path.map(String);
    if (issue.path.length === 0 || !DRIFT_CODES.has(issue.code)) {
      continue;
    }
    // The blank form fails at this path too (an empty number field, an enum
    // still at ''): if the value is that very blank one, the field is merely
    // incomplete. A value that differs from it and fails is a drift.
    if (
      atPristine.has(key) &&
      isEqualValue(getAtPath(merged, path), getAtPath(pristine, path))
    ) {
      continue;
    }
    const arrayAt = path.findIndex((segment) => /^\d+$/.test(segment));
    drifts.set(key, { path, arrayAt });
  }

  return [...drifts.values()];
}

function fixDrifts<TValues extends object>(
  context: RestoreContext<TValues>,
  merged: TValues,
  outcome: Pick<RestoreOutcome<TValues>, 'notes' | 'resetKeys' | 'removedKeys'>,
): TValues {
  const values = cloneValue(merged) as Record<string, unknown>;
  const removals = new Map<string, { path: string[]; indices: Set<number> }>();

  for (const { path, arrayAt } of findDrifts(context, merged)) {
    const [top] = path;
    if (arrayAt >= 0) {
      const arrayPath = path.slice(0, arrayAt);
      const entry = removals.get(joinPath(arrayPath)) ?? {
        path: arrayPath,
        indices: new Set<number>(),
      };
      entry.indices.add(Number(path[arrayAt]));
      removals.set(joinPath(arrayPath), entry);
      continue;
    }

    const initial = getAtPath(context.pristine, path);
    if (!isEqualValue(getAtPath(values, path), initial)) {
      setAtPath(values, path, cloneValue(initial));
      pushUnique(outcome.resetKeys, top!);
    }
  }

  for (const { path, indices } of removals.values()) {
    const list = getAtPath(values, path);
    if (Array.isArray(list)) {
      setAtPath(
        values,
        path,
        list.filter((_, index) => !indices.has(index)),
      );
      pushUnique(outcome.removedKeys, path[0]!);
    }
  }

  return values as TValues;
}

/**
 * The restore pipeline, pure: lays the patch on the initial values of today,
 * then sorts what the form would no longer take. A value of the wrong shape is
 * not applied; a drift is reset to its initial value, or removed when it sits
 * in an array, which has no initial value per item. A note is made only when
 * the stored value really differed from what replaced it.
 */
export function restoreValues<TValues extends object>(
  entries: readonly PatchEntry[],
  context: RestoreContext<TValues>,
): RestoreOutcome<TValues> {
  const { applicable, mismatched } = selectApplicable(entries, context);
  const merged = applyPatch(context.pristine, applicable, context.omit);

  const partial = {
    notes: [] as FormRecoveryNote[],
    resetKeys: [...mismatched],
    removedKeys: [] as string[],
  };
  const values = fixDrifts(context, merged, partial);

  for (const key of partial.resetKeys) {
    partial.notes.push({ kind: 'reset', field: labelOf(context, key) });
  }
  for (const key of partial.removedKeys) {
    partial.notes.push({ kind: 'itemRemoved', field: labelOf(context, key) });
  }

  const changedKeys = Object.keys(values).filter(
    (key) =>
      !isEqualValue(
        (values as Record<string, unknown>)[key],
        (context.pristine as Record<string, unknown>)[key],
      ),
  );
  const invalidKeys: string[] = [];
  if (context.schema) {
    for (const issue of issuesOf(context.schema, values)) {
      const top = issue.path[0];
      if (top !== undefined && changedKeys.includes(String(top))) {
        pushUnique(invalidKeys, String(top));
      }
    }
  }

  return { values, ...partial, invalidKeys, changedKeys };
}
