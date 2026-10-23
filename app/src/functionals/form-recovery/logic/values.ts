/** Helpers on form values: plain objects, arrays, dates and scalars. */

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Equality of two values of a form: `Object.is` (so `NaN` equals `NaN`, which
 * a blank number field holds), dates by their instant, strings once trimmed.
 * Not the `deepEquals` of TanStack DB, for which `NaN !== NaN`: a blank form
 * would pass for a modified one.
 */
export function isEqualValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }
  if (a instanceof Date && b instanceof Date) {
    return Object.is(a.getTime(), b.getTime());
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((item, i) => isEqualValue(item, b[i]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => isEqualValue(a[key], b[key]));
  }
  return false;
}

/** A value the person filled in: not empty, not blank, not `NaN`. */
export function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return !Number.isNaN(value);
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) {
    return Object.values(value).some(isFilled);
  }
  return true;
}

/** A deep copy that keeps dates, arrays and plain objects; the rest by reference. */
export function cloneValue<T>(value: T): T {
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }
  if (Array.isArray(value)) {
    return value.map(cloneValue) as T;
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      copy[key] = cloneValue(item);
    }
    return copy as T;
  }
  return value;
}

export function splitPath(path: string): string[] {
  return path === '' ? [] : path.split('.');
}

export function joinPath(
  segments: readonly (string | number | symbol)[],
): string {
  return segments.map(String).join('.');
}

export function getAtPath(root: unknown, segments: readonly string[]): unknown {
  let node: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(node)) {
      node = node[Number(segment)];
    } else if (isPlainObject(node)) {
      node = node[segment];
    } else {
      return undefined;
    }
  }
  return node;
}

/** Sets a value in a root that is already a copy; creates missing objects. */
export function setAtPath(
  root: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
): void {
  let node: Record<string, unknown> | unknown[] = root;

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    const key = Array.isArray(node) ? Number(segment) : segment;

    if (isLast) {
      (node as Record<string | number, unknown>)[key] = value;
      return;
    }

    let next = (node as Record<string | number, unknown>)[key];
    if (typeof next !== 'object' || next === null) {
      next = {};
      (node as Record<string | number, unknown>)[key] = next;
    }
    node = next as Record<string, unknown> | unknown[];
  });
}

/** True when `path` is `ancestor` or lies under it. */
export function isPathUnder(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}.`);
}
