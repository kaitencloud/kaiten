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
/** The rows of a list the API pages: the first page holds them all in these seeds. */
const items = async <T>(response: Response) =>
  (await json<{ hasMore: boolean; items: T[] }>(response)).items;
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
    const live = await items<PublishableKey>(
      await send('GET', '/publishable-keys'),
    );
    const all = await items<PublishableKey>(
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
      allowedOrigins: ['https://Shop.Acme.test', 'http://localhost:5173'],
      label: '  pricing page  ',
    });
    const listed = await items<PublishableKey & { key?: string }>(
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
    'https://shop.acme.test/',
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
        'HTTPS://Shop.Acme.test:8443',
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
    const live = await items<PublishableKey>(
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

describe('the Turnstile settings of a key, as the mocks serve them', () => {
  const SITE_KEY = '1x00000000000000000000AA';
  const SECRET = '1x0000000000000000000000000000000AA';

  it('lists the key of the world that opens the anonymous checkout, with whether a secret is stored and never the secret', async () => {
    const live = await items<PublishableKey>(
      await send('GET', '/publishable-keys'),
    );
    const staging = live.find(({ id }) => id === 'publishable-key-staging');

    expect(staging).toMatchObject({
      anonymousCheckout: true,
      turnstileSecretConfigured: true,
      turnstileSiteKey: expect.any(String),
    });
    expect(
      live
        .filter(({ id }) => id !== 'publishable-key-staging')
        .every(
          (key) =>
            !key.anonymousCheckout &&
            key.turnstileSiteKey === null &&
            !key.turnstileSecretConfigured,
        ),
    ).toBe(true);
    expect(JSON.stringify(live)).not.toMatch(/turnstileSecret"/);
  });

  it('opens the anonymous checkout of a new key only with a site key and a secret', async () => {
    const without = await send('POST', '/publishable-keys', {
      allowedOrigins: [],
      anonymousCheckout: true,
      label: 'storefront',
      turnstileSiteKey: SITE_KEY,
    });
    const created = await createKey({
      allowedOrigins: [],
      anonymousCheckout: true,
      label: 'storefront',
      turnstileSecret: SECRET,
      turnstileSiteKey: SITE_KEY,
    });
    const listed = await items<PublishableKey>(
      await send('GET', '/publishable-keys'),
    );

    expect(without.status).toBe(422);
    expect((await refusal(without)).code).toBe(
      'CreatePublishableKey.TurnstileNotConfigured',
    );
    expect(created).toMatchObject({
      anonymousCheckout: true,
      turnstileSecretConfigured: true,
      turnstileSiteKey: SITE_KEY,
    });
    expect(JSON.stringify(created)).not.toContain(SECRET);
    expect(JSON.stringify(listed)).not.toContain(SECRET);
  });

  it('keeps what a change leaves out, clears a value sent empty, and refuses to leave the checkout open without one', async () => {
    const renamed = await json<PublishableKey>(
      await send('PATCH', '/publishable-keys/publishable-key-staging', {
        label: 'Staging checkout',
      }),
    );
    const withoutSecret = await send(
      'PATCH',
      '/publishable-keys/publishable-key-staging',
      { turnstileSecret: '' },
    );
    const withoutSiteKey = await send(
      'PATCH',
      '/publishable-keys/publishable-key-staging',
      { turnstileSiteKey: '' },
    );
    const closed = await json<PublishableKey>(
      await send('PATCH', '/publishable-keys/publishable-key-staging', {
        anonymousCheckout: false,
        turnstileSecret: '',
        turnstileSiteKey: '',
      }),
    );
    const reopened = await send(
      'PATCH',
      '/publishable-keys/publishable-key-staging',
      { anonymousCheckout: true },
    );

    expect(renamed).toMatchObject({
      anonymousCheckout: true,
      label: 'Staging checkout',
      turnstileSecretConfigured: true,
    });
    expect(renamed.turnstileSiteKey).not.toBeNull();
    for (const refused of [withoutSecret, withoutSiteKey, reopened]) {
      expect(refused.status).toBe(422);
      expect((await refusal(refused)).code).toBe(
        'UpdatePublishableKey.TurnstileNotConfigured',
      );
    }
    expect(closed).toMatchObject({
      anonymousCheckout: false,
      turnstileSecretConfigured: false,
      turnstileSiteKey: null,
    });
  });

  it('writes nothing of a change the Turnstile rule refuses, label and origins included', async () => {
    const find = async () =>
      (
        await items<PublishableKey>(await send('GET', '/publishable-keys'))
      ).find(({ id }) => id === 'publishable-key-staging');
    const before = await find();

    const refused = await send(
      'PATCH',
      '/publishable-keys/publishable-key-staging',
      {
        allowedOrigins: ['https://elsewhere.acme.test'],
        label: 'Renamed in vain',
        turnstileSecret: '',
      },
    );

    expect(refused.status).toBe(422);
    expect((await refusal(refused)).code).toBe(
      'UpdatePublishableKey.TurnstileNotConfigured',
    );
    expect(before?.label).not.toBe('Renamed in vain');
    expect(await find()).toEqual(before);
  });

  it('refuses a secret on a deployment with no Vault, before anything else of the Turnstile rule, and still takes a key for the catalog', async () => {
    server.use(
      ...createMockHandlers(
        createDevMockConfig({ stripe: 'vaultMissing' }),
        'off',
        undefined,
        true,
      ),
    );

    const created = await send('POST', '/publishable-keys', {
      allowedOrigins: [],
      anonymousCheckout: true,
      label: 'storefront',
      turnstileSecret: SECRET,
    });
    const changed = await send(
      'PATCH',
      '/publishable-keys/publishable-key-pricing',
      { turnstileSecret: SECRET },
    );
    const plain = await send('POST', '/publishable-keys', {
      allowedOrigins: [],
      label: 'catalog only',
    });

    expect(created.status).toBe(422);
    expect((await refusal(created)).code).toBe(
      'CreatePublishableKey.VaultNotConfigured',
    );
    expect(changed.status).toBe(422);
    expect((await refusal(changed)).code).toBe(
      'UpdatePublishableKey.VaultNotConfigured',
    );
    expect(plain.status).toBe(201);
  });
});

