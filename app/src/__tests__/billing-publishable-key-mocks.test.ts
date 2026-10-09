import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type { PublishableKey, PublishableKeyCreated } from '@/api-client';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { server } from './msw-server';

// What the mocks standing in for the publishable keys answer: the same refusals, with the
// same codes, in the order the API checks them (api/internal/modules/publicsdk), and a key
// that is returned once and never listed. They are read off the wire, as the console does,
// over the world of `pnpm run dev:mock`.

const API = 'http://api.test/api';

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });

const json = async <T>(response: Response) => (await response.json()) as T;
const refusal = async (response: Response) =>
  json<{ code?: string; detail?: string }>(response);

const createKey = async (body: Record<string, unknown>) =>
  json<PublishableKeyCreated>(await send('POST', '/publishable-keys', body));

beforeEach(() => {
  server.use(
    ...createMockHandlers(createDevMockConfig(), 'off', undefined, true),
    undeclaredApiRequest,
  );
});

describe('the publishable keys, as the mocks serve them', () => {
  it('lists the live keys newest first, and the revoked ones on request', async () => {
    const live = await json<PublishableKey[]>(
      await send('GET', '/publishable-keys'),
    );
    const all = await json<PublishableKey[]>(
      await send('GET', '/publishable-keys?includeRevoked=true'),
    );

    expect(live.map(({ id }) => id)).toEqual([
      'publishable-key-staging',
      'publishable-key-renderer',
      'publishable-key-pricing',
    ]);
    expect(live.every(({ revokedAt }) => revokedAt === undefined)).toBe(true);
    expect(all.map(({ id }) => id)).toEqual([
      'publishable-key-staging',
      'publishable-key-renderer',
      'publishable-key-pricing',
      'publishable-key-docs',
      'publishable-key-shop',
    ]);
  });

  it('returns the key once at creation, then lists only its last four characters', async () => {
    const created = await createKey({
      allowedOrigins: ['https://Shop.Acme.test/', 'http://localhost:5173'],
      label: '  pricing page  ',
    });
    const listed = await json<Array<PublishableKey & { key?: string }>>(
      await send('GET', '/publishable-keys'),
    );
    const kept = listed.find(({ id }) => id === created.id);

    expect(created.key).toMatch(/^pk_/);
    expect(created).toMatchObject({
      allowedOrigins: ['https://shop.acme.test', 'http://localhost:5173'],
      keyHint: created.key.slice(-4),
      label: 'pricing page',
    });
    expect(kept).toMatchObject({ keyHint: created.keyHint });
    expect(JSON.stringify(listed)).not.toContain(created.key);
  });

  it('refuses a label outside one to a hundred characters, in the words of the API', async () => {
    const empty = await send('POST', '/publishable-keys', {
      allowedOrigins: [],
      label: '   ',
    });
    const long = await send('POST', '/publishable-keys', {
      allowedOrigins: [],
      label: 'x'.repeat(101),
    });

    expect(empty.status).toBe(422);
    expect(await refusal(empty)).toMatchObject({
      code: 'CreatePublishableKey.InvalidLabel',
      detail: 'label must be 1 to 100 characters',
    });
    expect((await refusal(long)).code).toBe('CreatePublishableKey.InvalidLabel');
  });

  it.each([
    'http://shop.acme.test',
    'https://shop.acme.test/pricing',
    'https://shop.acme.test?x=1',
    'https://user@shop.acme.test',
    'shop.acme.test',
    'ftp://shop.acme.test',
  ])('refuses %s as an origin, and names it', async (origin) => {
    const response = await send('POST', '/publishable-keys', {
      allowedOrigins: ['https://ok.acme.test', origin],
      label: 'pricing',
    });

    expect(response.status).toBe(422);
    const body = await refusal(response);
    expect(body.code).toBe('CreatePublishableKey.InvalidOrigin');
    expect(body.detail).toContain(JSON.stringify(origin));
  });

  it('accepts https, and http for localhost with a port, and keeps an origin once', async () => {
    const created = await createKey({
      allowedOrigins: [
        'https://shop.acme.test:8443',
        'http://localhost',
        'http://127.0.0.1:3000',
        'https://shop.acme.test:8443/',
      ],
      label: 'pricing',
    });

    expect(created.allowedOrigins).toEqual([
      'https://shop.acme.test:8443',
      'http://localhost',
      'http://127.0.0.1:3000',
    ]);
  });

  it('refuses more than fifty origins, and takes fifty', async () => {
    const origins = (count: number) =>
      Array.from({ length: count }, (_, index) => `https://s${index}.acme.test`);
    const fifty = await send('POST', '/publishable-keys', {
      allowedOrigins: origins(50),
      label: 'many',
    });
    const fiftyOne = await send('POST', '/publishable-keys', {
      allowedOrigins: origins(51),
      label: 'too many',
    });

    expect(fifty.status).toBe(201);
    expect(fiftyOne.status).toBe(422);
    expect((await refusal(fiftyOne)).code).toBe(
      'CreatePublishableKey.TooManyOrigins',
    );
  });

  it('changes the label and the origins of a live key, and leaves out what is not sent', async () => {
    const renamed = await send(
      'PATCH',
      '/publishable-keys/publishable-key-pricing',
      { label: 'Pricing site' },
    );
    const reopened = await send(
      'PATCH',
      '/publishable-keys/publishable-key-pricing',
      { allowedOrigins: [] },
    );

    expect(await json<PublishableKey>(renamed)).toMatchObject({
      allowedOrigins: ['https://www.example.com', 'https://pricing.example.com'],
      label: 'Pricing site',
    });
    expect(await json<PublishableKey>(reopened)).toMatchObject({
      allowedOrigins: [],
      label: 'Pricing site',
    });
  });

  it('refuses to change a revoked key, a key it does not have and a bad origin', async () => {
    const revoked = await send(
      'PATCH',
      '/publishable-keys/publishable-key-docs',
      { label: 'Docs 2' },
    );
    const missing = await send('PATCH', '/publishable-keys/ghost', {
      label: 'x',
    });
    const bad = await send('PATCH', '/publishable-keys/publishable-key-pricing', {
      allowedOrigins: ['http://shop.acme.test'],
    });

    expect(revoked.status).toBe(409);
    expect((await refusal(revoked)).code).toBe('UpdatePublishableKey.Revoked');
    expect(missing.status).toBe(404);
    expect((await refusal(missing)).code).toBe('UpdatePublishableKey.NotFound');
    expect(bad.status).toBe(422);
    expect((await refusal(bad)).code).toBe('UpdatePublishableKey.InvalidOrigin');
  });

  it('revokes a key for good, and answers the same when asked again', async () => {
    const first = await json<PublishableKey>(
      await send('POST', '/publishable-keys/publishable-key-pricing/revoke'),
    );
    const again = await json<PublishableKey>(
      await send('POST', '/publishable-keys/publishable-key-pricing/revoke'),
    );
    const live = await json<PublishableKey[]>(
      await send('GET', '/publishable-keys'),
    );
    const missing = await send('POST', '/publishable-keys/ghost/revoke');

    expect(first.revokedAt).toBeDefined();
    expect(again.revokedAt).toBe(first.revokedAt);
    expect(live.map(({ id }) => id)).not.toContain('publishable-key-pricing');
    expect(missing.status).toBe(404);
    expect((await refusal(missing)).code).toBe('RevokePublishableKey.NotFound');
  });
});
