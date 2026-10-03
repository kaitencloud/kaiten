import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import type { DevToken } from '../../src/lib/local-auth';
import { CustomersListDriver } from '../app/_support/drivers/customers-list.driver';
import { CustomerFormDriver } from '../app/_support/drivers/customer-form.driver';

const tokens: DevToken[] = JSON.parse(
  readFileSync(process.env.STACK_TOKENS_FILE!, 'utf8'),
);
const actor = tokens[0]!;
const other = tokens.find((t) => t.org_id !== actor.org_id)!;
const api = process.env.STACK_API_URL!;

async function signIn(page: Page, token = actor) {
  await page.addInitScript((token) => {
    if (!localStorage.getItem('kaiten_dev_token'))
      localStorage.setItem('kaiten_dev_token', token);
  }, token.token);
  await page.goto('/customers');
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => '__KAITEN_MSW_RUNNING__' in window)).toBe(
    false,
  );
}
test('creates and rereads a customer through the authenticated gateway', async ({
  page,
}) => {
  await signIn(page);
  const list = new CustomersListDriver(page);
  await list.openCreateDialog();
  const form = new CustomerFormDriver(page);
  await form.fill({
    name: 'Stack Customer',
    domain: 'stack.example',
    externalCustomerId: 'stack-1',
  });
  await form.createButton().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Stack Customer',
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Stack Customer',
  );
  await list.goto();
  await list.expectCustomerVisible('Stack Customer');
});

test('rejects missing credentials and keeps another tenant isolated', async ({
  request,
}) => {
  expect((await request.get(`${api}/api/customers`)).status()).toBe(401);
  expect(
    (
      await request.post(`${api}/api/customers`, {
        headers: {
          Authorization: `Bearer ${process.env.STACK_READ_ONLY_TOKEN}`,
        },
        data: { name: 'Refused', slug: 'refused' },
      })
    ).status(),
  ).toBe(403);
  const response = await request.post(`${api}/api/customers`, {
    headers: { Authorization: `Bearer ${actor.token}` },
    data: { name: 'Private Tenant Customer', slug: 'private-tenant-customer' },
  });
  expect(response.status()).toBe(201);
  expect(
    (
      await request.get(`${api}/api/customers/private-tenant-customer`, {
        headers: { Authorization: `Bearer ${other.token}` },
      })
    ).status(),
  ).toBe(404);
});

test('deploys a release and reads it from the zone and GraphQL overview', async ({
  page,
  request,
}) => {
  const headers = { Authorization: `Bearer ${actor.token}` };
  const releaseResponse = await request.post(`${api}/api/releases`, {
    headers,
    data: { version: 'stack-1', components: [] },
  });
  expect(releaseResponse.status()).toBe(201);
  const release = await releaseResponse.json();
  const zoneResponse = await request.post(`${api}/api/deployment-zones`, {
    headers,
    data: {
      name: 'Stack Zone',
      description: 'Integration smoke',
      slug: 'stack-zone',
      type: 'production',
      metadata: {},
    },
  });
  expect(zoneResponse.status()).toBe(201);
  expect(
    (
      await request.put(`${api}/api/deployment-zones/stack-zone`, {
        headers,
        data: {
          name: 'Stack Zone',
          description: 'Integration smoke',
          type: 'production',
          releaseId: release.id,
          metadata: {},
        },
      })
    ).status(),
  ).toBe(204);
  await signIn(page);
  await page.goto('/releases/deployment-zones/stack-zone');
  await expect(
    page.getByText('stack-1', { exact: true }).first(),
  ).toBeVisible();
  const overview = await request.post(`${api}/api/graphql`, {
    headers,
    data: {
      query: 'query { releases { items { id deploymentZones { slug } } } }',
    },
  });
  expect((await overview.json()).data.releases.items).toContainEqual(
    expect.objectContaining({
      id: release.id,
      deploymentZones: expect.arrayContaining([
        expect.objectContaining({ slug: 'stack-zone' }),
      ]),
    }),
  );
});

test('authenticates SSE by cookie and receives a real notification', async ({
  page,
  request,
}) => {
  await signIn(page);
  const connected = page.evaluate(
    async (api) =>
      new Promise<boolean>((resolve, reject) => {
        const source = new EventSource(`${api}/api/v1/notifications/stream`, {
          withCredentials: true,
        });
        source.addEventListener('connected', () => {
          source.close();
          resolve(true);
        });
        source.onerror = () => {
          source.close();
          reject(new Error('SSE authentication failed'));
        };
      }),
    api,
  );
  expect(await connected).toBe(true);
  await page.evaluate((api) => {
    const target = window as Window & { stackNotification?: Promise<string> };
    target.stackNotification = new Promise((resolve, reject) => {
      const source = new EventSource(`${api}/api/v1/notifications/stream`, {
        withCredentials: true,
      });
      source.addEventListener('notification', (event) => {
        source.close();
        resolve((event as MessageEvent).data);
      });
      source.onerror = () => {
        source.close();
        reject(new Error('Notification SSE failed'));
      };
    });
  }, api);
  const created = await request.post(`${api}/api/customers`, {
    headers: { Authorization: `Bearer ${actor.token}` },
    data: { name: 'Notification Customer', slug: 'notification-customer' },
  });
  expect(created.status()).toBe(201);
  const event = await page.evaluate(
    () =>
      (window as Window & { stackNotification?: Promise<string> })
        .stackNotification,
  );
  expect(event).toContain('Notification Customer');
  await expect
    .poll(
      async () => {
        const response = await request.get(`${api}/api/v1/notifications`, {
          headers: { Authorization: `Bearer ${actor.token}` },
        });
        return (await response.json()).data?.length ?? 0;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  // A malformed cookie cannot borrow the authenticated header of ordinary calls.
  expect(
    (
      await request.get(`${api}/api/v1/notifications/stream`, {
        headers: { Cookie: '__session=invalid' },
        timeout: 5000,
      })
    ).status(),
  ).toBe(401);
});

test('switches organization without retaining the previous customer cache', async ({
  page,
}) => {
  await signIn(page);
  const list = new CustomersListDriver(page);
  await list.expectCustomerVisible('Stack Customer');
  // Selecting the real dev switcher's account navigates to a fresh app document.
  await page.getByRole('button', { name: new RegExp(actor.org_name) }).click();
  await page.getByRole('button', { name: new RegExp(other.org_name) }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(other.email) })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await list.goto();
  await list.expectCustomerHidden('Stack Customer');
});
