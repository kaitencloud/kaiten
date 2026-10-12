import { describe, expect, it } from 'vite-plus/test';
import type { Customer, Instance } from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import { createBillingCustomersModel } from '../../e2e/app/customers/customers.scenarios';
import { createReferencedEntitlementModel } from '../../e2e/app/entitlements/entitlements.scenarios';
import { createBilledInstancesModel } from '../../e2e/app/instances/instances.scenarios';
import { server } from './msw-server';

// What the mocks standing in for the customers, the instances and the entitlements
// answer when billing is involved: the billing e-mail of a customer, an instance
// whose customer and license are frozen, and the deletions that billing or a
// reference refuses, each with the code of the API and what stands in the way.
// These read the answers off the wire, as the console does.

const API = 'http://api.test/api';

const install = (config: E2EMswConfig) =>
  server.use(
    ...createMockHandlers(config, 'off', undefined, true),
    undeclaredApiRequest,
  );

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });

const refusal = async (response: Response) =>
  (await response.json()) as {
    code?: string;
    detail?: string;
    errors?: Array<{ location?: string; value?: unknown }>;
  };

describe('the billing e-mail of a customer, as the mocks serve it', () => {
  const installCustomers = () =>
    install({ customers: createBillingCustomersModel().serializeForMsw() });

  it('keeps an address given at creation, and none when none is given', async () => {
    installCustomers();

    const with_ = (await (
      await send('POST', '/customers', {
        billingEmail: 'billing@orbit.dev',
        name: 'Orbit Labs',
      })
    ).json()) as Customer;
    const without = (await (
      await send('POST', '/customers', { name: 'Delta Works' })
    ).json()) as Customer;

    expect(with_.billingEmail).toBe('billing@orbit.dev');
    expect(without.billingEmail).toBeUndefined();
  });

  it('keeps the stored address when an update leaves it out, replaces it, and removes it for an empty string', async () => {
    installCustomers();
    const update = async (body: Record<string, unknown>) =>
      (await (
        await send('PUT', '/customers/acme-corp', { name: 'Acme Corp', ...body })
      ).json()) as Customer;

    expect((await update({})).billingEmail).toBe('ap@acme.com');
    expect((await update({ billingEmail: 'accounts@acme.com' })).billingEmail).toBe(
      'accounts@acme.com',
    );
    expect((await update({ billingEmail: '' })).billingEmail).toBeUndefined();
  });

  it.each([
    ['not an address', 'not an address'],
    ['with nothing after the @', 'someone@'],
    ['longer than 254 characters', `${'a'.repeat(250)}@b.co`],
  ])('refuses an address %s, on create and on update', async (_name, billingEmail) => {
    installCustomers();

    const created = await send('POST', '/customers', {
      billingEmail,
      name: 'Orbit Labs',
    });
    const updated = await send('PUT', '/customers/acme-corp', {
      billingEmail,
      name: 'Acme Corp',
    });

    expect(created.status).toBe(422);
    expect((await refusal(created)).code).toBe('CreateCustomer.InvalidBillingEmail');
    expect(updated.status).toBe(422);
    expect((await refusal(updated)).code).toBe('UpdateCustomer.InvalidBillingEmail');
  });

  it('refuses once with the problem a spec armed, then answers again', async () => {
    const model = createBillingCustomersModel();
    model.armProblem('update', {
      code: 'UpdateCustomer.InvalidBillingEmail',
      detail: 'billingEmail must be an e-mail address of at most 254 characters',
      status: 422,
    });
    install({ customers: model.serializeForMsw() });
    const body = { billingEmail: 'accounts@acme.com', name: 'Acme Corp' };

    expect((await send('PUT', '/customers/acme-corp', body)).status).toBe(422);
    expect((await send('PUT', '/customers/acme-corp', body)).status).toBe(200);
  });
});

describe('deleting a customer that bills, as the mocks serve it', () => {
  it('refuses it with the invoices that are not settled, and whether a subscription lives', async () => {
    install({ customers: createBillingCustomersModel().serializeForMsw() });

    const response = await send('DELETE', '/customers/gamma-labs');
    const body = await refusal(response);

    expect(response.status).toBe(409);
    expect(body.code).toBe('DeleteCustomer.BillingActive');
    expect(body.errors?.[0].value).toEqual({
      live: false,
      unpaidInvoiceIds: ['inv-gamma-open'],
    });
  });
});

describe('an instance that bills, as the mocks serve it', () => {
  const installInstances = () =>
    install({ instances: createBilledInstancesModel().serializeForMsw() });

  const updateBody = (instance: Instance, changes: Record<string, unknown>) => ({
    customerId: instance.customerId,
    deploymentZoneId: instance.deploymentZoneId,
    description: instance.description,
    endLicenseDate: instance.endLicenseDate,
    licenseId: instance.licenseId,
    name: instance.name,
    startLicenseDate: instance.startLicenseDate,
    ...changes,
  });

  const read = async (slug: string) =>
    (await (await send('GET', `/instances/${slug}`)).json()) as Instance;

  it('freezes its customer and its license while the subscription lives, and says so', async () => {
    installInstances();
    const production = await read('acme-production');

    const customer = await send(
      'PUT',
      '/instances/acme-production',
      updateBody(production, { customerId: 'customer-beta' }),
    );
    const license = await send(
      'PUT',
      '/instances/acme-production',
      updateBody(production, { licenseId: 'license-growth' }),
    );

    expect(customer.status).toBe(409);
    expect((await refusal(customer)).code).toBe('UpdateInstance.BillingActive');
    expect(license.status).toBe(409);
    expect((await refusal(license)).code).toBe('UpdateInstance.BillingActive');
  });

  it('leaves the rest of it free, and the whole of an instance whose subscription ended', async () => {
    installInstances();
    const production = await read('acme-production');
    const legacy = await read('acme-legacy');

    const renamed = await send(
      'PUT',
      '/instances/acme-production',
      updateBody(production, { name: 'Acme Production EU' }),
    );
    const moved = await send(
      'PUT',
      '/instances/acme-legacy',
      updateBody(legacy, { customerId: 'customer-beta' }),
    );

    expect(renamed.status).toBe(200);
    expect(moved.status).toBe(200);
  });

  it('refuses to delete it while its subscription lives, or an invoice is not settled', async () => {
    installInstances();

    const live = await send('DELETE', '/instances/acme-production');
    const unsettled = await send('DELETE', '/instances/acme-legacy');

    expect(live.status).toBe(409);
    const liveBody = await refusal(live);
    expect(liveBody.code).toBe('DeleteInstance.BillingActive');
    expect(liveBody.errors?.[0].value).toEqual({
      status: 'ACTIVE',
      unpaidInvoiceIds: [],
    });
    expect((await refusal(unsettled)).errors?.[0].value).toEqual({
      status: 'CANCELED',
      unpaidInvoiceIds: ['inv-legacy-open'],
    });
  });

  it('deletes an instance that nobody bills', async () => {
    installInstances();

    const response = await send('DELETE', '/instances/beta-staging');

    expect(response.status).toBeLessThan(300);
  });
});

describe('deleting an entitlement that is in use, as the mocks serve it', () => {
  it('refuses it with what references it, and deletes one that nothing does', async () => {
    install({ entitlements: createReferencedEntitlementModel().serializeForMsw() });

    const used = await send('DELETE', '/entitlements/api-calls');
    const free = await send('DELETE', '/entitlements/priority-support');
    const body = await refusal(used);

    expect(used.status).toBe(409);
    expect(body.code).toBe('DeleteEntitlement.InUseConflict');
    expect(body.errors?.[0].value).toEqual({
      licenseGrants: 2,
      licensePrices: 1,
      usageCounters: 3,
    });
    expect(free.status).toBeLessThan(300);
  });
});
