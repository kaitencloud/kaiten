import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Entitlement, EntitlementException, EntitlementUsage } from '@/api-client';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { server } from './msw-server';

const API = 'http://api.test/api';
const path = '/instances/acme-production/entitlement-exceptions';
const send = (method: string, url: string, body?: unknown) => fetch(`${API}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime('2026-10-26T12:00:00Z');
  server.use(...createMockHandlers(createDevMockConfig(), 'off', undefined, true), undeclaredApiRequest);
});
afterEach(() => vi.useRealTimers());

describe('exception MSW contract, independent of billing', () => {
  it('creates, lists all, applies a BOOLEAN and ends it idempotently without disclosing its reason in provenance', async () => {
    const catalogue = await (await send('GET', '/entitlements')).json() as { items: Entitlement[] };
    const entitlement = catalogue.items.find((item) => item.type === 'BOOLEAN')!;
    const created = await send('POST', path, { entitlementSlug: entitlement.slug, kind: 'SET', value: true, endsAt: '2026-11-01T12:00:00Z', reason: 'Private pilot reason' });
    expect(created.status).toBe(201);
    const row = await created.json() as EntitlementException;
    expect(row.status).toBe('ACTIVE');
    expect((await (await send('GET', `${path}?filter=all`)).json()).length).toBe(1);
    const usage = (await (await send('GET', '/instances/acme-production/entitlements/usage')).json() as EntitlementUsage[]).find((item) => item.entitlementSlug === entitlement.slug)!;
    expect(usage.limit).toEqual({ type: 'boolean', value: true });
    expect(usage.provenance?.exception?.instanceEntitlementExceptionId).toBe(row.id);
    expect(JSON.stringify(usage.provenance)).not.toContain('Private pilot reason');
    const overlap = await send('POST', path, { entitlementSlug: entitlement.slug, kind: 'SET', value: false, reason: 'Another pilot' });
    expect(overlap.status).toBe(409);
    expect((await overlap.json()).errors[0].value.exceptionId).toBe(row.id);
    expect((await send('DELETE', `${path}/${row.id}`)).status).toBe(204);
    expect((await send('DELETE', `${path}/${row.id}`)).status).toBe(204);
    expect((await (await send('GET', `${path}?filter=all`)).json())[0].status).toBe('REVOKED');
    expect(await (await send('GET', path)).json()).toEqual([]);
  });
  it('schedules, expires at the exclusive end and rejects incompatible types or windows', async () => {
    const catalogue = await (await send('GET', '/entitlements')).json() as { items: Entitlement[] };
    const entitlement = catalogue.items.find((item) => item.type === 'BOOLEAN')!;
    const body = { entitlementSlug: entitlement.slug, kind: 'SET', value: false, reason: 'Scheduled pilot', startsAt: '2026-10-27T12:00:00Z', endsAt: '2026-10-28T12:00:00Z' };
    const row = await (await send('POST', path, body)).json() as EntitlementException;
    expect(row.status).toBe('SCHEDULED');
    expect((await send('POST', path, { ...body, kind: 'ADD' })).status).toBe(422);
    expect((await send('POST', path, { ...body, startsAt: body.endsAt })).status).toBe(422);
    vi.setSystemTime('2026-10-28T12:00:00Z');
    expect((await (await send('GET', `${path}?filter=all`)).json())[0].status).toBe('EXPIRED');
  });
});
