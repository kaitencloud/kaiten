import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { server } from './msw-server';

// The lists of billing that the API pages, as the mocks serve them: a page of fifty
// rows unless asked for fewer, a cursor while rows follow and none once they do not,
// and the refusal of a cursor the list did not return. They are read off the wire over
// the world of `pnpm run dev:mock`, as the console reads them.

const API = 'http://api.test/api';

type Page = { hasMore: boolean; items: Array<{ id: string }>; nextCursor?: string };

const read = async (path: string) => {
  const response = await fetch(`${API}${path}`);

  return { body: (await response.json()) as Page & { code?: string }, status: response.status };
};

/** Every row of a list, page after page, two rows at a time. */
const walk = async (path: string) => {
  const ids: string[] = [];
  const sizes: number[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ limit: '2', ...(cursor ? { cursor } : {}) });
    const { body } = await read(`${path}${path.includes('?') ? '&' : '?'}${query}`);
    ids.push(...body.items.map(({ id }) => id));
    sizes.push(body.items.length);
    cursor = body.hasMore ? body.nextCursor : undefined;
  } while (cursor);

  return { ids, sizes };
};

beforeEach(() => {
  server.use(
    ...createMockHandlers(createDevMockConfig(), 'off', undefined, true),
    undeclaredApiRequest,
  );
});

describe.each([
  ['the vouchers', '/vouchers', 'Vouchers'],
  ['the add-on versions', '/addons', 'Addons'],
  ['the publishable keys', '/publishable-keys?includeRevoked=true', 'PublishableKeys'],
  [
    'the redemptions of a voucher',
    '/vouchers/voucher-launch/redemptions',
    'VoucherRedemptions',
  ],
])('%s, paged', (_name, path, resource) => {
  it('serves the whole list in one page while it fits, with no cursor', async () => {
    const { body, status } = await read(path);

    expect(status).toBe(200);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeUndefined();
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('serves a page of the size asked for, with the cursor of the next, and reaches every row once', async () => {
    const whole = await read(path);
    const first = await read(`${path}${path.includes('?') ? '&' : '?'}limit=2`);

    expect(first.body.items).toHaveLength(2);
    expect(first.body.hasMore).toBe(whole.body.items.length > 2);
    expect(Boolean(first.body.nextCursor)).toBe(first.body.hasMore);

    const walked = await walk(path);

    expect(walked.ids).toEqual(whole.body.items.map(({ id }) => id));
    expect(new Set(walked.ids).size).toBe(walked.ids.length);
    expect(Math.max(...walked.sizes)).toBeLessThanOrEqual(2);
  });

  it('refuses a cursor it did not return, with the code of the list', async () => {
    const { body, status } = await read(
      `${path}${path.includes('?') ? '&' : '?'}cursor=nope`,
    );

    expect(status).toBe(400);
    expect(body.code).toBe(`${resource}.InvalidCursor`);
  });
});
