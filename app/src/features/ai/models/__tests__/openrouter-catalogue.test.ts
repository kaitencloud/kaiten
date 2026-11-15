import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  assertOpenRouterIdentityAvailable,
  createOpenRouterImportDraft,
  fetchOpenRouterCatalogue,
  normalizeOpenRouterDecimal,
  OPENROUTER_CATALOGUE_URL,
  openRouterSlug,
  parseOpenRouterCatalogue,
} from '../openrouter-catalogue';
import type { Model } from '@/api-client';

function row(pricing: Record<string, unknown> = { prompt: '1e-7', completion: '0' }) {
  return { id: 'synthetic/model:free', canonical_slug: 'synthetic/model', name: 'Synthetic model', description: 'Synthetic description', architecture: { input_modalities: ['text'], output_modalities: ['text'], tokenizer: 'Other' }, pricing };
}
function envelope(data = [row()]) { return { data, total_count: data.length, links: { next: null } }; }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('exact decimal normalization', () => {
  it.each([
    ['0', '0'], ['1e-7', '0.0000001'], ['1E+2', '100'], ['000.001000', '0.001'],
    ['1.0000000000000', '1'], ['0e-128', '0'], ['999999.999999999999', '999999.999999999999'],
    ['1e-13', undefined], ['1e6', undefined], ['1e999', undefined], ['1e-999', undefined],
    ['-1', undefined], ['NaN', undefined], ['Infinity', undefined], [' 0', undefined],
    ['+0', undefined], ['0x10', undefined], [0, undefined], [null, undefined], [{ toString: () => '0' }, undefined],
    ['1'.repeat(129), undefined],
  ])('normalizes %s without floating-point rates', (input, expected) => {
    expect(normalizeOpenRouterDecimal(input)).toBe(expected);
  });
});

it('maps per-token USD without million-token scaling and preserves explicit free prices', () => {
  const [entry] = parseOpenRouterCatalogue(envelope([row({ prompt: '1e-7', completion: '0', input_cache_read: '2e-8', input_cache_write: '3e-7', request: '0.1' })]));
  expect(entry).toMatchObject({ id: 'synthetic/model:free', canonicalSlug: 'synthetic/model', modality: 'TEXT', pricingStatus: 'fixed', issues: [], mappedVendorCosts: { currency: 'USD', perInputToken: '0.0000001', perOutputToken: '0', perCachedInputToken: '0.00000002', perCacheWriteToken: '0.0000003', perRequest: '0.1' } });
  expect(entry.rawPrices.prompt).toBe('1e-7');
});
it('does not invent missing optional prices or perUnit', () => {
  expect(parseOpenRouterCatalogue(envelope())[0].mappedVendorCosts).toEqual({ currency: 'USD', perInputToken: '0.0000001', perOutputToken: '0' });
});
it.each([
  [{ prompt: '-1', completion: '-1' }, 'dynamicPricing'],
  [{ prompt: '0', completion: '0', overrides: [{ min_prompt_tokens: 10, prompt: '1' }] }, 'conditionalPricing'],
  [{ prompt: '0', completion: '0', overrides: [{ utc_start: 0, utc_end: 100, prompt: '1' }] }, 'conditionalPricing'],
  [{ prompt: '0', completion: '0', overrides: { malformed: true } }, 'conditionalPricing'],
  [{ prompt: '0', completion: '0', input_cache_write_1h: '0' }, 'unsupportedPrice'],
  [{ prompt: '0', completion: '0', image: '0.1' }, 'unsupportedPrice'],
  [{ prompt: '0', completion: '0', internal_reasoning: '0.1' }, 'unsupportedPrice'],
  [{ prompt: '0', completion: '0', unknown_extension: null }, 'unsupportedPrice'],
  [{ prompt: '0', completion: '0', unknown_extension: '1e-13' }, 'unsupportedPrice'],
  [{ prompt: 0, completion: '0' }, 'invalidPrice'],
  [{ completion: '0' }, 'missingPrice'],
  [{ prompt: '1e-13', completion: '0' }, 'invalidPrice'],
])('requires identity-only/manual review for %j', (pricing, issue) => {
  const [entry] = parseOpenRouterCatalogue(envelope([row(pricing)]));
  expect(entry.pricingStatus).toBe('reviewRequired');
  expect(entry.issues).toContain(issue);
  expect(entry.mappedVendorCosts).toEqual({ currency: 'USD' });
});
it('allows explicit zero unsupported charges but never maps them', () => {
  const [entry] = parseOpenRouterCatalogue(envelope([row({ prompt: '0', completion: '0', image: '0', internal_reasoning: '0', overrides: [] })]));
  expect(entry.pricingStatus).toBe('fixed');
  expect(entry.mappedVendorCosts).not.toHaveProperty('perUnit');
});
it('does not assume even a zero-price router has a fixed tariff', () => {
  const value = row(); value.architecture.tokenizer = 'Router';
  expect(parseOpenRouterCatalogue(envelope([value]))[0].issues).toContain('dynamicPricing');
});
it.each([
  [['text', 'image'], ['text'], 'MULTIMODAL'], [['text'], ['image'], 'IMAGE'],
  [['text'], ['embeddings'], 'EMBEDDING'], [['audio'], ['transcription'], 'AUDIO'],
  [['text'], ['video'], 'VIDEO'], [['text'], ['decisions'], null], [['text'], ['unknown'], null],
])('conservatively maps modalities %j -> %j', (input, output, expected) => {
  const value = row(); value.architecture.input_modalities = input; value.architecture.output_modalities = output;
  expect(parseOpenRouterCatalogue(envelope([value]))[0].modality).toBe(expected);
});
it.each([null, [], {}, { data: 'bad' }, envelope([{ ...row(), id: 42 } as never]), envelope([{ ...row(), name: null } as never]), envelope([{ ...row(), pricing: null } as never]), envelope([{ ...row(), canonical_slug: '' }]), envelope([{ ...row(), description: {} } as never])])('rejects untrusted envelope/identity %j', (input) => {
  expect(() => parseOpenRouterCatalogue(input)).toThrow('invalidCatalogue');
});
it('rejects pagination, missing completeness proof, truncation, oversized lists and duplicate source IDs', () => {
  expect(() => parseOpenRouterCatalogue({ ...envelope(), links: { next: '/other' } })).toThrow('incompleteCatalogue');
  expect(() => parseOpenRouterCatalogue({ ...envelope(), total_count: 2 })).toThrow('incompleteCatalogue');
  expect(() => parseOpenRouterCatalogue({ data: [row()] })).toThrow('incompleteCatalogue');
  expect(() => parseOpenRouterCatalogue(envelope(Array.from({ length: 5001 }, () => row())))).toThrow('catalogueTooLarge');
  expect(() => parseOpenRouterCatalogue(envelope([row(), row()]))).toThrow('duplicateSourceId');
});
it('creates an editable valid OpenRouter draft with exact provider alias and bounded name', () => {
  const value = row(); value.name = 'x'.repeat(120);
  const draft = createOpenRouterImportDraft(parseOpenRouterCatalogue(envelope([value]))[0]);
  expect(draft).toMatchObject({ vendor: 'OpenRouter', slug: 'synthetic-model-free', name: 'x'.repeat(100), externalIds: ['synthetic/model:free'], status: 'ACTIVE', modality: 'TEXT' });
  for (const id of ['?', 'a', 'A/B:free', 'x'.repeat(200)]) expect(openRouterSlug(id)).toMatch(/^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/);
  expect(() => assertOpenRouterIdentityAvailable(draft, [{ slug: 'other', externalIds: draft.externalIds } as Model])).toThrow('identityConflict');
  expect(() => assertOpenRouterIdentityAvailable(draft, [{ slug: draft.slug } as Model])).toThrow('identityConflict');
  expect(() => assertOpenRouterIdentityAvailable({ ...draft, slug: 'bad/slug' }, [])).toThrow('invalidIdentity');
  expect(() => assertOpenRouterIdentityAvailable(draft, [])).not.toThrow();
});
it('uses native public fetch with no credentials/referrer/auth, no cache, and validates the response', async () => {
  const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify(envelope()), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchOpenRouterCatalogue()).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith(OPENROUTER_CATALOGUE_URL, expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal) }));
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('headers');
});
it.each([
  new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }),
  new Response('html', { headers: { 'content-type': 'text/html' } }),
  new Response('{', { headers: { 'content-type': 'application/json' } }),
])('rejects HTTP/content/JSON failures', async (response) => {
  vi.stubGlobal('fetch', vi.fn(async () => response));
  await expect(fetchOpenRouterCatalogue()).rejects.toThrow('invalidCatalogue');
});
it('bounds both advertised and actual streamed body bytes', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(5 * 1024 * 1024 + 1) } })));
  await expect(fetchOpenRouterCatalogue()).rejects.toThrow('catalogueTooLarge');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(' '.repeat(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } })));
  await expect(fetchOpenRouterCatalogue()).rejects.toThrow('catalogueTooLarge');
});
it('aborts on caller cancellation and after 20 seconds', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    if (options.signal?.aborted) reject(new Error('aborted'));
    else options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  })));
  const caller = new AbortController(); caller.abort();
  await expect(fetchOpenRouterCatalogue(caller.signal)).rejects.toThrow('aborted');
  const promise = fetchOpenRouterCatalogue();
  const rejection = expect(promise).rejects.toThrow('aborted');
  await vi.advanceTimersByTimeAsync(20000);
  await rejection;
  expect(vi.getTimerCount()).toBe(0);
});
it('bounds Unicode display names for generated form validation without splitting surrogate pairs', () => {
  const value = row(); value.name = 'x' + '😀'.repeat(100);
  const draft = createOpenRouterImportDraft(parseOpenRouterCatalogue(envelope([value]))[0]);
  expect(draft.name.length).toBe(99);
  expect(draft.name.endsWith('😀')).toBe(true);
  expect(() => assertOpenRouterIdentityAvailable(draft, [])).not.toThrow();
});
