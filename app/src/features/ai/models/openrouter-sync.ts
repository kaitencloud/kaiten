import type { Model, ModelWritable } from '@/api-client';
import { getModel, updateModel } from '@/api-client';
import { FRESH_READ_OPTIONS, isSameField } from '@/lib/api/fresh-write';
import {
  isOpenRouterObject,
  normalizeOpenRouterDecimal,
  openRouterDisplayName,
  OPENROUTER_PRICE_MAP,
  OpenRouterError,
  type OpenRouterEntry,
  type OpenRouterPriceKey,
} from './openrouter-catalogue';

export const OPENROUTER_SOURCE_NAMESPACE = 'kaitenOpenRouterImport';
const PRICE_KEYS: readonly OpenRouterPriceKey[] =
  Object.values(OPENROUTER_PRICE_MAP);
export type OpenRouterSource = {
  version: 1;
  sourceId: string;
  checkedAt: string;
  appliedAt?: string;
  appliedPrices?: Partial<Record<OpenRouterPriceKey, string>>;
};
function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
function validateSource(value: unknown): OpenRouterSource {
  if (
    !isOpenRouterObject(value) ||
    value.version !== 1 ||
    typeof value.sourceId !== 'string' ||
    !value.sourceId.trim() ||
    Array.from(value.sourceId).length > 255 ||
    value.sourceId.includes('\0') ||
    !timestamp(value.checkedAt) ||
    (value.appliedAt !== undefined && !timestamp(value.appliedAt)) ||
    Object.keys(value).some(
      (key) =>
        ![
          'version',
          'sourceId',
          'checkedAt',
          'appliedAt',
          'appliedPrices',
        ].includes(key),
    )
  )
    throw new OpenRouterError('sourceNamespaceConflict');
  if (value.appliedPrices !== undefined) {
    if (
      !isOpenRouterObject(value.appliedPrices) ||
      Object.entries(value.appliedPrices).some(
        ([key, rate]) =>
          !PRICE_KEYS.includes(key as OpenRouterPriceKey) ||
          normalizeOpenRouterDecimal(rate) === undefined,
      )
    )
      throw new OpenRouterError('sourceNamespaceConflict');
  }
  return value as OpenRouterSource;
}

/** Undefined means unassociated; any occupied incompatible namespace is refused. */
export function readOpenRouterSource(
  metadata: Model['metadata'],
): OpenRouterSource | undefined {
  if (!metadata || !Object.hasOwn(metadata, OPENROUTER_SOURCE_NAMESPACE))
    return undefined;
  return validateSource(metadata[OPENROUTER_SOURCE_NAMESPACE]);
}

/** Calling this is explicit source-link consent. Returns metadata; performs no write. */
export function associateOpenRouterSource(
  metadata: Model['metadata'],
  sourceId: string,
  checkedAt: string,
): NonNullable<Model['metadata']> {
  const previous = readOpenRouterSource(metadata);
  if (previous && previous.sourceId !== sourceId)
    throw new OpenRouterError('sourceMismatch');
  const source = validateSource({
    ...previous,
    version: 1,
    sourceId,
    checkedAt,
  });
  return { ...metadata, [OPENROUTER_SOURCE_NAMESPACE]: source };
}
export function modelToOpenRouterWritable(model: Model): ModelWritable {
  return {
    name: model.name,
    slug: model.slug,
    vendor: model.vendor,
    description: model.description,
    modality: model.modality,
    status: model.status,
    externalIds: model.externalIds ? [...model.externalIds] : [],
    vendorCosts: { currency: 'USD', ...model.vendorCosts },
    metadata: { ...model.metadata },
  };
}
export type OpenRouterSyncInput = {
  openedModel: Model;
  sourceEntry: OpenRouterEntry;
  selectedPriceKeys: readonly OpenRouterPriceKey[];
  /** No model details change unless the user explicitly selects them. */
  selectedModelFields?: readonly ('name' | 'description')[];
  checkedAt: string;
  /** Only true after the UI explicitly obtains consent, never from alias matching. */
  sourceLinkConsent?: boolean;
};
function samePrice(left: unknown, right: unknown): boolean {
  if (left == null || right == null) return left == null && right == null;
  const normalized = normalizeOpenRouterDecimal(left);
  return (
    normalized !== undefined && normalized === normalizeOpenRouterDecimal(right)
  );
}
function assertBinding(model: Model, sourceId: string, consent: boolean): void {
  const source = readOpenRouterSource(model.metadata);
  if (source && source.sourceId !== sourceId)
    throw new OpenRouterError('sourceMismatch');
  if (!source && !consent) throw new OpenRouterError('sourceNotAssociated');
}

/**
 * Full PUT body built from fresh state with explicit detail and nested price patches.
 * Null means no selected changes: checking must not cause a PUT.
 * This detects preview conflicts, not the remaining GET-to-PUT race (no API CAS).
 */
export function buildOpenRouterSyncBody(
  input: OpenRouterSyncInput,
  fresh: Model,
): ModelWritable | null {
  const { openedModel, sourceEntry, selectedPriceKeys, checkedAt } = input;
  if (fresh.id !== openedModel.id || fresh.slug !== openedModel.slug)
    throw new OpenRouterError('modelRecreated');
  assertBinding(openedModel, sourceEntry.id, input.sourceLinkConsent === true);
  assertBinding(fresh, sourceEntry.id, input.sourceLinkConsent === true);
  // A source association removed since preview requires a new preview/consent.
  if (
    readOpenRouterSource(openedModel.metadata) &&
    !readOpenRouterSource(fresh.metadata)
  )
    throw new OpenRouterError('sourceMismatch');
  const selectedModelFields = input.selectedModelFields ?? [];
  if (selectedPriceKeys.length === 0 && selectedModelFields.length === 0)
    return null;
  if (selectedPriceKeys.length > 0 && sourceEntry.pricingStatus !== 'fixed')
    throw new OpenRouterError('priceNotAvailable');
  const modelPatch: Partial<Pick<ModelWritable, 'name' | 'description'>> = {};
  for (const key of new Set(selectedModelFields)) {
    if (key !== 'name' && key !== 'description')
      throw new OpenRouterError('invalidIdentity');
    const proposed =
      key === 'name'
        ? openRouterDisplayName(sourceEntry.name)
        : sourceEntry.description;
    // An absent source description is unknown, not an instruction to clear it.
    if (proposed === undefined)
      throw new OpenRouterError('modelFieldNotAvailable');
    if (key === 'name' && !proposed.trim())
      throw new OpenRouterError('invalidIdentity');
    if (!isSameField(openedModel[key], fresh[key]))
      throw new OpenRouterError('localChanged');
    if (!isSameField(proposed, fresh[key])) modelPatch[key] = proposed;
  }
  const patch: Partial<Record<OpenRouterPriceKey, string>> = {};
  for (const key of new Set(selectedPriceKeys)) {
    const proposed = sourceEntry.mappedVendorCosts[key];
    if (
      !PRICE_KEYS.includes(key) ||
      normalizeOpenRouterDecimal(proposed) === undefined
    )
      throw new OpenRouterError('priceNotAvailable');
    if (!samePrice(openedModel.vendorCosts?.[key], fresh.vendorCosts?.[key]))
      throw new OpenRouterError('localChanged');
    if (!samePrice(proposed, fresh.vendorCosts?.[key]))
      patch[key] = normalizeOpenRouterDecimal(proposed)!;
  }
  const pricesChanged = Object.keys(patch).length > 0;
  if (!pricesChanged && Object.keys(modelPatch).length === 0) return null;
  const body = { ...modelToOpenRouterWritable(fresh), ...modelPatch };
  if (pricesChanged)
    body.vendorCosts = { ...body.vendorCosts, currency: 'USD', ...patch };
  body.metadata = associateOpenRouterSource(
    fresh.metadata,
    sourceEntry.id,
    checkedAt,
  );
  const source = readOpenRouterSource(body.metadata)!;
  body.metadata[OPENROUTER_SOURCE_NAMESPACE] = {
    ...source,
    appliedAt: new Date().toISOString(),
    ...(pricesChanged
      ? { appliedPrices: { ...source.appliedPrices, ...patch } }
      : {}),
  } satisfies OpenRouterSource;
  return body;
}
export type OpenRouterSyncResult = { model: Model; updated: boolean };

/** Explicit selected-detail/price action only; authorization remains with the API. */
export async function syncOpenRouterPrices(
  input: OpenRouterSyncInput,
): Promise<OpenRouterSyncResult> {
  const { data: fresh } = await getModel({
    ...FRESH_READ_OPTIONS,
    path: { modelSlug: input.openedModel.slug },
    throwOnError: true,
  });
  const body = buildOpenRouterSyncBody(input, fresh);
  if (!body) return { model: fresh, updated: false };
  const { data: updated } = await updateModel({
    path: { modelSlug: fresh.slug },
    body,
    throwOnError: true,
  });
  return { model: updated, updated: true };
}
