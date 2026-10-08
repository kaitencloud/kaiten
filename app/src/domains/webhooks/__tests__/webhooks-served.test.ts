import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { getWebhooksServed } from '../webhooks-served';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/api-client/client.gen', () => ({
  client: { get: getMock },
}));

const refusal = (status: number, code?: string) =>
  new ApiError({ status, data: { status, code } });

describe('getWebhooksServed', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('reads served where the webhooks list answers', async () => {
    getMock.mockResolvedValue({ data: [] });

    await expect(getWebhooksServed()).resolves.toBe(true);
    expect(getMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/webhooks', throwOnError: true }),
    );
  });

  it('reads not served where nothing answers the path: no saas-api, self-hosted', async () => {
    getMock.mockRejectedValue(refusal(404));

    await expect(getWebhooksServed()).resolves.toBe(false);
  });

  it("reads not served where saas-api refuses the organization's licence", async () => {
    getMock.mockRejectedValue(refusal(403, 'Webhooks.NotEntitled'));

    await expect(getWebhooksServed()).resolves.toBe(false);
  });

  // A licence that could not be read is not a licence without webhooks: the
  // query fails, and nothing caches "not served".
  it('fails where the answer could not be read', async () => {
    const unavailable = refusal(
      503,
      'Webhooks.EntitlementVerificationUnavailable',
    );
    getMock.mockRejectedValue(unavailable);

    await expect(getWebhooksServed()).rejects.toBe(unavailable);
  });

  it('fails on a network error', async () => {
    const network = new ApiError({ data: new TypeError('Failed to fetch') });
    getMock.mockRejectedValue(network);

    await expect(getWebhooksServed()).rejects.toBe(network);
  });
});
