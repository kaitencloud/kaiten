import {
  cloneValue,
  isEqualValue,
  isFilled,
  isPathUnder,
  isPlainObject,
  joinPath,
  setAtPath,
  splitPath,
} from './values';

export type PatchEntry = [path: string, value: unknown];

export type PatchOptions = {
  /** Paths never kept: they, and what lies under them. */
  omit: readonly string[];
  /** Omission decided by the value: a `writeOnly` field. */
  omitWhen?: (path: readonly string[], value: unknown) => boolean;
  /** Paths that do not make an input worth keeping: `grants[].key`. */
  ignore?: readonly string[];
};

export type PatchResult = {
  /** The paths that differ from the reference, with their new value. */
  patch: PatchEntry[];
  /** The omitted paths that were filled in; never their values. */
  omittedFilled: string[];
};

function isOmitted(
  path: string,
  segments: readonly string[],
  options: PatchOptions,
  value: unknown,
) {
  return (
    options.omit.some((omitted) => isPathUnder(path, omitted)) ||
    (options.omitWhen?.(segments, value) ?? false)
  );
}

/**
 * The patch of `values` against `reference`: every path that differs, going
 * down into plain objects (`licenseDate.to`, `metadata.<key>`) and taking
 * arrays and dates whole. Omitted paths never enter the patch; the filled ones
 * are listed apart, by path only.
 *
 * Storing the patch and not a snapshot is what keeps a value the person never
 * touched (today's date, a translated name, a default a deployment changed)
 * from being frozen as if they had typed it.
 */
export function computePatch(
  values: unknown,
  reference: unknown,
  options: PatchOptions,
): PatchResult {
  const result: PatchResult = { patch: [], omittedFilled: [] };

  const walk = (segments: string[], value: unknown, ref: unknown) => {
    const path = joinPath(segments);

    if (segments.length > 0 && isOmitted(path, segments, options, value)) {
      if (isFilled(value) && !isEqualValue(value, ref)) {
        result.omittedFilled.push(path);
      }
      return;
    }
    if (isEqualValue(value, ref)) {
      return;
    }
    if (isPlainObject(value) && isPlainObject(ref)) {
      const keys = new Set([...Object.keys(value), ...Object.keys(ref)]);
      for (const key of keys) {
        walk([...segments, key], value[key], ref[key]);
      }
      return;
    }
    result.patch.push([path, value]);
  };

  walk([], values, reference);
  return result;
}

function removePattern(node: unknown, pattern: readonly string[]): void {
  const [head, ...rest] = pattern;
  if (head === undefined) {
    return;
  }

  if (head === '[]') {
    if (Array.isArray(node)) {
      for (const item of node) removePattern(item, rest);
    }
    return;
  }

  if (!isPlainObject(node)) {
    return;
  }
  if (rest.length === 0) {
    delete node[head];
  } else {
    removePattern(node[head], rest);
  }
}

function toPattern(path: string): string[] {
  return path.replaceAll('[]', '.[].').split('.').filter(Boolean);
}

/** A copy without the ignored paths (`grants[].key` drops each row's key). */
export function stripIgnored<T>(
  value: T,
  ignore: readonly string[] | undefined,
): T {
  const copy = cloneValue(value);
  for (const path of ignore ?? []) {
    removePattern(copy, toPattern(path));
  }
  return copy;
}

/** Whether the values hold something worth keeping, apart from ignored paths. */
export function patchCounts(
  values: unknown,
  reference: unknown,
  options: PatchOptions,
): boolean {
  return (
    computePatch(
      stripIgnored(values, options.ignore),
      stripIgnored(reference, options.ignore),
      options,
    ).patch.length > 0
  );
}

/** The initial values with a patch laid on top; the omitted paths stay initial. */
export function applyPatch<T extends object>(
  pristine: T,
  entries: readonly PatchEntry[],
  omit: readonly string[],
): T {
  const merged = cloneValue(pristine) as Record<string, unknown>;

  for (const [path, value] of entries) {
    if (omit.some((omitted) => isPathUnder(path, omitted))) {
      continue;
    }
    setAtPath(merged, splitPath(path), cloneValue(value));
  }

  return merged as T;
}
