import { readFileSync } from 'node:fs';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { DevToken } from '../../src/lib/local-auth';

// What a spec of the stack needs to talk to the real API as the first dev user
// of the stack: where it is, the credentials, a way to sign the console in as
// that user, and a write of the setup that has to be accepted.

const tokens: DevToken[] = JSON.parse(
  readFileSync(process.env.STACK_TOKENS_FILE!, 'utf8'),
);
const actor = tokens[0]!;

export const api = process.env.STACK_API_URL!;
export const headers = { Authorization: `Bearer ${actor.token}` };

export async function signIn(page: Page) {
  await page.addInitScript((token) => {
    if (!localStorage.getItem('kaiten_dev_token')) {
      localStorage.setItem('kaiten_dev_token', token);
    }
  }, actor.token);
}

/** A write of the setup: it has to be accepted, or the spec has nothing to read. */
export async function accepted<T>(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
  status = 201,
): Promise<T> {
  expect(response.status(), await response.text()).toBe(status);

  return status === 204 ? (undefined as T) : ((await response.json()) as T);
}
