import { beforeEach, expect, it } from 'vite-plus/test';
import { HttpResponse } from 'msw/http';
import type { Model } from '@/api-client';
import { handleGetModel } from '@/api-client/msw.gen';
import { server } from '@/__tests__/msw-server';
import { freshModelFormBody } from '../model-form-write';
import { modelToOpenRouterWritable } from '../openrouter-sync';
import { perMillionDisplay } from '../openrouter-ui';

const openedModel = { id: 'fixed-id', createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', name: 'Local model', slug: 'local-model', modality: 'TEXT', vendor: 'Original', status: 'ACTIVE', externalIds: ['original'], metadata: { local: true }, vendorCosts: { currency: 'USD', perInputToken: '0.000000000001', perOutputToken: '0.000001', perRequest: '0' } } as Model;
let fresh: Model;
beforeEach(() => { fresh = structuredClone(openedModel); server.use(handleGetModel(() => HttpResponse.json(fresh))); });
it('merges each edited cost into fresh costs while preserving concurrent model fields/metadata', async () => {
  fresh = { ...fresh, name: 'Concurrent name', status: 'DEPRECATED', externalIds: ['new-alias'], metadata: { local: true, concurrent: 'keep' }, vendorCosts: { currency: 'USD', perInputToken: '0.000000000001', perOutputToken: '0.987654321012', perRequest: '0', perUnit: '8' } };
  const opened = modelToOpenRouterWritable(openedModel);
  const body = await freshModelFormBody(openedModel, { ...opened, vendorCosts: { ...opened.vendorCosts!, perInputToken: '0.000000000123' } }, opened);
  expect(body).toMatchObject({ name: fresh.name, status: fresh.status, externalIds: ['new-alias'], metadata: fresh.metadata, vendorCosts: { perInputToken: '0.000000000123', perOutputToken: '0.987654321012', perRequest: '0', perUnit: '8' } });
});
it('clears only the explicitly edited dimension and never conflates zero with missing', async () => {
  const opened = modelToOpenRouterWritable(openedModel);
  const body = await freshModelFormBody(openedModel, { ...opened, vendorCosts: { ...opened.vendorCosts!, perInputToken: undefined } }, opened);
  expect(body.vendorCosts).not.toHaveProperty('perInputToken'); expect(body.vendorCosts?.perRequest).toBe('0');
});
it.each(['replace', 'clear'])('rejects a concurrent edit to the same price before %s', async (action) => {
  const opened = modelToOpenRouterWritable(openedModel);
  fresh.vendorCosts = { ...fresh.vendorCosts!, perInputToken: '0.5' };
  const edited = { ...opened, vendorCosts: { ...opened.vendorCosts!, perInputToken: action === 'clear' ? undefined : '0.25' } };
  await expect(freshModelFormBody(openedModel, edited, opened)).rejects.toMatchObject({ code: 'localChanged' });
});
it('rejects a concurrent edit to an explicitly edited model field', async () => {
  const opened = modelToOpenRouterWritable(openedModel);
  fresh.name = 'Concurrent name';
  await expect(freshModelFormBody(openedModel, { ...opened, name: 'Edited name' }, opened)).rejects.toMatchObject({ code: 'localChanged' });
});
it('rejects a deleted/recreated model identity before the write body is returned', async () => {
  fresh = { ...fresh, id: 'replacement' }; const opened = modelToOpenRouterWritable(openedModel);
  await expect(freshModelFormBody(openedModel, { ...opened, name: 'Edited' }, opened)).rejects.toMatchObject({ code: 'modelRecreated' });
});
it.each([['0', '0'], ['0.000001', '1'], ['0.000000000123', '0.000123'], ['0.012345678901', '12345.678901'], [undefined, '—']])('formats %s per million exactly for display only', (input, expected) => { expect(perMillionDisplay(input)).toBe(expected); });
