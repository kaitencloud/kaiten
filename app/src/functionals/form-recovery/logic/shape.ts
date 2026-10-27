import { isPlainObject } from './values';

/** The kind of value a path of the form is expected to hold. */
export type ExpectedShape =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object'
  | 'any';

type ZodDef = {
  type?: string;
  innerType?: unknown;
  in?: unknown;
  shape?: Record<string, unknown>;
  valueType?: unknown;
  options?: unknown[];
  entries?: Record<string, unknown>;
  values?: unknown[];
  getter?: () => unknown;
};

function defOf(schema: unknown): ZodDef | null {
  const def = (schema as { _zod?: { def?: ZodDef } } | null)?._zod?.def;
  return def ?? null;
}

const WRAPPERS = new Set([
  'optional',
  'nullable',
  'nonoptional',
  'readonly',
  'default',
  'prefault',
  'catch',
]);

/** Looks through optional, nullable, default, pipes and lazy schemas. */
function unwrap(schema: unknown): unknown {
  let current = schema;
  for (let depth = 0; depth < 16; depth += 1) {
    const def = defOf(current);
    if (!def) return current;
    if (def.type && WRAPPERS.has(def.type) && def.innerType) {
      current = def.innerType;
    } else if (def.type === 'pipe' && def.in) {
      current = def.in;
    } else if (def.type === 'lazy' && def.getter) {
      current = def.getter();
    } else {
      return current;
    }
  }
  return current;
}

function shapeOfDef(schema: unknown): ExpectedShape {
  const def = defOf(unwrap(schema));
  switch (def?.type) {
    case 'string':
    case 'enum':
    case 'template_literal':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'array':
    case 'tuple':
      return 'array';
    case 'object':
    case 'record':
      return 'object';
    case 'literal': {
      const kinds = new Set((def.values ?? []).map((value) => typeof value));
      return kinds.size === 1 && kinds.has('string') ? 'string' : 'any';
    }
    case 'union': {
      const shapes = new Set(
        (def.options ?? [])
          .filter((option) => {
            const type = defOf(unwrap(option))?.type;
            return type !== 'null' && type !== 'undefined';
          })
          .map(shapeOfDef),
      );
      return shapes.size === 1 ? [...shapes][0]! : 'any';
    }
    default:
      return 'any';
  }
}

/** One step into a schema: the property of an object, the value of a record. */
function child(schema: unknown, segment: string): unknown {
  const def = defOf(unwrap(schema));
  if (def?.type === 'object') {
    return def.shape?.[segment];
  }
  if (def?.type === 'record') {
    return def.valueType;
  }
  return undefined;
}

function shapeOfValue(value: unknown): ExpectedShape {
  if (value === null || value === undefined) return 'any';
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) return 'array';
  if (isPlainObject(value)) return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'any';
}

/**
 * The shape a path is expected to have. It is read from the schema when the
 * form declares one: an initial value of `null` or `undefined` says nothing
 * (the variants of a feature flag, the icon of an entitlement), and the schema
 * knows they are an array and a string. Without a schema, or where the schema
 * is silent, the initial value tells, and a null one accepts anything.
 */
export function expectedShape(
  schema: unknown,
  pristine: unknown,
  segments: readonly string[],
): ExpectedShape {
  let node: unknown = schema;
  let reference: unknown = pristine;

  for (const segment of segments) {
    node = node === undefined ? undefined : child(node, segment);
    reference = isPlainObject(reference) ? reference[segment] : undefined;
  }

  const fromSchema = node === undefined ? 'any' : shapeOfDef(node);
  return fromSchema === 'any' ? shapeOfValue(reference) : fromSchema;
}

/** `null` and `undefined` pass: the schema sorts them out afterwards. */
export function matchesShape(value: unknown, shape: ExpectedShape): boolean {
  if (value === null || value === undefined || shape === 'any') return true;

  switch (shape) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return value instanceof Date;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
  }
}
