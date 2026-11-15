import { expect, it } from 'vite-plus/test';
import { HttpResponse } from 'msw/http';
import { server } from '@/__tests__/msw-server';
import { handleCreateConversionRule, handleListConversionRules } from '@/api-client/msw.gen';
import type { ConversionRule } from '@/api-client';
import { copyConversionRules } from '../copy-conversion-rules';

it('copies each active rule with nullable identity, continues after failures, and reports every item', async () => {
  const rules = ['a', 'b', 'c'].map((id) => ({ id, entitlementSlug: 'credits', modelSlug: null, requestType: null, rates: { perRequest: '0.25' }, minimumCreditsPerRequest: '0', maximumCreditsPerRequest: null, chargeOnError: 'NEVER' } as ConversionRule));
  const calls: unknown[] = [];
  server.use(handleListConversionRules(({ request }) => {
    expect(new URL(request.url).searchParams.get('status')).toBe('ACTIVE');
    return HttpResponse.json(rules);
  }), handleCreateConversionRule(async ({ params, request }) => {
    expect(params.licenseSlug).toBe('next-version');
    calls.push(await request.json());
    return calls.length === 2 ? HttpResponse.json({ title: 'Conflict', status: 409 }, { status: 409 }) : HttpResponse.json(rules[0], { status: 201 });
  }));
  const results = await copyConversionRules('base-version', 'next-version');
  expect(calls).toHaveLength(3);
  expect(calls[0]).toEqual({ entitlementSlug: 'credits', modelSlug: null, requestType: null, rates: { perRequest: '0.25' }, minimumCreditsPerRequest: '0', maximumCreditsPerRequest: null, chargeOnError: 'NEVER' });
  expect(results.map(({ error }) => Boolean(error))).toEqual([false, true, false]);
});
