import { expect, it, vi } from 'vite-plus/test';
import { readAiCapability } from '../ai-capabilities.api';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/api-client/client.gen', () => ({ client: { get } }));
it.each([false, true, undefined, 'true', 1])('only literal true enables (%s)', async (enabled) => {
  get.mockResolvedValue({ data: { enabled } }); const signal = new AbortController().signal;
  expect(await readAiCapability(signal)).toBe(enabled === true);
  expect(get).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/ai/capabilities', cache: 'no-store', signal, throwOnError: true }));
});
it('an old server or failure is not a positive capability', async () => {
  get.mockRejectedValue(new Error('404')); await expect(readAiCapability(new AbortController().signal)).rejects.toThrow('404');
});
