import { client } from '@/api-client/client.gen';
import { beforeAll, expect, it, vi } from 'vite-plus/test';
import { http, HttpResponse } from 'msw/http';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import { readAiCapability } from '../ai-capabilities.api';
vi.mock('@/lib/auth-token', () => ({ getAuthToken: async () => 'synthetic-session-token' }));
beforeAll(() => configureApiClient());
it('uses the shared authenticated no-store transport', async () => {
  let authorization: string | null = null;
  let cache: RequestCache | undefined;
  const observe = (request: Request) => { cache = request.cache; return request; };
  client.interceptors.request.use(observe);
  server.use(http.get('*/ai/capabilities', ({ request }) => {
    authorization = request.headers.get('Authorization');
    return HttpResponse.json({ enabled: true }, { headers: { 'Cache-Control': 'no-store' } });
  }));
  expect(await readAiCapability(new AbortController().signal)).toBe(true);
  expect(authorization).toBe('Bearer synthetic-session-token'); expect(cache).toBe('no-store');
  client.interceptors.request.eject(observe);
});
it('mock readiness defaults false separately from platform flag targeting', async () => {
  expect(await readAiCapability(new AbortController().signal)).toBe(false);
});
