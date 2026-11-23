import { queryOptions } from '@tanstack/react-query';
import { resolveSource } from './feature-flag-source';
import { featureFlagsQueryKey } from './feature-flags';

/**
 * Every platform flag of the organization, as one OFREP bulk evaluation answers
 * them: for a page that lists flags by what their metadata says rather than by
 * a name the console knows. The gates read named flags through the provider
 * instead (`./feature-flags`); both ask the same source, as the same subject.
 */

/** The type of a flag's value, read off the answer that carries it. */
export type PlatformFlagType = 'boolean' | 'string' | 'number' | 'object';

/** One flag of the organization as the bulk evaluation answered it. */
export type PlatformFlagEvaluation = {
  key: string;
  /**
   * The type of `value`, as the answer carries it. Undefined when the answer
   * carries no value, as for a flag in error.
   */
  type: PlatformFlagType | undefined;
  value: unknown;
  variant: string | undefined;
  /**
   * The flag's metadata (`stage`, `betaVariant`, `title`, `description`), its
   * entries of a primitive type only, as the OpenFeature provider keeps them.
   */
  metadata: Readonly<Record<string, string | number | boolean>>;
  /** Set when the service could not evaluate the flag: its OpenFeature error. */
  error: { code: string; details: string | undefined } | undefined;
};

/** OFREP's bulk evaluation, under the source's base URL (which ends in `/api`). */
const BULK_EVALUATION_PATH = '/ofrep/v1/evaluate/flags';

/** The OpenFeature provider's own default timeout for an OFREP request. */
const BULK_EVALUATION_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueType(value: unknown): PlatformFlagType | undefined {
  switch (typeof value) {
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'object':
      return value === null ? undefined : 'object';
    default:
      return undefined;
  }
}

/** The metadata's primitive entries: what the provider hands an app too. */
function primitiveMetadata(
  metadata: unknown,
): Record<string, string | number | boolean> {
  if (!isRecord(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === 'string' ||
        typeof entry[1] === 'number' ||
        typeof entry[1] === 'boolean',
    ),
  );
}

/**
 * One entry of the bulk answer. OFREP gives each flag one of two shapes: a
 * success (`key`, `value`, `variant`, `reason`, `metadata`) or a failure
 * (`key`, `errorCode`, `errorDetails`, `metadata`), told apart by `errorCode`,
 * as the provider does. An entry with no key names no flag and is dropped.
 */
function toEvaluation(entry: unknown): PlatformFlagEvaluation[] {
  if (!isRecord(entry) || typeof entry.key !== 'string') {
    return [];
  }

  const metadata = primitiveMetadata(entry.metadata);
  if (typeof entry.errorCode === 'string') {
    return [
      {
        key: entry.key,
        type: undefined,
        value: undefined,
        variant: undefined,
        metadata,
        error: {
          code: entry.errorCode,
          details:
            typeof entry.errorDetails === 'string'
              ? entry.errorDetails
              : undefined,
        },
      },
    ];
  }

  return [
    {
      key: entry.key,
      type: valueType(entry.value),
      value: entry.value,
      variant: typeof entry.variant === 'string' ? entry.variant : undefined,
      metadata,
      error: undefined,
    },
  ];
}

/**
 * Every flag the platform source holds for this organization, as one OFREP bulk
 * evaluation answers it: `POST {baseUrl}/ofrep/v1/evaluate/flags` with the
 * base URL, headers and context the gates' provider uses, so both name the same
 * subject. Not through the provider: it answers a flag only when asked for it by
 * name, and a page that lists flags must see those the console has never named.
 *
 * In the server's order, which nothing guarantees: a caller that shows the list
 * orders it itself.
 *
 * Unlike a gate, a failed read throws: a page listing the flags says it could
 * not read them, rather than drawing an empty list as if there were none.
 * Anything but a 200 whose body carries `flags` is a failed read, the 401, 403
 * and 429 the provider also refuses included, and so is a 304: this request
 * sends no `If-None-Match`, so it has no earlier answer a 304 could stand for.
 * With no source at all there is nothing to list, and the answer is empty.
 */
export async function readAllPlatformFlags(
  signal?: AbortSignal,
): Promise<PlatformFlagEvaluation[]> {
  const source = await resolveSource();
  if (!source) {
    return [];
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, BULK_EVALUATION_TIMEOUT_MS);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${source.baseUrl}${BULK_EVALUATION_PATH}`, {
      method: 'POST',
      headers: new Headers([
        ['Content-Type', 'application/json; charset=utf-8'],
        ...(await source.headers()),
      ]),
      body: JSON.stringify({ context: source.context }),
      signal: controller.signal,
    });
    if (response.status !== 200) {
      throw new Error(
        `The bulk flag evaluation failed with status ${response.status}`,
      );
    }

    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.flags)) {
      throw new Error('The bulk flag evaluation answered no flags');
    }

    return body.flags.flatMap(toEvaluation);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

/**
 * `readAllPlatformFlags` as query options, under the gates' key family, so that
 * `refreshPlatformFlags` reads it again with them.
 */
export const platformFlagEvaluationsQueryOptions = queryOptions({
  queryKey: [...featureFlagsQueryKey, 'evaluations'],
  queryFn: ({ signal }) => readAllPlatformFlags(signal),
  retry: false,
});
