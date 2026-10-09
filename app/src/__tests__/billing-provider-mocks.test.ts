import { describe, expect, it } from 'vite-plus/test';
import type {
  BillingCapabilities,
  BillingHealth,
  ConnectorSettings,
  CustomerBilling,
  Invoice,
  PaymentMethodSession,
  SyncReport,
} from '@/api-client';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import { BillingAppModel } from '../../e2e/app/_support/model/billing-app-model';
import { buildSubscription } from '../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../e2e/app/_support/model/billing-capabilities';
import { createStripeBillingModel } from '../../e2e/app/billing/billing.scenarios';
import { createStripeConnectorModels } from '../../e2e/app/connectors/connectors.scenarios';
import { server } from './msw-server';

// What the mocks standing in for the payment provider answer: the Stripe
// connector and its refusals, a customer's payment method and the hosted pages it
// is sent to, the health of billing and the pass that mirrors Stripe, and what the
// provider does to an invoice. They refuse as the API does, with its codes,
// because the console is tested against them. These read the answers off the wire.

const API = 'http://api.test/api';
const STRIPE = 'kaiten.integration.billing.stripe';

type Pair = ReturnType<typeof createStripeConnectorModels>;

/** The slots as the page serves them: the state they hold is what the next call reads. */
const install = (config: E2EMswConfig) => {
  const state = { ...config };
  server.use(
    ...createMockHandlers(
      state,
      'off',
      (slot, value) => {
        Object.assign(state, { [slot]: value });
      },
      true,
    ),
    undeclaredApiRequest,
  );

  return state;
};

const installBilling = (model: BillingAppModel) =>
  install({ billing: model.serializeForMsw() });

const installConnector = ({ billing, connectors }: Pair) =>
  install({
    billing: billing.serializeForMsw(),
    connectors: connectors.serializeForMsw(),
  });

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });

const problem = async (response: Response) =>
  (await response.json()) as {
    code?: string;
    detail?: string;
    errors?: Array<{ location?: string; value?: unknown }>;
  };

const stripe = async (): Promise<BillingCapabilities['providers'][number]> => {
  const body = (await (
    await send('GET', '/billing/capabilities')
  ).json()) as BillingCapabilities;
  const provider = body.providers.find(({ kind }) => kind === 'STRIPE');
  if (!provider) {
    throw new Error('the capabilities list no Stripe');
  }

  return provider;
};

const putSettings = (settings: Record<string, unknown>) =>
  send('PUT', `/connectors/${STRIPE}/settings`, { settings });

describe('the Stripe connector, as the mocks serve it', () => {
  it('has nothing stored before it is connected', async () => {
    installConnector(createStripeConnectorModels({ standing: 'available' }));

    const response = await send('GET', `/connectors/${STRIPE}/settings`);

    expect(response.status).toBe(404);
    expect(await stripe()).toMatchObject({ available: true, connected: false });
  });

  it('connects with a restricted key, never returns it, and says which account it reaches', async () => {
    installConnector(createStripeConnectorModels({ standing: 'available' }));

    const saved = await putSettings({
      autoFinalize: false,
      automaticTax: true,
      stripeSecretKey: 'rk_test_123',
      taxBehavior: 'INCLUSIVE',
    });

    expect(saved.status).toBe(200);
    expect(((await saved.json()) as ConnectorSettings).settings).toEqual({
      autoFinalize: false,
      automaticTax: true,
      stripeSecretKey: '***',
      taxBehavior: 'INCLUSIVE',
    });
    expect(await stripe()).toMatchObject({ connected: true, livemode: false });
    const read = await send('GET', `/connectors/${STRIPE}/settings`);
    expect(((await read.json()) as ConnectorSettings).settings).toMatchObject({
      stripeSecretKey: '***',
    });
  });

  it('reads a live key as the live account', async () => {
    installConnector(createStripeConnectorModels({ standing: 'available' }));

    await putSettings({ stripeSecretKey: 'rk_live_abc' });

    expect(await stripe()).toMatchObject({ connected: true, livemode: true });
  });

  it('keeps the stored key when a save leaves it out, and changes the options', async () => {
    installConnector(createStripeConnectorModels({ standing: 'connected' }));

    const saved = await putSettings({ automaticTax: true });

    expect(saved.status).toBe(200);
    expect(((await saved.json()) as ConnectorSettings).settings).toMatchObject({
      automaticTax: true,
      stripeSecretKey: '***',
    });
  });

  it('refuses a key that is not a restricted one, on the field, with no request to Stripe', async () => {
    installConnector(createStripeConnectorModels({ standing: 'available' }));

    const refused = await putSettings({ stripeSecretKey: 'sk_live_x' });

    expect(refused.status).toBe(422);
    const body = await problem(refused);
    expect(body.code).toBe('UpdateConnectorSettings.InvalidPayloadSchema');
    // The API words a schema failure in its detail and locates nothing.
    expect(body.detail).toContain('/stripeSecretKey');
    expect(body.errors ?? []).toEqual([]);
    expect((await stripe()).connected).toBe(false);
  });

  it('refuses a first save with no key at all', async () => {
    installConnector(createStripeConnectorModels({ standing: 'available' }));

    const refused = await putSettings({ automaticTax: true });

    expect(refused.status).toBe(422);
    expect((await problem(refused)).code).toBe(
      'UpdateConnectorSettings.InvalidPayloadSchema',
    );
  });

  it('refuses credentials Stripe rejects, naming its code and never the key', async () => {
    installConnector(createStripeConnectorModels({ standing: 'available' }));

    const refused = await putSettings({ stripeSecretKey: 'rk_test_rejected' });

    expect(refused.status).toBe(422);
    const body = await problem(refused);
    expect(body.code).toBe('UpdateConnectorSettings.CredentialsRejected');
    expect(body.errors?.[0]).toMatchObject({
      location: 'body.settings.stripeSecretKey',
      value: { providerCode: 'api_key_expired' },
    });
    expect(JSON.stringify(body)).not.toContain('rk_test_rejected');
    expect((await stripe()).connected).toBe(false);
  });

  it('refuses a key of another account while Stripe holds customers of the organization', async () => {
    installConnector(createStripeConnectorModels({ standing: 'connected' }));

    const refused = await putSettings({ stripeSecretKey: 'rk_live_elsewhere' });

    expect(refused.status).toBe(409);
    expect((await problem(refused)).code).toBe(
      'UpdateConnectorSettings.AccountChanged',
    );
  });

  it('answers 503 when Stripe cannot be reached to check the key', async () => {
    installConnector(createStripeConnectorModels({ standing: 'available' }));

    const refused = await putSettings({ stripeSecretKey: 'rk_test_offline' });

    expect(refused.status).toBe(503);
    expect((await problem(refused)).code).toBe(
      'UpdateConnectorSettings.ProviderUnavailable',
    );
  });

  it('cannot be connected without a Vault, or on a plan that leaves it out', async () => {
    installConnector(createStripeConnectorModels({ standing: 'vaultMissing' }));
    const vault = await putSettings({ stripeSecretKey: 'rk_test_123' });
    expect(vault.status).toBe(422);
    expect((await problem(vault)).code).toBe(
      'UpdateConnectorSettings.VaultNotConfigured',
    );

    installConnector(createStripeConnectorModels({ standing: 'notEntitled' }));
    const plan = await putSettings({ stripeSecretKey: 'rk_test_123' });
    expect(plan.status).toBe(403);
    expect((await problem(plan)).code).toBe('ActivateConnector.NotEntitled');
  });

  it('refuses to disconnect while subscriptions or invoices route to Stripe, and counts them', async () => {
    installConnector(createStripeConnectorModels({ standing: 'connected' }));

    const refused = await send('DELETE', `/connectors/${STRIPE}/activation`);

    expect(refused.status).toBe(409);
    const body = await problem(refused);
    expect(body.code).toBe('DeactivateConnector.BillingActive');
    expect(body.errors?.[0]?.value).toMatchObject({
      activeSubscriptions: expect.any(Number),
      openInvoices: expect.any(Number),
    });
    expect((await stripe()).connected).toBe(true);
    const settings = await send('DELETE', `/connectors/${STRIPE}/settings`);
    expect(settings.status).toBe(409);
    expect((await problem(settings)).code).toBe(
      'DeleteConnectorSettings.BillingActive',
    );
  });

  it('disconnects once nothing routes to it, and keeps the stored key', async () => {
    installConnector(
      createStripeConnectorModels({ standing: 'connected', withoutRouting: true }),
    );

    const response = await send('DELETE', `/connectors/${STRIPE}/activation`);

    expect(response.status).toBe(204);
    expect((await stripe()).connected).toBe(false);
    expect((await send('GET', `/connectors/${STRIPE}/settings`)).status).toBe(
      200,
    );
  });

  it('forgets the key when its settings are deleted', async () => {
    installConnector(
      createStripeConnectorModels({ standing: 'connected', withoutRouting: true }),
    );

    expect(
      (await send('DELETE', `/connectors/${STRIPE}/settings`)).status,
    ).toBe(204);

    expect((await stripe()).connected).toBe(false);
    expect((await send('GET', `/connectors/${STRIPE}/settings`)).status).toBe(
      404,
    );
  });
});

describe('the payment method of a customer, as the mocks serve it', () => {
  const customer = async (slug: string): Promise<CustomerBilling> =>
    (await send('GET', `/customers/${slug}/billing`)).json();

  it('reads a customer in Stripe with its card, and one with none as null', async () => {
    installBilling(createStripeBillingModel());

    const globex = await customer('globex');
    const initech = await customer('initech');

    expect(globex.billingEmail).toBe('billing@globex.test');
    expect(globex.providers[0]).toMatchObject({
      externalCustomerId: 'cus_globex',
      paymentMethod: { brand: 'visa', last4: '4242', status: 'ACTIVE' },
      providerKind: 'STRIPE',
    });
    // The API sends null for a customer with no payment method.
    expect(initech.providers[0]?.paymentMethod).toBeNull();
  });

  it('lists no provider for a customer Stripe has not met', async () => {
    installBilling(createStripeBillingModel());

    expect((await customer('umbrella')).providers).toEqual([]);
  });

  it('answers 404 for a customer that does not exist', async () => {
    installBilling(createStripeBillingModel());

    const response = await send('GET', '/customers/nobody/billing');

    expect(response.status).toBe(404);
    expect((await problem(response)).code).toBe(
      'GetCustomerBilling.CustomerNotFound',
    );
  });

  it('sends the customer to a hosted page, and completes the session when it is back', async () => {
    installBilling(createStripeBillingModel());

    const session = await send(
      'POST',
      '/customers/initech/billing/payment-method-session',
      { currency: 'USD', returnUrl: 'https://console.example.test/customers/initech' },
    );
    expect(session.status).toBe(200);
    const { sessionId, url } = (await session.json()) as PaymentMethodSession;
    expect(url).toBe(`https://checkout.stripe.com/c/pay/${sessionId}`);

    const completed = await send(
      'POST',
      `/customers/initech/billing/payment-method-session/${sessionId}/complete`,
    );
    expect(completed.status).toBe(200);
    expect(((await completed.json()) as { paymentMethod: unknown }).paymentMethod).toMatchObject({
      brand: 'visa',
      last4: '4242',
      status: 'ACTIVE',
    });
    expect((await customer('initech')).providers[0]?.paymentMethod).toMatchObject({
      status: 'ACTIVE',
    });
    // The same session twice leaves the same method.
    const again = await send(
      'POST',
      `/customers/initech/billing/payment-method-session/${sessionId}/complete`,
    );
    expect(again.status).toBe(200);
  });

  it('refuses a session that is unknown, another customer\'s, or not finished on the hosted page', async () => {
    const model = createStripeBillingModel();
    model.providers.setSession('cs_test_123', {
      customerSlug: 'initech',
      outcome: 'incomplete',
    });
    installBilling(model);

    const unknown = await send(
      'POST',
      '/customers/initech/billing/payment-method-session/cs_missing/complete',
    );
    const other = await send(
      'POST',
      '/customers/globex/billing/payment-method-session/cs_test_123/complete',
    );
    const unfinished = await send(
      'POST',
      '/customers/initech/billing/payment-method-session/cs_test_123/complete',
    );

    expect(unknown.status).toBe(404);
    expect((await problem(unknown)).code).toBe(
      'CompletePaymentMethodSession.SessionNotFound',
    );
    expect(other.status).toBe(404);
    expect(unfinished.status).toBe(409);
    expect((await problem(unfinished)).code).toBe(
      'CompletePaymentMethodSession.SessionNotComplete',
    );
  });

  it('asks for the currency of a customer with no live subscription, and checks the return address', async () => {
    installBilling(createStripeBillingModel());

    const noCurrency = await send(
      'POST',
      '/customers/initech/billing/payment-method-session',
      { returnUrl: 'https://console.example.test/customers/initech' },
    );
    const badUrl = await send(
      'POST',
      '/customers/initech/billing/payment-method-session',
      { currency: 'USD', returnUrl: 'http://console.example.test/x' },
    );
    const localhost = await send(
      'POST',
      '/customers/initech/billing/payment-method-session',
      { currency: 'USD', returnUrl: 'http://localhost:3000/customers/initech' },
    );

    expect(noCurrency.status).toBe(422);
    expect((await problem(noCurrency)).code).toBe(
      'CreatePaymentMethodSession.CurrencyRequired',
    );
    expect(badUrl.status).toBe(422);
    expect((await problem(badUrl)).code).toBe(
      'CreatePaymentMethodSession.InvalidReturnUrl',
    );
    expect(localhost.status).toBe(200);
  });

  it('answers 422 ProviderNotConnected wherever Stripe is not connected', async () => {
    installBilling(createStripeBillingModel({ standing: 'available' }));

    const response = await send(
      'POST',
      '/customers/initech/billing/portal-session',
      { returnUrl: 'https://console.example.test/customers/initech' },
    );

    expect(response.status).toBe(422);
    expect((await problem(response)).code).toBe(
      'CreatePortalSession.ProviderNotConnected',
    );
  });

  it('opens the portal of a customer Stripe knows, and refuses one it does not', async () => {
    installBilling(createStripeBillingModel());
    const body = { returnUrl: 'https://console.example.test/customers/initech' };

    const known = await send(
      'POST',
      '/customers/initech/billing/portal-session',
      body,
    );
    const unknown = await send(
      'POST',
      '/customers/umbrella/billing/portal-session',
      body,
    );

    expect(known.status).toBe(200);
    expect(((await known.json()) as { url: string }).url).toMatch(
      /^https:\/\/billing\.stripe\.com\/p\/session\//,
    );
    expect(unknown.status).toBe(422);
    expect((await problem(unknown)).code).toBe(
      'CreatePortalSession.CustomerNotOnProvider',
    );
  });

  it('removes a payment method, then says there is none left', async () => {
    installBilling(createStripeBillingModel());

    const removed = await send('DELETE', '/customers/globex/billing/payment-method');
    const again = await send('DELETE', '/customers/globex/billing/payment-method');

    expect(removed.status).toBe(204);
    expect((await customer('globex')).providers[0]?.paymentMethod).toBeNull();
    expect(again.status).toBe(409);
    expect((await problem(again)).code).toBe(
      'DetachPaymentMethod.NoPaymentMethod',
    );
  });

  it('refuses to remove the method a live subscription is charged with', async () => {
    installBilling(
      new BillingAppModel({
        capabilities: billingCapabilitiesProfiles.stackWithStripe(),
        providers: {
          customers: {
            initech: {
              externalCustomerId: 'cus_initech',
              paymentMethod: {
                brand: 'visa',
                expMonth: 12,
                expYear: 2030,
                last4: '4242',
                status: 'ACTIVE',
              },
            },
          },
        },
        subscriptions: [
          {
            ...buildSubscription({ anchorAt: '2026-03-01T00:00:00.000Z' }),
            collectionMethod: 'CHARGE_AUTOMATICALLY',
            providerKind: 'STRIPE',
          },
        ],
      }),
    );

    const refused = await send('DELETE', '/customers/initech/billing/payment-method');

    expect(refused.status).toBe(409);
    expect((await problem(refused)).code).toBe(
      'DetachPaymentMethod.InUseByAutomaticCollection',
    );
    expect((await customer('initech')).providers[0]?.paymentMethod).not.toBeNull();
  });
});

describe('the health of billing and the pass that mirrors Stripe, as the mocks serve them', () => {
  const health = async (): Promise<BillingHealth> =>
    (await send('GET', '/billing/health')).json();

  it('counts what the invoices say', async () => {
    installBilling(createStripeBillingModel());

    const body = await health();

    expect(body.heldInvoices).toMatchObject({
      byReason: {
        LEDGER_CHAIN_BREAK: 1,
        LEDGER_COUNTER_MISMATCH: 0,
        LEDGER_SEQUENCE_GAP: 1,
      },
      count: 2,
    });
    // `inv-f1` failed three times: below the threshold that raises an alert.
    expect(body.pushFailures.count).toBe(0);
    // Its mismatch was found in April: nothing of the last thirty days.
    expect(body.reconciliationMismatches30d).toBe(0);
    expect(body.handoff.pending).toBeGreaterThan(0);
    expect(body.providerSync).toHaveLength(1);
    expect(body.providerSync[0]).toMatchObject({
      consecutiveFailures: 0,
      lastSyncStatus: 'SUCCESS',
      providerKind: 'STRIPE',
    });
  });

  it('reports a provider whose pass keeps failing', async () => {
    installBilling(createStripeBillingModel({ sync: 'failing' }));

    expect((await health()).providerSync[0]).toMatchObject({
      consecutiveFailures: 3,
      lastSyncStatus: 'FAILED',
    });
  });

  it('lists no provider that never ran a pass', async () => {
    installBilling(createStripeBillingModel({ sync: 'never' }));

    expect((await health()).providerSync).toEqual([]);
  });

  it('runs a pass now, applies what Stripe says and reports it', async () => {
    installBilling(createStripeBillingModel());

    const response = await send('POST', '/billing/sync');

    expect(response.status).toBe(202);
    const report = (await response.json()) as SyncReport;
    expect(report.providers).toHaveLength(1);
    expect(report.providers[0]).toMatchObject({
      failed: 0,
      providerKind: 'STRIPE',
      status: 'SUCCESS',
    });
    expect(report.providers[0]?.applied).toBeGreaterThan(0);
    // `inv-pp` was paid in Stripe: the pass reads it.
    const paid = (await (await send('GET', '/invoices/inv-pp')).json()) as Invoice;
    expect(paid.status).toBe('PAID');
  });

  it('refuses a pass where no provider that issues invoices is connected', async () => {
    installBilling(createStripeBillingModel({ standing: 'available' }));

    const response = await send('POST', '/billing/sync');

    expect(response.status).toBe(409);
    expect((await problem(response)).code).toBe('SyncProvider.NotConnected');
  });
});

describe('what the provider does to an invoice, as the mocks serve it', () => {
  const invoice = async (id: string): Promise<Invoice> =>
    (await send('GET', `/invoices/${id}`)).json();

  it('finalizes a draft waiting in Stripe at once', async () => {
    installBilling(createStripeBillingModel());

    const response = await send('POST', '/invoices/inv-rv/retry-push');

    expect(response.status).toBe(202);
    const body = (await response.json()) as Invoice;
    expect(body.status).toBe('PUSHED');
    expect(body.provider).toMatchObject({
      reconciliationStatus: 'MATCHED',
      status: 'open',
    });
    expect(body.provider?.hostedInvoiceUrl).toMatch(/^https:\/\//);
  });

  it('queues a push that failed, and the job runs when the invoice is read again', async () => {
    installBilling(createStripeBillingModel());

    const queued = await send('POST', '/invoices/inv-f1/retry-push');
    expect(queued.status).toBe(202);
    expect(((await queued.json()) as Invoice).status).toBe('PUSH_FAILED');

    expect((await invoice('inv-f1')).status).toBe('PUSH_FAILED');
    expect((await invoice('inv-f1')).status).toBe('PUSHED');
  });

  it('fails the job again for an invoice whose push keeps failing, and says why', async () => {
    const reason = 'customer_tax_location_invalid: the address cannot be used';
    const stored = createStripeBillingModel().serializeForMsw();
    install({
      billing: {
        ...stored,
        invoices: stored.invoices && {
          ...stored.invoices,
          pushFailures: { 'inv-f1': reason },
        },
      },
    });

    await send('POST', '/invoices/inv-f1/retry-push');
    await invoice('inv-f1');
    const after = await invoice('inv-f1');

    expect(after.status).toBe('PUSH_FAILED');
    expect(after.provider).toMatchObject({
      lastPushError: reason,
      pushAttempts: 4,
    });
  });

  it('refuses to push an invoice nobody collects through a provider, or one that is held', async () => {
    installBilling(createStripeBillingModel());

    const noop = await send('POST', '/invoices/inv-m1/retry-push');
    const settled = await send('POST', '/invoices/inv-s1/retry-push');

    expect(noop.status).toBe(409);
    expect((await problem(noop)).code).toBe('RetryInvoicePush.InvalidStatus');
    expect(settled.status).toBe(409);
    expect((await problem(settled)).code).toBe('RetryInvoicePush.InvalidStatus');
  });

  it('reads an invoice back and applies a payment made in Stripe', async () => {
    installBilling(createStripeBillingModel());

    const response = await send('POST', '/invoices/inv-pp/sync');

    expect(response.status).toBe(200);
    const body = (await response.json()) as Invoice;
    expect(body.status).toBe('PAID');
    expect(body.paidAt).toBeDefined();
    expect(body.provider?.status).toBe('paid');
  });

  it('refuses to read back an invoice Stripe does not hold', async () => {
    installBilling(createStripeBillingModel());

    const noop = await send('POST', '/invoices/inv-m1/sync');
    const unpushed = await send('POST', '/invoices/inv-f1/sync');

    expect(noop.status).toBe(409);
    expect((await problem(noop)).code).toBe('SyncInvoice.NotPushed');
    expect(unpushed.status).toBe(409);
  });

  it('voids in Stripe first, and refuses an invoice Stripe reports paid', async () => {
    installBilling(createStripeBillingModel());

    const paid = await send('POST', '/invoices/inv-pp/void', {
      reason: 'wrong amount',
    });
    expect(paid.status).toBe(409);
    const body = await problem(paid);
    expect(body.code).toBe('VoidInvoice.InvalidStatus');
    expect(body.errors?.[0]?.value).toBe('paid_at_provider');
    expect((await invoice('inv-pp')).status).toBe('PUSHED');

    const open = await send('POST', '/invoices/inv-s1/void', {
      reason: 'wrong amount',
    });
    expect(open.status).toBe(200);
    expect(((await open.json()) as Invoice).status).toBe('VOID');
  });

  it('refuses to mark paid or write off an invoice Stripe collects', async () => {
    installBilling(createStripeBillingModel());

    const response = await send('POST', '/invoices/inv-s1/mark-paid', {});

    expect(response.status).toBe(409);
    expect((await problem(response)).code).toBe('MarkInvoicePaid.ProviderManaged');
  });
});

describe('the dev world, with Stripe', () => {
  it('connects Stripe to a test account and routes Acme US through it', () => {
    const { billing, connectors } = createDevMockConfig();

    expect(billing?.capabilities.providers.map(({ kind }) => kind)).toEqual([
      'NOOP',
      'STRIPE',
    ]);
    expect(
      billing?.capabilities.providers.find(({ kind }) => kind === 'STRIPE'),
    ).toMatchObject({ connected: true, livemode: false });
    expect(connectors?.stripe).toMatchObject({ activated: true });
    const stripeSubscriptions = billing?.subscriptions?.subscriptions.filter(
      ({ providerKind }) => providerKind === 'STRIPE',
    );
    expect(stripeSubscriptions?.map(({ instanceSlug }) => instanceSlug)).toEqual(
      ['acme-us'],
    );
  });

  it('holds an invoice of Stripe in every state the console shows', () => {
    const { billing } = createDevMockConfig();
    const stripeInvoices = (billing?.invoices?.invoices ?? []).filter(
      ({ providerKind }) => providerKind === 'STRIPE',
    );
    const states = new Set(stripeInvoices.map(({ status }) => status));

    expect([...states].sort()).toEqual(['DRAFT', 'PAID', 'PUSHED', 'PUSH_FAILED']);
    expect(
      stripeInvoices.some(
        ({ provider }) => provider?.reconciliationStatus === 'MISMATCH',
      ),
    ).toBe(true);
    expect(Object.values(billing?.invoices?.providerTruth ?? {})).toContain(
      'paid',
    );
  });

  it('starts with the connector in the standing the address asks for', () => {
    expect(
      createDevMockConfig({ stripe: 'vaultMissing' }).billing?.capabilities
        .providers.find(({ kind }) => kind === 'STRIPE'),
    ).toMatchObject({
      available: false,
      connected: false,
      unavailableReason: 'VAULT_NOT_CONFIGURED',
    });
    expect(
      createDevMockConfig({ stripe: 'available' }).connectors?.stripe,
    ).toMatchObject({ activated: false, settings: null });
  });
});
