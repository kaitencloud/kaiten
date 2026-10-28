import { expect, it, vi } from 'vite-plus/test';
import { expectAiCapabilityAfterNavigation } from '../e2e/app/_support/assertions/ai-capability';

vi.mock('@playwright/test', () => ({ expect }));

function fixture(enabled = true, status = 200) {
  const response = {
    url: () => 'http://localhost/api/ai/capabilities',
    request: () => ({ method: () => 'GET' }),
    status: () => status,
    json: async () => ({ enabled }),
    headers: () => ({ 'cache-control': 'no-store' }),
  };
  const listeners = new Set<(value: typeof response) => void>();
  const page = {
    on: vi.fn((_event: string, listener: (value: typeof response) => void) => listeners.add(listener)),
    off: vi.fn((_event: string, listener: (value: typeof response) => void) => listeners.delete(listener)),
    waitForResponse: vi.fn(async () => response),
  };
  let ready!: () => void;
  const navigation = new Promise<void>((resolve) => { ready = resolve; });
  return { page, response, ready, navigate: () => navigation, emit: (value = response) => listeners.forEach((listener) => listener(value)) };
}

it('records a response during navigation without starting a response deadline', async () => {
  const { page, emit, ready, navigate } = fixture();
  const pending = expectAiCapabilityAfterNavigation(page as never, navigate);
  expect(page.waitForResponse).not.toHaveBeenCalled();
  emit();
  ready();
  await pending;
  expect(page.waitForResponse).not.toHaveBeenCalled();
  expect(page.off).toHaveBeenCalledOnce();
});

it('starts the normal bounded wait only when navigation has finished', async () => {
  const { page, ready, navigate } = fixture();
  const pending = expectAiCapabilityAfterNavigation(page as never, navigate);
  expect(page.waitForResponse).not.toHaveBeenCalled();
  ready();
  await pending;
  expect(page.waitForResponse).toHaveBeenCalledOnce();
  expect(page.waitForResponse.mock.calls[0]).toHaveLength(1);
  expect(page.off).toHaveBeenCalledOnce();
});

it.each([[false, 200], [true, 403]])('retains literal capability/status assertions (%s, %s)', async (enabled, status) => {
  const { page, emit, ready, navigate } = fixture(enabled, status);
  const pending = expectAiCapabilityAfterNavigation(page as never, navigate);
  emit();
  ready();
  await expect(pending).rejects.toThrow();
  expect(page.off).toHaveBeenCalledOnce();
});

it('keeps the first response instead of accepting a later positive retry', async () => {
  const { page, emit, ready, navigate } = fixture(false);
  const pending = expectAiCapabilityAfterNavigation(page as never, navigate);
  emit();
  emit(fixture(true).response);
  ready();
  await expect(pending).rejects.toThrow();
  expect(page.waitForResponse).not.toHaveBeenCalled();
});

it('cleans up response observation when navigation fails', async () => {
  const { page } = fixture();
  const failure = new Error('navigation failed');
  await expect(expectAiCapabilityAfterNavigation(page as never, async () => { throw failure; })).rejects.toBe(failure);
  expect(page.off).toHaveBeenCalledOnce();
  expect(page.waitForResponse).not.toHaveBeenCalled();
});
