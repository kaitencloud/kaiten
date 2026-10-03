import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { client } from '@/api-client/client.gen';
import { getAuthToken } from '../../auth-token';
import { ApiError } from '../../errors/api-error';
import { configureApiClient } from '../configure-api-client';

vi.mock('../../auth-token', () => ({ getAuthToken: vi.fn() }));

describe('REST bootstrap', () => {
  beforeEach(() => {
    client.interceptors.request.clear();
    client.interceptors.error.clear();
    vi.clearAllMocks();
  });

  it('uses the current token on successive requests and removes stale authorization', async () => {
    configureApiClient();
    const request = new Request('http://localhost/api/customers');
    vi.mocked(getAuthToken).mockResolvedValueOnce('first').mockResolvedValueOnce('second').mockResolvedValueOnce(undefined);
    for (const token of ['first', 'second', undefined]) {
      for (const interceptor of client.interceptors.request.fns) {
        if (interceptor) await interceptor(request, { headers: request.headers, url: request.url });
      }
      expect(request.headers.get('Authorization')).toBe(token ? `Bearer ${token}` : null);
    }
  });

  it('preserves status and body when wrapping a failed response', async () => {
    configureApiClient();
    const response = new Response(null, { status: 403 });
    const data = { detail: 'missing scope' };
    const interceptor = client.interceptors.error.fns.find(Boolean)!;
    const request = new Request('http://localhost/api');
    const error = await interceptor(data, response, request, { headers: request.headers, url: request.url });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, data, response });
  });

  it('preserves transport cancellation instead of wrapping it as an API error', async () => {
    configureApiClient();
    const abort = new DOMException('Cancelled', 'AbortError');
    const interceptor = client.interceptors.error.fns.find(Boolean)!;
    const request = new Request('http://api.test/api');
    expect(await interceptor(abort, undefined, request, { headers: request.headers, url: request.url })).toBe(abort);
  });
});
