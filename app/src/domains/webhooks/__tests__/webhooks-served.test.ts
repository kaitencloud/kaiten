import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { getWebhooksServed } from '../webhooks-served';

const { getMock, platform } = vi.hoisted(() => ({
  getMock: vi.fn(),
  platform: { url: '' },
}));

vi.mock('@/api-client/client.gen', () => ({
  client: { get: getMock },
}));

vi.mock('@/env', () => ({
  default: {
    get PLATFORM_API_URL() {
      return platform.url;
    },
  },
}));

const refusal = (status: number, code?: string) =>
  new ApiError({ status, data: { status, code } });

describe('getWebhooksServed', () => {
  // The builds that can be served webhooks: Kaiten Cloud's, which name their
  // platform, and a dev or e2e build that says a saas-api answers behind it.
  beforeEach(() => {
    getMock.mockReset();
    platform.url = 'https://platform.test/api';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  describe('where no saas-api can answer', () => {
    it('does not ask a self-hosted build, which names no platform', async () => {
      platform.url = '';

      await expect(getWebhooksServed()).resolves.toBe(false);
      expect(getMock).not.toHaveBeenCalled();
    });

    it('does not ask a build that switches webhooks off or leaves the switch unset', async () => {
      platform.url = '';
      vi.stubEnv('VITE_KAITEN_WEBHOOKS', 'false');

      await expect(getWebhooksServed()).resolves.toBe(false);
      expect(getMock).not.toHaveBeenCalled();
    });

    it('asks a dev or e2e build that says a saas-api answers behind it', async () => {
      platform.url = '';
      vi.stubEnv('VITE_KAITEN_WEBHOOKS', 'true');
      getMock.mockResolvedValue({ data: [] });

      await expect(getWebhooksServed()).resolves.toBe(true);
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('asks Kaiten Cloud, which names its platform', async () => {
      getMock.mockResolvedValue({ data: [] });

      await expect(getWebhooksServed()).resolves.toBe(true);
      expect(getMock).toHaveBeenCalledTimes(1);
    });
  });
});
