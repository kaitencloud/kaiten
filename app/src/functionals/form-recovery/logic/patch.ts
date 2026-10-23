import {
  cloneValue,
  getAtPath,
  isEqualValue,
  isFilled,
  isPlainObject,
  isUnsafeSegment,
  joinPath,
  setAtPath,
  splitPath,
} from './values';

export type PatchEntry = [path: string, value: unknown];

export type PatchOptions = {
  /**
   * Paths never kept: they, and what lies under them. A path may go through an
   * array with `[]` (`grants[].token`), or name an index (`grants.0.token`).
   */
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

/** `grants[].key` as segments: `[]` stands for any index of an array. */
function toPattern(path: string): string[] {
  return path.replaceAll('[]', '.[].').split('.').filter(Boolean);
}

/** Whether `segments` is an omitted path, or lies under one. */
function isUnderOmitted(
  segments: readonly string[],
  omit: readonly string[],
): boolean {
  return omit.some((omitted) => {
    const pattern = toPattern(omitted);
    return (
      pattern.length <= segments.length &&
      pattern.every(
        (part, index) =>
          part === segments[index] ||
          (part === '[]' && /^\d+$/.test(segments[index]!)),
      )
    );
  });
}

function isOmitted(
  segments: readonly string[],
  options: PatchOptions,
  value: unknown,
) {
  return (
    isUnderOmitted(segments, options.omit) ||
    (options.omitWhen?.(segments, value) ?? false)
  );
}

/**
 * A copy of `value` without what lies omitted below `segments`, going down
 * into plain objects and into arrays, item by item. A value pushed whole (an
 * object over a `null` reference, an array, a row) goes through here, so that
 * a secret cannot travel inside it. `onOmitted` hears of each omitted path.
 */
function redact(
  segments: readonly string[],
  value: unknown,
  isOmittedBelow: (path: readonly string[], item: unknown) => boolean,
  onOmitted: (path: readonly string[], item: unknown) => void,
): { value: unknown; removed: boolean } {
  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) {
    return { value, removed: false };
  }

  let removed = false;
  const kept: [string, unknown][] = [];
  for (const [key, item] of Object.entries(value)) {
    if (isUnsafeSegment(key)) {
      removed = true;
      continue;
    }
    const path = [...segments, key];
    if (isOmittedBelow(path, item)) {
      removed = true;
      onOmitted(path, item);
      continue;
    }
    const inner = redact(path, item, isOmittedBelow, onOmitted);
    removed ||= inner.removed;
    kept.push([key, inner.value]);
  }

  return {
    value: isArray ? kept.map(([, item]) => item) : Object.fromEntries(kept),
    removed,
  };
}

/**
 * The patch of `values` against `reference`: every path that differs, going
 * down into plain objects (`licenseDate.to`, `metadata.<key>`) and taking
 * arrays and dates whole. Omitted paths never enter the patch, wherever they
 * sit, even inside a value taken whole; the filled ones are listed apart, by
 * path only.
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

  const noteOmitted = (segments: readonly string[], value: unknown) => {
    const path = joinPath(segments);
    if (
      isFilled(value) &&
      !isEqualValue(value, getAtPath(reference, segments)) &&
      !result.omittedFilled.includes(path)
    ) {
      result.omittedFilled.push(path);
    }
  };

  const walk = (segments: string[], value: unknown, ref: unknown) => {
    if (segments.length > 0 && isOmitted(segments, options, value)) {
      noteOmitted(segments, value);
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

    // Taken whole: the reference has no object to go down with (a `null` or an
    // absent ancestor), or the value is an array. What is omitted inside is
    // taken out, so that the shape of the reference never decides it.
    const { value: kept, removed } = redact(
      segments,
      value,
      (below, item) => isOmitted(below, options, item),
      noteOmitted,
    );
    // Only omitted content was typed in it: nothing to keep.
    if (removed && isPlainObject(kept) && Object.keys(kept).length === 0) {
      return;
    }
    result.patch.push([joinPath(segments), kept]);
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

/**
 * An entry of a stored patch without what lies omitted in it, or null when the
 * entry is omitted itself. The storage is read back as untrusted: an older
 * version of the form, or another hand, may have written an omitted path,
 * whole or inside a value taken whole.
 */
export function stripOmittedEntry(
  entry: PatchEntry,
  omit: readonly string[],
): PatchEntry | null {
  const segments = splitPath(entry[0]);
  if (segments.length === 0 || isUnderOmitted(segments, omit)) {
    return null;
  }
  const { value } = redact(
    segments,
    entry[1],
    (below) => isUnderOmitted(below, omit),
    () => undefined,
  );
  return [entry[0], value];
}

/** The initial values with a patch laid on top; the omitted paths stay initial. */
export function applyPatch<T extends object>(
  pristine: T,
  entries: readonly PatchEntry[],
  omit: readonly string[],
): T {
  const merged = cloneValue(pristine) as Record<string, unknown>;

  for (const stored of entries) {
    const entry = stripOmittedEntry(stored, omit);
    if (entry) {
      setAtPath(merged, splitPath(entry[0]), cloneValue(entry[1]));
    }
  }

  return merged as T;
}
