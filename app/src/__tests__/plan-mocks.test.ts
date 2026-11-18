import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type {
  PageSessionInvoice,
  PublicCatalog,
  SessionCheckout,
  SessionPortal,
} from '@/api-client';
import {
  zCreateSessionCheckoutResponse,
  zGetPublicCatalogResponse,
  zGetSessionPortalResponse,
  zListSessionInvoicesResponse,
} from '@/api-client/zod.gen';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import {
  buildKaitenCloudPortal,
  GROWTH_ANNUAL,
  GROWTH_MONTHLY,
  STARTER_MONTHLY,
} from '../../e2e/app/_support/fixtures/build-kaiten-cloud-plan';
import {
  PlanAppModel,
  type PlanSessionRefusal,
} from '../../e2e/app/_support/model/plan-app-model';
import { server } from './msw-server';

// What the mocks behind the Plan & usage page answer, read off the wire as the console
// and the SDK read it: saas-api's session on the console's API, and Kaiten Cloud's public
// surface at its own address, which checks each credential as the API does
// (api/internal/platform/auth/public.go) and refuses a checkout in the order and with the
// codes of api/internal/modules/publicsdk/createsessioncheckout. Every answer is parsed
// with the contract's schema of that response.

const API = 'http://api.test/api';
const CLOUD = {
  apiUrl: 'https://kaiten-cloud.test/api',
  publishableKey: 'pk_mockKaitenCloudConsolePlanAndUsageCatalogue',
};

const install = (model = new PlanAppModel()) =>
  server.use(
    ...createMockHandlers(
      { plan: model.serializeForMsw() },
      'off',
      undefined,
      true,
      CLOUD,
    ),
    undeclaredApiRequest,
  );

const mint = async () => {
  const response = await fetch(`${API}/plan/session`, { method: 'POST' });
  expect(response.status).toBe(201);
  return (await response.json()) as { expiresAt: string; token: string };
};

const cloud = (path: string, init: RequestInit = {}) =>
  fetch(`${CLOUD.apiUrl}${path}`, init);

const asSession = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...init.headers,
  },
});

const checkout = async (token: string, order: Record<string, unknown>) =>
  cloud(
    '/public/session/checkout',
    asSession(token, { body: JSON.stringify(order), method: 'POST' }),
  );

/** The body of an answer, once its contract's schema accepts it (the schema coerces amounts, the body is kept). */
const contract = async <T>(
  schema: { safeParse: (value: unknown) => { error?: unknown } },
  response: Response,
): Promise<T> => {
  const body: unknown = await response.json();
  expect(schema.safeParse(body).error).toBeUndefined();
  return body as T;
};

const problem = async (response: Response) =>
  [response.status, ((await response.json()) as { code?: string }).code] as const;

describe('the session saas-api mints for the page', () => {
  it('lasts thirty minutes, and is a customer session', async () => {
    install();
    const before = Date.now();

    const session = await mint();

    expect(session.token).toMatch(/^kst_/);
    const lasts = Date.parse(session.expiresAt) - before;
    expect(lasts).toBeGreaterThan(29 * 60_000);
    expect(lasts).toBeLessThanOrEqual(30 * 60_000 + 1_000);
  });

  it.each<[PlanSessionRefusal, number, string]>([
    ['notEnabled', 403, 'CreatePlanSession.NotEnabled'],
    ['notProvisioned', 404, 'CreatePlanSession.NotProvisioned'],
    ['forbidden', 403, 'Auth.InsufficientScope'],
    ['unavailable', 503, 'CreatePlanSession.Unavailable'],
  ])('is refused for %s with saas-api’s status and code', async (refusal, status, code) => {
    install(new PlanAppModel({ sessionRefusal: refusal }));

    const response = await fetch(`${API}/plan/session`, { method: 'POST' });

    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(await problem(response)).toEqual([status, code]);
  });
});

describe('Kaiten Cloud’s public surface, as the session reads it', () => {
  beforeEach(() => install());

  it('serves the portal and the invoices to the session saas-api minted', async () => {
    const { token } = await mint();

    const portal = await contract<SessionPortal>(
      zGetSessionPortalResponse,
      await cloud('/public/session/portal', asSession(token)),
    );
    const page = await contract<PageSessionInvoice>(
      zListSessionInvoicesResponse,
      await cloud('/public/session/invoices?limit=2', asSession(token)),
    );

    expect(portal.instance?.licenseSlug).toBe('kaiten-starter-v1');
    expect(portal.subscription?.basePrice.id).toBe(STARTER_MONTHLY.id);
    expect(portal.paymentMethod).toMatchObject({ last4: '4242', status: 'ACTIVE' });
    expect(page.items.map(({ serviceFrom }) => serviceFrom)).toEqual([
      '2026-11-01T00:00:00Z',
      '2026-10-01T00:00:00Z',
    ]);
    expect(page.hasMore).toBe(true);
    const rest = (await (
      await cloud(
        `/public/session/invoices?limit=2&cursor=${page.nextCursor}`,
        asSession(token),
      )
    ).json()) as PageSessionInvoice;
    expect(rest.items.map(({ kind }) => kind)).toEqual(['ACTIVATION']);
  });

  it('refuses any other credential as the API does', async () => {
    const { token } = await mint();

    expect(await problem(await cloud('/public/session/portal'))).toEqual([
      401,
      'PublicAuth.InvalidCredential',
    ]);
    expect(
      await problem(await cloud('/public/session/portal', asSession('kst_forged'))),
    ).toEqual([401, 'PublicAuth.InvalidCredential']);
    expect(
      await problem(await cloud('/public/session/portal', asSession('ksh_organization'))),
    ).toEqual([403, 'Auth.WrongCredentialKind']);
    expect(
      await problem(
        await cloud(
          '/public/session/portal',
          asSession(token, {
            headers: { 'Kaiten-Publishable-Key': CLOUD.publishableKey },
          }),
        ),
      ),
    ).toEqual([403, 'Auth.WrongCredentialKind']);
  });

  it('answers nothing on the console’s own API: the SDK must ask Kaiten Cloud', async () => {
    const { token } = await mint();

    await expect(
      fetch(`${API}/public/session/portal`, asSession(token)),
    ).rejects.toThrow();
  });
});

describe('Kaiten Cloud’s public catalogue, as the console’s key reads it', () => {
  beforeEach(() => install());

  const withKey = (key: string): RequestInit => ({
    headers: { 'Kaiten-Publishable-Key': key },
  });

  it('lists the plans on sale to the key it knows, one family when asked', async () => {
    const catalog = await contract<PublicCatalog>(
      zGetPublicCatalogResponse,
      await cloud('/public/catalog', withKey(CLOUD.publishableKey)),
    );
    const growth = (await (
      await cloud(
        '/public/catalog?familySlug=kaiten-growth&include=none',
        withKey(CLOUD.publishableKey),
      )
    ).json()) as PublicCatalog;

    expect(catalog.plans.map(({ licenseSlug }) => licenseSlug)).toEqual([
      'kaiten-starter-v1',
      'kaiten-growth-v1',
    ]);
    expect(catalog.capabilities).toMatchObject({
      anonymousCheckout: false,
      checkout: true,
    });
    expect(growth.plans.map(({ name }) => name)).toEqual(['Cloud Growth']);
  });

  it('refuses another key, no key and a bearer', async () => {
    const { token } = await mint();

    expect(await problem(await cloud('/public/catalog', withKey('pk_another')))).toEqual([
      401,
      'PublicAuth.InvalidCredential',
    ]);
    expect(await problem(await cloud('/public/catalog'))).toEqual([
      401,
      'PublicAuth.InvalidCredential',
    ]);
    expect(await problem(await cloud('/public/catalog', asSession(token)))).toEqual([
      403,
      'Auth.WrongCredentialKind',
    ]);
  });
});

describe('a checkout of the session', () => {
  it('prices a plan before anything is confirmed, and changes nothing', async () => {
    install();
    const { token } = await mint();

    const response = await checkout(token, {
      dryRun: true,
      licensePriceId: GROWTH_ANNUAL.id,
    });
    const preview = await contract<SessionCheckout>(
      zCreateSessionCheckoutResponse,
      response,
    );
    const portal = (await (
      await cloud('/public/session/portal', asSession(token))
    ).json()) as SessionPortal;

    expect(response.status).toBe(200);
    expect(preview).toMatchObject({
      dueToday: { currency: 'USD', total: 79000 },
      status: 'preview',
    });
    expect(portal.instance?.licenseSlug).toBe('kaiten-starter-v1');
  });

  it('refuses what the public catalogue does not sell, a voucher and an add-on, with the API’s codes', async () => {
    install();
    const { token } = await mint();

    expect(
      await problem(
        await checkout(token, {
          dryRun: true,
          licensePriceId: '0c10d999-0000-4000-8000-000000000000',
        }),
      ),
    ).toEqual([422, 'CreateSessionCheckout.PriceNotPublic']);
    expect(
      await problem(
        await checkout(token, {
          dryRun: true,
          licensePriceId: GROWTH_MONTHLY.id,
          voucherCode: 'WELCOME20',
        }),
      ),
    ).toEqual([422, 'CreateSessionCheckout.VoucherInvalid']);
    expect(
      await problem(
        await checkout(token, {
          addOns: [{ addonSlug: 'extra-seats', quantity: 1 }],
          dryRun: true,
          licensePriceId: GROWTH_MONTHLY.id,
        }),
      ),
    ).toEqual([422, 'CreateSessionCheckout.AddonNotPublic']);
  });

  it('subscribes, charges the card, moves the instance, and refuses a second over the paid plan', async () => {
    install();
    const { token } = await mint();

    const response = await checkout(token, { licensePriceId: GROWTH_MONTHLY.id });
    const subscribed = await contract<SessionCheckout>(
      zCreateSessionCheckoutResponse,
      response,
    );
    const portal = await contract<SessionPortal>(
      zGetSessionPortalResponse,
      await cloud('/public/session/portal', asSession(token)),
    );
    const invoices = (await (
      await cloud('/public/session/invoices', asSession(token))
    ).json()) as PageSessionInvoice;

    expect(response.status).toBe(201);
    expect(subscribed).toMatchObject({
      activationInvoice: { kind: 'ACTIVATION', status: 'PAID', total: 7900 },
      payment: { status: 'paid' },
      status: 'subscribed',
      subscription: { basePrice: { id: GROWTH_MONTHLY.id }, status: 'ACTIVE' },
    });
    expect(portal.instance).toMatchObject({
      licenseName: 'Cloud Growth',
      licenseSlug: 'kaiten-growth-v1',
    });
    expect(portal.capabilities.checkout).toBe(false);
    expect(portal.upcomingInvoice?.total).toBe(7900);
    expect(invoices.items[0]?.id).toBe(subscribed.activationInvoice?.id);
    expect(
      await problem(
        await checkout(token, { dryRun: true, licensePriceId: STARTER_MONTHLY.id }),
      ),
    ).toEqual([409, 'CreateSessionCheckout.AlreadySubscribed']);
  });

  it('sends a customer with no card to the provider’s page first, then subscribes with what it saved', async () => {
    install(
      new PlanAppModel({
        portal: { ...buildKaitenCloudPortal(), paymentMethod: null },
      }),
    );
    const { token } = await mint();

    const first = (await (
      await checkout(token, {
        licensePriceId: GROWTH_MONTHLY.id,
        returnUrl: 'http://127.0.0.1:3100/settings/plan?plan=kaiten-growth-v1',
      })
    ).json()) as SessionCheckout;
    const unknown = await checkout(token, {
      licensePriceId: GROWTH_MONTHLY.id,
      setupSessionId: 'seti_unknown',
    });
    const back = await checkout(token, {
      licensePriceId: GROWTH_MONTHLY.id,
      setupSessionId: first.setupSessionId,
    });

    expect(first).toMatchObject({ status: 'requires_payment_method' });
    expect(first.setupUrl).toMatch(/^https:\/\/billing\.kaiten-cloud\.test\//);
    expect(await problem(unknown)).toEqual([
      409,
      'CreateSessionCheckout.SetupSessionIncomplete',
    ]);
    expect(back.status).toBe(201);
  });
});

describe('the plan in the world of dev:mock', () => {
  it('is served with the flag, on the address the build names', async () => {
    server.use(
      ...createMockHandlers(createDevMockConfig(), 'off', undefined, true, CLOUD),
      undeclaredApiRequest,
    );
    const { token } = await mint();

    const response = await cloud('/public/session/portal', asSession(token));

    expect(response.status).toBe(200);
  });
});
