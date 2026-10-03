import { expect, test } from '../_support/app-test';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createEmptyCustomersModel } from '../customers/customers.scenarios';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installAuditTrailAppMocks } from '../_support/mocks/install-audit-trail-app-mocks';
import { createTypedMetadataInstanceModel } from '../instances/instances.scenarios';
import { createUsageEventsAuditTrailModel } from '../audit-trail/audit-trail.scenarios';

// Executed against MSW: the wire contract and
// stateful workflow, with no client stub and no assertion on implementation.
test('customer transport preserves CRUD, errors and state across reloads', async ({
  page,
}) => {
  const model = createEmptyCustomersModel();
  model.setNextCreateError(500);
  await installCustomerAppMocks(page, model);
  await page.goto('/customers');
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true }),
  ).toBeVisible();

  async function request(path: string, method = 'GET', body?: unknown) {
    return page.evaluate(
      async ({ path, method, body }) => {
        const response = await fetch(`/api/${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const text = await response.text();
        return {
          status: response.status,
          body: text ? JSON.parse(text) : null,
        };
      },
      { path, method, body },
    );
  }
  const payload = {
    name: 'Transport Customer',
    slug: 'transport-customer',
    metadata: {},
  };
  expect(await request('customers', 'POST', payload)).toEqual({
    status: 500,
    body: { message: 'Server error 500' },
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true }),
  ).toBeVisible();
  const created = await request('customers', 'POST', payload);
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({
    name: payload.name,
    slug: payload.slug,
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true }),
  ).toBeVisible();
  expect(await request('customers/transport-customer')).toEqual({
    status: 200,
    body: created.body,
  });
  expect((await request('customers', 'GET')).body).toMatchObject({
    hasMore: false,
    items: [created.body],
  });
  expect(
    (
      await request('customers/transport-customer', 'PUT', {
        ...payload,
        name: 'Renamed',
      })
    ).body,
  ).toMatchObject({ name: 'Renamed' });
  expect(await request('customers/transport-customer', 'DELETE')).toEqual({
    status: 204,
    body: null,
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true }),
  ).toBeVisible();
  expect((await request('customers')).body.items).toEqual([]);
  expect((await request('customers/transport-customer')).status).toBe(404);
});

test('instance transport filters metadata, serves audit and patches without a body', async ({
  page,
}) => {
  await installInstanceAppMocks(page, createTypedMetadataInstanceModel());
  const audit = createUsageEventsAuditTrailModel();
  await installAuditTrailAppMocks(page, audit);
  await page.goto('/customers/instances');
  await expect(
    page.getByRole('heading', { name: 'Instances', exact: true }),
  ).toBeVisible();
  const results = await page.evaluate(async () => {
    const graph = async (resourceType: string) =>
      (
        await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationName: 'MetadataFields',
            variables: { resourceType },
          }),
        })
      ).json();
    const response = await fetch('/api/instances/acme-production', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DEGRADED' }),
    });
    return {
      patch: { status: response.status, body: await response.text() },
      instance: await graph('INSTANCE'),
      customer: await graph('CUSTOMER'),
    };
  });
  expect(results.patch).toEqual({ status: 204, body: '' });
  expect(results.instance.data.metadataFields.items.length).toBeGreaterThan(0);
  expect(results.customer.data.metadataFields.items).toEqual([]);
  const slug = audit
    .serializeForMsw()
    .entries.find((entry) => entry.instanceSlug)?.instanceSlug;
  expect(slug).toBeTruthy();
  const response = await page.evaluate(
    async (slug) =>
      (await fetch(`/api/instances/${slug}/audit-trails?limit=1`)).json(),
    slug,
  );
  expect(response).toEqual(audit.getInstanceAuditTrail(slug!, { limit: 1 }));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Instances', exact: true }),
  ).toBeVisible();
  const instance = await page.evaluate(async () =>
    (await fetch('/api/instances/acme-production')).json(),
  );
  expect(instance.status).toBe('DEGRADED');
});
