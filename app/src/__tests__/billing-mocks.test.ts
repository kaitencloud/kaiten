import { describe, expect, it } from 'vite-plus/test';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import {
  BillingAppModel,
  CAPABILITIES_OUTAGES,
} from '../../e2e/app/_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../../e2e/app/_support/model/billing-capabilities';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import { server } from './msw-server';

// The billing capabilities, which every page of the console reads for its
// navigation: the fallback every suite gets, the slot a spec installs, and the
// ways that slot can fail.

const capabilities = () => fetch('http://api.test/api/billing/capabilities');

const install = (config: E2EMswConfig) =>
  server.use(
    ...createMockHandlers(config, 'off', undefined, true),
    undeclaredApiRequest,
  );

describe('billing capabilities mocks', () => {
  it('answers that billing is off wherever no billing slot is installed', async () => {
    // No handler declared by the test: the default of the unit network.
    const response = await capabilities();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      disabledReason: 'DEPLOYMENT_DISABLED',
      enabled: false,
      features: { addons: false, stripe: false },
    });
  });

  it('answers that billing is off in the strict shell of the application suite', async () => {
    install({});

    expect(await (await capabilities()).json()).toMatchObject({
      enabled: false,
    });
  });

  it('serves the installed slot before the shell fallback', async () => {
    install({
      billing: new BillingAppModel({
        capabilities: billingCapabilitiesProfiles.full(),
      }).serializeForMsw(),
    });

    const body = await (await capabilities()).json();

    expect(body.enabled).toBe(true);
    expect(body.providers.map(({ kind }: { kind: string }) => kind)).toEqual([
      'NOOP',
      'STRIPE',
    ]);
    expect(body.features).toMatchObject({ addons: true, vouchers: true });
  });

  it.each([
    ['missingScope', 403, 'Auth.MissingScope'],
    ['unavailable', 503, 'Billing.EntitlementCheckUnavailable'],
    ['notImplemented', 404, undefined],
  ] as const)('refuses with a problem document for the %s outage', async (outage, status, code) => {
    const model = new BillingAppModel();
    model.failCapabilities(CAPABILITIES_OUTAGES[outage]);
    install({ billing: model.serializeForMsw() });

    const response = await capabilities();

    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    const problem = await response.json();
    expect(problem.status).toBe(status);
    expect(problem.code).toBe(code);
  });

  it('keeps an outage through the serialization the browser reloads from', async () => {
    const model = new BillingAppModel();
    model.failCapabilities(CAPABILITIES_OUTAGES.unavailable);

    const reloaded = BillingAppModel.fromSerialized(model.serializeForMsw());

    expect(() => reloaded.getCapabilities()).toThrow(
      'The billing entitlement could not be checked',
    );

    reloaded.restoreCapabilities();
    expect(reloaded.getCapabilities().enabled).toBe(true);
  });

  it('never answers when the model is set to hang', async () => {
    const model = new BillingAppModel();
    model.failCapabilities(CAPABILITIES_OUTAGES.hang);
    install({ billing: model.serializeForMsw() });

    const outcome = await Promise.race([
      capabilities().then(() => 'answered'),
      new Promise((resolve) => setTimeout(() => resolve('silent'), 300)),
    ]);

    expect(outcome).toBe('silent');
  });
});
