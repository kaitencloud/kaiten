import { beforeEach, expect, it, vi } from 'vite-plus/test';
import type { Model } from '@/api-client';
import { getModel, updateModel } from '@/api-client';
import { parseOpenRouterCatalogue } from '../openrouter-catalogue';
import {
  associateOpenRouterSource,
  buildOpenRouterSyncBody,
  OPENROUTER_SOURCE_NAMESPACE,
  readOpenRouterSource,
  syncOpenRouterPrices,
  type OpenRouterSyncInput,
} from '../openrouter-sync';

vi.mock('@/api-client', () => ({ getModel: vi.fn(), updateModel: vi.fn() }));
const checkedAt = '2026-10-23T12:00:00Z';
const entry = parseOpenRouterCatalogue({ data: [{ id: 'synthetic/model', name: 'Source name', canonical_slug: 'synthetic/model', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '2e-7', completion: '0' } }], total_count: 1, links: { next: null } })[0];
function model(): Model {
  return { id: 'model-id', slug: 'local-model', name: 'User name', description: 'User description', vendor: 'OpenRouter', status: 'DEPRECATED', modality: 'TEXT', externalIds: ['synthetic/model', 'other-alias'], metadata: associateOpenRouterSource({ user: { private: 'preserve' } }, entry.id, checkedAt), vendorCosts: { currency: 'USD', perInputToken: '0.0000001', perOutputToken: '0.5', perUnit: '1', perCachedInputToken: '0.01' }, createdAt: checkedAt, updatedAt: checkedAt };
}
function input(openedModel = model()): OpenRouterSyncInput {
  return { openedModel, sourceEntry: entry, selectedPriceKeys: ['perInputToken'], checkedAt };
}
beforeEach(() => vi.clearAllMocks());

it('reads only compatible own source metadata, guards collisions and preserves other metadata', () => {
  const metadata = { other: { nested: [1, 2] } };
  expect(readOpenRouterSource(metadata)).toBeUndefined();
  const linked = associateOpenRouterSource(metadata, entry.id, checkedAt);
  expect(linked.other).toBe(metadata.other);
  expect(metadata).not.toHaveProperty(OPENROUTER_SOURCE_NAMESPACE);
  expect(readOpenRouterSource(linked)).toEqual({ version: 1, sourceId: entry.id, checkedAt });
  expect(() => associateOpenRouterSource(linked, 'other/model', checkedAt)).toThrow('sourceMismatch');
});
it.each([
  null, 'user-owned', { version: 2, sourceId: entry.id, checkedAt },
  { version: 1, sourceId: entry.id, checkedAt, unknown: true },
  { version: 1, sourceId: entry.id, checkedAt: 'invalid' },
  { version: 1, sourceId: entry.id, checkedAt, appliedPrices: { perUnit: '1' } },
  { version: 1, sourceId: entry.id, checkedAt, appliedPrices: { perInputToken: '-1' } },
])('never overwrites incompatible occupied metadata %j', (source) => {
  const metadata = { [OPENROUTER_SOURCE_NAMESPACE]: source, user: 'keep' };
  expect(() => readOpenRouterSource(metadata)).toThrow('sourceNamespaceConflict');
  expect(() => associateOpenRouterSource(metadata, entry.id, checkedAt)).toThrow('sourceNamespaceConflict');
  expect(metadata[OPENROUTER_SOURCE_NAMESPACE]).toBe(source);
});
it('patches only selected prices on fresh full writable state, including concurrent unselected edits', () => {
  const opened = model();
  const fresh: Model = { ...opened, name: 'Concurrent user name', vendor: 'Concurrent vendor', description: 'Concurrent description', status: 'ARCHIVED', externalIds: ['new-alias'], metadata: { ...opened.metadata, concurrent: true }, vendorCosts: { ...opened.vendorCosts, currency: 'USD', perOutputToken: '7', perCacheWriteToken: '0.7', perUnit: '2' } };
  const body = buildOpenRouterSyncBody(input(opened), fresh)!;
  expect(body).toMatchObject({ name: fresh.name, vendor: fresh.vendor, description: fresh.description, status: 'ARCHIVED', modality: 'TEXT', slug: opened.slug, externalIds: ['new-alias'], metadata: { concurrent: true, user: { private: 'preserve' } }, vendorCosts: { currency: 'USD', perInputToken: '0.0000002', perOutputToken: '7', perCacheWriteToken: '0.7', perUnit: '2', perCachedInputToken: '0.01' } });
  expect(body).not.toHaveProperty('id');
  expect(body).not.toHaveProperty('updatedAt');
  expect(readOpenRouterSource(body.metadata)).toMatchObject({ appliedPrices: { perInputToken: '0.0000002' }, checkedAt, appliedAt: expect.any(String) });
  expect(opened.vendorCosts?.perInputToken).toBe('0.0000001');
  expect(fresh.vendorCosts?.perInputToken).toBe('0.0000001');
});
it('compares decimals canonically but detects selected local changes rather than clobbering', () => {
  const opened = model();
  expect(() => buildOpenRouterSyncBody(input(opened), { ...opened, vendorCosts: { currency: 'USD', perInputToken: '0.000000100000' } })).not.toThrow();
  expect(() => buildOpenRouterSyncBody(input(opened), { ...opened, vendorCosts: { currency: 'USD', perInputToken: '0.0000003' } })).toThrow('localChanged');
  expect(() => buildOpenRouterSyncBody(input(opened), { ...opened, vendorCosts: { currency: 'USD' } })).toThrow('localChanged');
});
it('rejects missing source prices, unsupported selection and conditional pricing without clearing anything', () => {
  const opened = model();
  expect(() => buildOpenRouterSyncBody({ ...input(opened), selectedPriceKeys: ['perCacheWriteToken'] }, opened)).toThrow('priceNotAvailable');
  expect(() => buildOpenRouterSyncBody({ ...input(opened), selectedPriceKeys: ['perUnit' as never] }, opened)).toThrow('priceNotAvailable');
  expect(() => buildOpenRouterSyncBody({ ...input(opened), sourceEntry: { ...entry, pricingStatus: 'reviewRequired' } }, opened)).toThrow('priceNotAvailable');
});
it('requires association or explicit consent, never silently associates on matching alias', () => {
  const unassociated = { ...model(), vendor: 'Direct lab', metadata: { user: true } };
  expect(() => buildOpenRouterSyncBody(input(unassociated), unassociated)).toThrow('sourceNotAssociated');
  const body = buildOpenRouterSyncBody({ ...input(unassociated), sourceLinkConsent: true }, unassociated)!;
  expect(body.vendor).toBe('Direct lab');
  expect(body.externalIds).toEqual(unassociated.externalIds);
  expect(readOpenRouterSource(body.metadata)?.sourceId).toBe(entry.id);
});
it('refuses mismatched, removed and incompatible source associations even with consent', () => {
  const opened = model();
  const mismatch = { ...opened, metadata: associateOpenRouterSource({}, 'other/model', checkedAt) };
  expect(() => buildOpenRouterSyncBody(input(opened), mismatch)).toThrow('sourceMismatch');
  expect(() => buildOpenRouterSyncBody({ ...input(opened), sourceLinkConsent: true }, { ...opened, metadata: {} })).toThrow('sourceMismatch');
  expect(() => buildOpenRouterSyncBody({ ...input(opened), sourceLinkConsent: true }, { ...opened, metadata: { [OPENROUTER_SOURCE_NAMESPACE]: 'user-owned' } })).toThrow('sourceNamespaceConflict');
});
it('returns null for no selections or already-equal prices, without timestamp-only writes', () => {
  const opened = model();
  expect(buildOpenRouterSyncBody({ ...input(opened), selectedPriceKeys: [] }, opened)).toBeNull();
  const equal = { ...opened, vendorCosts: { currency: 'USD' as const, perInputToken: '0.0000002' } };
  expect(buildOpenRouterSyncBody(input(equal), equal)).toBeNull();
});
it('refuses a model recreated under the same slug', () => {
  const opened = model();
  expect(() => buildOpenRouterSyncBody(input(opened), { ...opened, id: 'new-id' })).toThrow('modelRecreated');
});
it('freshly GETs then sends the selected-only merged body through the generated SDK', async () => {
  const fresh = model();
  vi.mocked(getModel).mockResolvedValue({ data: fresh } as never);
  vi.mocked(updateModel).mockResolvedValue({ data: fresh } as never);
  expect(await syncOpenRouterPrices(input(fresh))).toEqual({ model: fresh, updated: true });
  expect(getModel).toHaveBeenCalledWith({ cache: 'no-store', path: { modelSlug: fresh.slug }, throwOnError: true });
  expect(updateModel).toHaveBeenCalledWith(expect.objectContaining({ path: { modelSlug: fresh.slug }, throwOnError: true, body: expect.objectContaining({ vendorCosts: expect.objectContaining({ perInputToken: '0.0000002', perOutputToken: '0.5', perUnit: '1' }) }) }));
});
it.each(['404', '503'])('a fresh read failure %s never sends PUT', async (message) => {
  vi.mocked(getModel).mockRejectedValue(new Error(message));
  await expect(syncOpenRouterPrices(input())).rejects.toThrow(message);
  expect(updateModel).not.toHaveBeenCalled();
});
it('a selected-field concurrent conflict never sends PUT', async () => {
  const opened = model();
  vi.mocked(getModel).mockResolvedValue({ data: { ...opened, vendorCosts: { currency: 'USD', perInputToken: '9' } } } as never);
  await expect(syncOpenRouterPrices(input(opened))).rejects.toThrow('localChanged');
  expect(updateModel).not.toHaveBeenCalled();
});
it('no changes stays read-only and no price clear occurs', async () => {
  const fresh = model();
  vi.mocked(getModel).mockResolvedValue({ data: fresh } as never);
  expect(await syncOpenRouterPrices({ ...input(fresh), selectedPriceKeys: [] })).toEqual({ model: fresh, updated: false });
  expect(updateModel).not.toHaveBeenCalled();
});
it('can explicitly apply zero output cost while retaining historical applied-price provenance', () => {
  const opened = model();
  opened.metadata = { ...opened.metadata, [OPENROUTER_SOURCE_NAMESPACE]: { version: 1, sourceId: entry.id, checkedAt, appliedAt: checkedAt, appliedPrices: { perInputToken: '0.0000001' } } };
  const body = buildOpenRouterSyncBody({ ...input(opened), selectedPriceKeys: ['perOutputToken'] }, opened)!;
  expect(body.vendorCosts?.perOutputToken).toBe('0');
  expect(readOpenRouterSource(body.metadata)?.appliedPrices).toEqual({ perInputToken: '0.0000001', perOutputToken: '0' });
});
it('updates only explicitly selected name/description and preserves all unselected fresh fields', () => {
  const opened = model();
  const fresh = { ...opened, vendor: 'Fresh vendor', status: 'ARCHIVED' as const, externalIds: ['fresh-alias'], metadata: { ...opened.metadata, other: 'fresh' }, vendorCosts: { currency: 'USD' as const, perInputToken: '9', perUnit: '3' } };
  const sourceEntry = { ...entry, name: 'Source ' + '😀'.repeat(100), description: 'Source description' };
  const body = buildOpenRouterSyncBody({ ...input(opened), sourceEntry, selectedPriceKeys: [], selectedModelFields: ['name', 'description'] }, fresh)!;
  expect(body.name.length).toBeLessThanOrEqual(100);
  expect(body.name.endsWith('😀')).toBe(true);
  expect(body).toMatchObject({ description: 'Source description', vendor: fresh.vendor, status: fresh.status, slug: fresh.slug, modality: fresh.modality, externalIds: fresh.externalIds, vendorCosts: fresh.vendorCosts, metadata: { other: 'fresh', user: { private: 'preserve' } } });
  expect(readOpenRouterSource(body.metadata)).not.toHaveProperty('appliedPrices');
});
it.each(['name', 'description'] as const)('selected %s concurrent changes are refused', (field) => {
  const opened = model();
  const fresh = { ...opened, [field]: 'Concurrent edit' };
  expect(() => buildOpenRouterSyncBody({ ...input(opened), sourceEntry: { ...entry, description: 'Source description' }, selectedPriceKeys: [], selectedModelFields: [field] }, fresh)).toThrow('localChanged');
});
it('preserves concurrent unselected model details when applying a selected description', () => {
  const opened = model();
  const fresh = { ...opened, name: 'Concurrent name' };
  const body = buildOpenRouterSyncBody({ ...input(opened), sourceEntry: { ...entry, description: 'Source description' }, selectedPriceKeys: [], selectedModelFields: ['description'] }, fresh)!;
  expect(body.name).toBe('Concurrent name');
  expect(body.description).toBe('Source description');
});
it('permits review-required model-only sync, never applies prices or changes modality', () => {
  const opened = model();
  const sourceEntry = { ...entry, name: 'Updated source name', pricingStatus: 'reviewRequired' as const, modality: null, description: 'Updated source description' };
  const body = buildOpenRouterSyncBody({ ...input(opened), sourceEntry, selectedPriceKeys: [], selectedModelFields: ['name'] }, opened)!;
  expect(body.name).toBe('Updated source name');
  expect(body.description).toBe(opened.description);
  expect(body.vendorCosts).toEqual(opened.vendorCosts);
  expect(body.modality).toBe(opened.modality);
  expect(() => buildOpenRouterSyncBody({ ...input(opened), sourceEntry, selectedModelFields: ['name'] }, opened)).toThrow('priceNotAvailable');
  expect(() => buildOpenRouterSyncBody({ ...input(opened), selectedPriceKeys: [], selectedModelFields: ['modality' as never] }, opened)).toThrow('invalidIdentity');
});
it('model-only sync still requires source-link consent and protects an occupied namespace', () => {
  const unassociated = { ...model(), metadata: { user: true } };
  const selection = { ...input(unassociated), selectedPriceKeys: [], selectedModelFields: ['name'] as const };
  expect(() => buildOpenRouterSyncBody(selection, unassociated)).toThrow('sourceNotAssociated');
  expect(readOpenRouterSource(buildOpenRouterSyncBody({ ...selection, sourceLinkConsent: true }, unassociated)!.metadata)?.sourceId).toBe(entry.id);
  expect(() => buildOpenRouterSyncBody({ ...selection, sourceLinkConsent: true }, { ...unassociated, metadata: { [OPENROUTER_SOURCE_NAMESPACE]: 'user-owned' } })).toThrow('sourceNamespaceConflict');
});
it('preserves applied-price provenance during model-only changes', () => {
  const opened = model();
  opened.metadata = { ...opened.metadata, [OPENROUTER_SOURCE_NAMESPACE]: { version: 1, sourceId: entry.id, checkedAt, appliedPrices: { perInputToken: '0.0000001' } } };
  const body = buildOpenRouterSyncBody({ ...input(opened), selectedPriceKeys: [], selectedModelFields: ['name'] }, opened)!;
  expect(readOpenRouterSource(body.metadata)?.appliedPrices).toEqual({ perInputToken: '0.0000001' });
});
it('does not PUT equal model details', async () => {
  const opened = { ...model(), name: entry.name };
  vi.mocked(getModel).mockResolvedValue({ data: opened } as never);
  const selection = { ...input(opened), sourceEntry: { ...entry, description: opened.description }, selectedPriceKeys: [], selectedModelFields: ['name', 'description'] as const };
  expect(buildOpenRouterSyncBody(selection, opened)).toBeNull();
  expect(await syncOpenRouterPrices(selection)).toEqual({ model: opened, updated: false });
  expect(updateModel).not.toHaveBeenCalled();
});
it('a model-detail conflict prevents the generated PUT even with selected prices', async () => {
  const opened = model();
  vi.mocked(getModel).mockResolvedValue({ data: { ...opened, name: 'Concurrent name' } } as never);
  await expect(syncOpenRouterPrices({ ...input(opened), selectedModelFields: ['name'] })).rejects.toThrow('localChanged');
  expect(updateModel).not.toHaveBeenCalled();
});
it('rejects unavailable selected description without clearing local details or sending PUT', async () => {
  const opened = model();
  const selection = { ...input(opened), selectedPriceKeys: [], selectedModelFields: ['description'] as const };
  expect(() => buildOpenRouterSyncBody(selection, opened)).toThrow('modelFieldNotAvailable');
  expect(opened.description).toBe('User description');
  vi.mocked(getModel).mockResolvedValue({ data: opened } as never);
  await expect(syncOpenRouterPrices(selection)).rejects.toThrow('modelFieldNotAvailable');
  expect(updateModel).not.toHaveBeenCalled();
});
