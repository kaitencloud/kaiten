import {
  createCollection,
  localStorageCollectionOptions,
  useLiveQuery,
} from '@tanstack/react-db';
import { z } from 'zod';
import type { AiUsage } from '@/api-client';
import { parseDecimal } from './pricing/decimal';
import {
  DEFAULT_REFERENCE_CALLS,
  validateReferenceCall,
} from './pricing/reference-calls';
import type { AiRequestType } from './pricing/types';

/**
 * What the AI screens keep in this browser, because the API has no place for
 * it yet: the value of a credit per pool, which gives the margin, and the
 * reference call of each request type. The rate card writes them; the rate card
 * and the receipt of a charge read them. Neither is saved to Kaiten, neither is
 * shared with a colleague, and the screens say so.
 *
 * The storage key and the shape of a record are a contract with the values
 * people already typed: a TanStack DB collection under `kaiten:ai-pricing`,
 * stored as `{ "s:<id>": { versionKey, data } }`, `<id>` being `pool:<slug>` or
 * `reference:<request type>`.
 */

export const PRICING_SETTINGS_STORAGE_KEY = 'kaiten:ai-pricing';

const count = z.number().int().nonnegative().optional();

const usageSchema = z.object({
  inputTokens: count,
  cacheReadInputTokens: count,
  cacheWriteInputTokens: count,
  outputTokens: count,
  durationMs: count,
  units: z.string().optional(),
  unitType: z.enum(['image', 'second', 'frame']).optional(),
});

const recordSchema = z.object({
  /** `pool:<slug>` or `reference:<request type>`. */
  id: z.string().min(1),
  creditValue: z.string().optional(),
  usage: usageSchema.optional(),
});

export type PricingSettingsRecord = z.infer<typeof recordSchema>;

type StorageApi = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function memoryStorage(): StorageApi {
  const items = new Map<string, string>();

  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, String(value));
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/** `localStorage` when the browser lets it be written, memory otherwise. */
function usableStorage(): StorageApi {
  try {
    const probe = `${PRICING_SETTINGS_STORAGE_KEY}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);

    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

function buildCollection() {
  return createCollection(
    localStorageCollectionOptions({
      id: 'ai-pricing-settings',
      storageKey: PRICING_SETTINGS_STORAGE_KEY,
      storage: usableStorage(),
      storageEventApi: window,
      schema: recordSchema,
      getKey: (record) => record.id,
      gcTime: Number.POSITIVE_INFINITY,
      startSync: true,
    }),
  );
}

let collection: ReturnType<typeof buildCollection> | undefined;

/** Created on first use, so that a module that only imports it reads no storage. */
export function pricingSettingsCollection() {
  collection ??= buildCollection();

  return collection;
}

export const poolSettingsId = (pool: string) => `pool:${pool}`;
export const referenceSettingsId = (type: AiRequestType) => `reference:${type}`;

function write(id: string, change: (record: PricingSettingsRecord) => void) {
  const settings = pricingSettingsCollection();
  try {
    if (settings.has(id)) {
      settings.update(id, change);

      return;
    }
    const record: PricingSettingsRecord = { id };
    change(record);
    settings.insert(record);
  } catch {
    // A storage that refuses the write (full, or blocked) keeps the previous
    // value: the setting is a convenience, never a reason to break the page.
  }
}

/** A value of a credit the margin can be computed with: a positive decimal. */
export function isUsableCreditValue(
  value: string | undefined,
): value is string {
  const parsed = parseDecimal(value);

  return parsed !== null && parsed.digits > 0n;
}

/** Keeps what was typed, usable or not, so that the field shows it again. */
export function setLocalCreditValue(pool: string, value: string) {
  const text = value.trim();
  write(poolSettingsId(pool), (record) => {
    record.creditValue = text === '' ? undefined : text;
  });
}

export function setLocalReferenceCall(
  type: AiRequestType,
  usage: AiUsage | undefined,
) {
  write(referenceSettingsId(type), (record) => {
    record.usage = usage;
  });
}

/** The stored reference call when the engine accepts it, the default otherwise. */
export function referenceCallOf(
  record: PricingSettingsRecord | undefined,
  type: AiRequestType,
): AiUsage {
  const usage = record?.usage;

  return usage && validateReferenceCall(usage).length === 0
    ? usage
    : DEFAULT_REFERENCE_CALLS[type];
}

/**
 * The value of one credit of a pool, in USD, as this browser keeps it, or null
 * when there is none the margin can be computed with. It follows what the rate
 * card writes, in this tab or another.
 */
export function useLocalCreditValue(pool: string): string | null {
  const { data } = useLiveQuery((query) =>
    query.from({ settings: pricingSettingsCollection() }),
  );
  const value = data?.find(
    (record) => record.id === poolSettingsId(pool),
  )?.creditValue;

  return isUsableCreditValue(value) ? value : null;
}
