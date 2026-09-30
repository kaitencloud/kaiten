import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { MetadataUiType } from './types';

/**
 * Centralized Ajv instance.
 *
 * We share one Ajv instance because:
 *  - compiling a schema is the slow part — Ajv's internal cache deduplicates
 *    repeated compilations of the same schema reference.
 *  - we want the same set of supported formats (date / date-time / email / …)
 *    across every helper that consumes this module.
 *  - the helpers are pure functions, so a module-level singleton is the
 *    natural place to hold compiled state.
 *
 * 2020-12 was picked because the backend validator is also pinned
 * to draft 2020-12 — same dialect on both sides means a schema accepted by
 * the admin form survives a roundtrip through the API.
 */
export const ajv = (() => {
  const instance = new Ajv2020({
    allErrors: true,
    strict: false,
    // discriminator is unused but enabling it keeps room for future polymorphic
    // schemas without breaking compiled caches.
    discriminator: true,
  });
  addFormats(instance);
  return instance;
})();

/**
 * Compile a JSON Schema and return the cached validator.
 *
 * Ajv's built-in cache keys on the *reference* of the schema object. That
 * makes it useless in our setup: pages that consume the helpers typically
 * rebuild a fresh `MetadataFormField[]` on every React Query refetch / map,
 * which means a logically-identical schema is a brand new object on every
 * render and Ajv re-compiles it from scratch every time.
 *
 * We add a content-keyed cache on top: `JSON.stringify(schema)` is the
 * cache key. Compilations are O(ms); a stringify + map lookup is O(µs),
 * a fair trade for forms that re-render dozens of times per session.
 *
 * The cache is unbounded by design. A single org typically has a handful
 * of distinct schemas live at a time, and entries are pure value objects —
 * no DOM nodes, no subscriptions, nothing that grows over a session. If
 * memory ever becomes a concern, swap the Map for an LRU.
 */
const compileCache = new Map<string, ValidateFunction>();

export const compileSchema = (
  schema: Record<string, unknown>,
): ValidateFunction => {
  const key = JSON.stringify(schema);
  const cached = compileCache.get(key);
  if (cached) return cached;
  const compiled = ajv.compile(schema);
  compileCache.set(key, compiled);
  return compiled;
};

/**
 * Drop the compiled-schema cache. Intended for tests that want a fresh
 * Ajv state between cases; production code should never need this.
 */
export const __clearCompileCacheForTests = () => compileCache.clear();

const asString = (v: unknown): v is string => typeof v === 'string';

/**
 * Infer the UI type from a JSON Schema 2020-12 document.
 *
 * The mapping is intentionally narrow — only the 6 shapes called out in the
 * epic are recognized. Anything that explicitly declares a type
 * outside that set (e.g. `{type:"object"}`, `{type:"array", items:{type:
 * "object"}}`) is flagged as `'unsupported'` so the form renders a
 * read-only raw-JSON view instead of a plain text input that would
 * silently corrupt the structured value on save.
 *
 * The two true unknowns — a missing schema or an empty object — still fall
 * through to `'string'` as a forgiving default, since neither carries any
 * structural constraint.
 */
export const inferUiType = (
  schema: Record<string, unknown> | undefined | null,
): MetadataUiType => {
  // Missing or empty schema → no constraint, treat as free text.
  if (!schema) return 'string';
  if (Object.keys(schema).length === 0) return 'string';

  const type = schema.type;
  const enumValues = schema.enum;
  const format = schema.format;

  if (type === 'boolean') return 'boolean';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'string' && asString(format) && format === 'date') return 'date';

  if (type === 'string') {
    if (Array.isArray(enumValues) && enumValues.length > 0) return 'enum';
    return 'string';
  }

  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined;
    if (items && Array.isArray(items.enum) && items.enum.length > 0) {
      return 'enum_list';
    }
    // Array of something other than a string enum — we don't model it.
    return 'unsupported';
  }

  // `type:"object"`, an unknown type, or any other modelled shape — flag
  // it so the form renders read-only raw JSON.
  return 'unsupported';
};

/**
 * Compose a resource-level JSON Schema 2020-12 from a list of field
 * descriptors. Mirrors the backend's `validator.BuildResourceSchema` —
 * `additionalProperties` is `false` in strict mode (DZ) and `true` in
 * tolerant mode (Instance), and the optional `required` argument lists the
 * keys the form treats as mandatory.
 *
 * Using a composed schema for validation (instead of validating each field
 * in isolation) brings two benefits:
 *   - Unknown / extra keys are caught client-side in strict mode, matching
 *     the backend's `additionalProperties: false` so we don't ship a payload
 *     that the server will only reject at the API.
 *   - Ajv compiles the schema once per (fields, mode) tuple instead of once
 *     per field — measurable on forms with many declared fields.
 */
export type ComposedSchemaMode = 'strict' | 'tolerant';

export const composeMetadataSchema = (
  fields: Array<{ key: string; jsonSchema: Record<string, unknown> }>,
  mode: ComposedSchemaMode = 'strict',
  required: string[] = [],
): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  for (const field of fields) {
    properties[field.key] = field.jsonSchema;
  }
  const composed: Record<string, unknown> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    additionalProperties: mode !== 'strict',
  };
  if (required.length > 0) {
    composed.required = required;
  }
  return composed;
};

/**
 * Extract enum options from a string-enum or array-of-string-enum schema.
 * Returns an empty array if the schema doesn't carry an enum.
 */
export const extractEnumOptions = (
  schema: Record<string, unknown>,
): Array<{ label: string; value: string }> => {
  const enumFromSchema = Array.isArray(schema.enum) ? schema.enum : null;
  const items = schema.items as Record<string, unknown> | undefined;
  const enumFromItems = items && Array.isArray(items.enum) ? items.enum : null;
  const source = enumFromSchema ?? enumFromItems ?? [];
  return source
    .filter((value): value is string => typeof value === 'string')
    .map((value) => ({ label: value, value }));
};
