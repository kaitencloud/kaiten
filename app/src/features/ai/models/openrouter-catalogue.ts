import type { Model, ModelWritable, VendorCosts } from '@/api-client';

export const OPENROUTER_CATALOGUE_URL =
  'https://openrouter.ai/api/v1/models?output_modalities=all';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
export const OPENROUTER_PRICE_MAP = {
  prompt: 'perInputToken',
  completion: 'perOutputToken',
  input_cache_read: 'perCachedInputToken',
  input_cache_write: 'perCacheWriteToken',
  request: 'perRequest',
} as const;
export type OpenRouterPriceKey =
  (typeof OPENROUTER_PRICE_MAP)[keyof typeof OPENROUTER_PRICE_MAP];
export type OpenRouterIssue =
  | 'missingPrice'
  | 'invalidPrice'
  | 'dynamicPricing'
  | 'conditionalPricing'
  | 'unsupportedPrice'
  | 'unsupportedModality';
export type OpenRouterEntry = {
  id: string;
  name: string;
  description?: string;
  canonicalSlug: string;
  modality: ModelWritable['modality'] | null;
  mappedVendorCosts: VendorCosts;
  rawPrices: Record<string, unknown>;
  pricingStatus: 'fixed' | 'reviewRequired';
  issues: OpenRouterIssue[];
};
export type OpenRouterErrorCode =
  | 'invalidCatalogue'
  | 'catalogueTooLarge'
  | 'incompleteCatalogue'
  | 'duplicateSourceId'
  | 'invalidIdentity'
  | 'identityConflict'
  | 'sourceNamespaceConflict'
  | 'sourceMismatch'
  | 'sourceNotAssociated'
  | 'localChanged'
  | 'modelRecreated'
  | 'priceNotAvailable'
  | 'modelFieldNotAvailable';
export class OpenRouterError extends Error {
  constructor(public readonly code: OpenRouterErrorCode) {
    super(code);
    this.name = 'OpenRouterError';
  }
}
export function isOpenRouterObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Exact string-only decimal expansion. Reject rather than round unrepresentable rates. */
export function normalizeOpenRouterDecimal(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 128) return undefined;
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(value);
  if (!match) return undefined;
  const exponent = Number(match[3] ?? '0');
  if (Math.abs(exponent) > 128) return undefined;
  const fraction = match[2] ?? '';
  const digits = match[1] + fraction;
  const point = match[1].length + exponent;
  const expanded =
    point <= 0
      ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + '0'.repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [whole, decimal = ''] = expanded.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  const normalizedDecimal = decimal.replace(/0+$/, '');
  const result = normalizedDecimal
    ? `${normalizedWhole}.${normalizedDecimal}`
    : normalizedWhole;
  return /^\d{1,6}(?:\.\d{1,12})?$/.test(result) ? result : undefined;
}

function text(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Array.from(value).length <= max &&
    !value.includes('\0')
  );
}
function modality(architecture: unknown): ModelWritable['modality'] | null {
  if (!isOpenRouterObject(architecture)) return null;
  const input = architecture.input_modalities;
  const output = architecture.output_modalities;
  if (
    !Array.isArray(input) ||
    !Array.isArray(output) ||
    !input.length ||
    !output.length ||
    !input.every((item) =>
      ['text', 'image', 'audio', 'video', 'file'].includes(item),
    )
  )
    return null;
  if (output.length > 1) {
    return output.every((item) =>
      ['text', 'image', 'audio', 'video'].includes(item),
    )
      ? 'MULTIMODAL'
      : null;
  }
  switch (output[0]) {
    case 'text':
      return input.every((item) => item === 'text') ? 'TEXT' : 'MULTIMODAL';
    case 'image':
      return 'IMAGE';
    case 'audio':
    case 'speech':
    case 'transcription':
      return 'AUDIO';
    case 'video':
      return 'VIDEO';
    case 'embeddings':
      return 'EMBEDDING';
    default:
      return null;
  }
}
function parseEntry(value: unknown): OpenRouterEntry {
  if (
    !isOpenRouterObject(value) ||
    !text(value.id, 255) ||
    !text(value.name, 1024) ||
    !text(value.canonical_slug, 255) ||
    (value.description !== undefined &&
      (typeof value.description !== 'string' ||
        value.description.length > 100000)) ||
    !isOpenRouterObject(value.pricing)
  )
    throw new OpenRouterError('invalidCatalogue');
  const rawPrices = { ...value.pricing };
  const issues = new Set<OpenRouterIssue>();
  const costs: VendorCosts = { currency: 'USD' };
  for (const [source, target] of Object.entries(OPENROUTER_PRICE_MAP)) {
    const rate = rawPrices[source];
    if (rate === undefined) {
      if (source === 'prompt' || source === 'completion')
        issues.add('missingPrice');
      continue;
    }
    const normalized = normalizeOpenRouterDecimal(rate);
    if (normalized === undefined) issues.add('invalidPrice');
    else costs[target] = normalized;
  }
  if (
    isOpenRouterObject(value.architecture) &&
    value.architecture.tokenizer === 'Router'
  )
    issues.add('dynamicPricing');
  for (const [key, rate] of Object.entries(rawPrices)) {
    if (typeof rate === 'string' && rate.startsWith('-'))
      issues.add('dynamicPricing');
    if (key === 'overrides') {
      if (!Array.isArray(rate) || rate.length > 0)
        issues.add('conditionalPricing');
    } else if (!Object.hasOwn(OPENROUTER_PRICE_MAP, key)) {
      // Unknown/malformed extensions are not free. Only explicit zero charges
      // are harmless; an additional cache TTL still needs manual review.
      if (
        key === 'input_cache_write_1h' ||
        normalizeOpenRouterDecimal(rate) !== '0'
      )
        issues.add('unsupportedPrice');
    }
  }
  const mappedModality = modality(value.architecture);
  if (!mappedModality) issues.add('unsupportedModality');
  const pricingStatus = issues.size ? 'reviewRequired' : 'fixed';
  return {
    id: value.id,
    name: value.name,
    description: value.description as string | undefined,
    canonicalSlug: value.canonical_slug,
    modality: mappedModality,
    mappedVendorCosts: pricingStatus === 'fixed' ? costs : { currency: 'USD' },
    rawPrices,
    pricingStatus,
    issues: [...issues],
  };
}

export function parseOpenRouterCatalogue(value: unknown): OpenRouterEntry[] {
  if (!isOpenRouterObject(value) || !Array.isArray(value.data))
    throw new OpenRouterError('invalidCatalogue');
  if (value.data.length > MAX_ROWS)
    throw new OpenRouterError('catalogueTooLarge');
  if (
    !Number.isSafeInteger(value.total_count) ||
    value.total_count !== value.data.length ||
    !isOpenRouterObject(value.links) ||
    value.links.next !== null
  )
    throw new OpenRouterError('incompleteCatalogue');
  const entries = value.data.map(parseEntry);
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    throw new OpenRouterError('duplicateSourceId');
  return entries;
}

/** Public, bounded, user-initiated fetch; never use the authenticated API client. */
export async function fetchOpenRouterCatalogue(
  signal?: AbortSignal,
): Promise<OpenRouterEntry[]> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(OPENROUTER_CATALOGUE_URL, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (
      !response.ok ||
      !response.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith('application/json') ||
      !response.body
    )
      throw new OpenRouterError('invalidCatalogue');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body.cancel();
      throw new OpenRouterError('catalogueTooLarge');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let body = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new OpenRouterError('catalogueTooLarge');
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        throw new OpenRouterError('invalidCatalogue');
      }
      return parseOpenRouterCatalogue(payload);
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** A proposal only: the UI must let the user edit and validate before creation. */
export function openRouterSlug(sourceId: string): string {
  const slug = sourceId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '');
  return slug.length >= 2 ? slug : `model-${slug || 'openrouter'}`;
}
export function assertOpenRouterIdentityAvailable(
  draft: ModelWritable,
  models: readonly Model[],
): void {
  const identifiers = [draft.slug, ...(draft.externalIds ?? [])];
  if (
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(draft.slug) ||
    draft.slug.length < 2 ||
    draft.slug.length > 100 ||
    !text(draft.name, 100) ||
    draft.name.length > 100 ||
    !text(draft.vendor, 100) ||
    draft.vendor.length > 100 ||
    !(draft.externalIds ?? []).every((id) => text(id, 255)) ||
    new Set(draft.externalIds ?? []).size !== (draft.externalIds ?? []).length
  )
    throw new OpenRouterError('invalidIdentity');
  if (
    models.some((model) =>
      [model.slug, ...(model.externalIds ?? [])].some((id) =>
        identifiers.includes(id),
      ),
    )
  )
    throw new OpenRouterError('identityConflict');
}
export function openRouterDisplayName(name: string): string {
  // Generated form validation counts UTF-16 units; don't split a surrogate pair.
  return name.slice(0, 100).replace(/[\uD800-\uDBFF]$/, '');
}
export function createOpenRouterImportDraft(
  entry: OpenRouterEntry,
): ModelWritable {
  if (!entry.modality) throw new OpenRouterError('invalidIdentity');
  return {
    name: openRouterDisplayName(entry.name),
    slug: openRouterSlug(entry.id),
    vendor: 'OpenRouter',
    description: entry.description,
    modality: entry.modality,
    status: 'ACTIVE',
    externalIds: [entry.id],
    metadata: {},
    vendorCosts: { ...entry.mappedVendorCosts },
  };
}
