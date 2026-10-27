import { expect, type Page, type Response } from '@playwright/test';

/** Observe early responses without spending the action timeout on navigation. */
export async function expectAiCapabilityAfterNavigation(
  page: Page,
  navigate: () => Promise<void>,
) {
  const matches = (response: Response) =>
    new URL(response.url()).pathname === '/api/ai/capabilities' &&
    response.request().method() === 'GET';
  let observed: Response | undefined;
  const record = (response: Response) => {
    if (!observed && matches(response)) observed = response;
  };
  page.on('response', record);
  try {
    await navigate();
    // Keep the normal response timeout, starting after full driver readiness.
    const response = observed ?? (await page.waitForResponse(matches));
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(response.headers()['cache-control']).toContain('no-store');
  } finally {
    page.off('response', record);
  }
}
