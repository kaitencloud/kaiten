import { expect, it } from 'vite-plus/test';
import { HttpResponse } from 'msw/http';
import { handleListModels } from '@/api-client/msw.gen';
import { server } from '@/__tests__/msw-server';
import { modelsQueryOptions } from '@/domains/ai-credits';
import { modelFormSchema } from '../model-form.schema';

it('walks model cursors using the generated list identity', async () => {
  server.use(handleListModels(({ request }) => {
    const cursor = new URL(request.url).searchParams.get('cursor');
    return HttpResponse.json(cursor ? { items: [{ slug: 'second' }], hasMore: false } : { items: [{ slug: 'first' }], hasMore: true, nextCursor: 'next' });
  }));
  expect((await modelsQueryOptions.queryFn({ signal: new AbortController().signal })).items.map((item) => item.slug)).toEqual(['first', 'second']);
});
it('inherits generated model constraints and accepts optional disjoint cache costs', () => {
  const value = { name: 'Synthetic', slug: 'synthetic', vendor: 'Local fixture', modality: 'TEXT', status: 'ACTIVE', vendorCosts: { currency: 'USD', perCachedInputToken: '0', perCacheWriteToken: '0.000001' } };
  expect(modelFormSchema.safeParse(value).success).toBe(true);
  expect(modelFormSchema.safeParse({ ...value, slug: 'UPPERCASE' }).success).toBe(false);
  expect(modelFormSchema.safeParse({ ...value, vendorCosts: { currency: 'USD', perInputToken: '-1' } }).success).toBe(false);
});
