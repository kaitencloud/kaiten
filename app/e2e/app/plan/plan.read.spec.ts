import type { Locator, Request, Response } from '@playwright/test';
import { expect, recordWrites, test } from '../_support/app-test';
import { PlanPageDriver } from '../_support/drivers/plan.driver';
import { installPlanAppMocks } from '../_support/mocks/install-plan-app-mocks';
import { createPlanModel } from './plan.scenarios';

// The organization's own plan on Kaiten Cloud, drawn by Kaiten's React SDK under the
// console's heading. saas-api mints one customer session; the SDK reads the portal and
// the invoices from Kaiten Cloud's public surface with it, and the plans on sale with
// the console's publishable key. Northwind Software is on Cloud Starter, free. What the
// plan has used is the SDK's usage block, not the portal's meters: it lists every numeric
// quota, the unlimited ones too, which the meters leave out.

const KAITEN_CLOUD = 'https://kaiten-cloud.test/api';

/** Where a part of the page starts and ends, from the top of the page. */
async function verticalExtent(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();

  return { bottom: (box?.y ?? 0) + (box?.height ?? 0), top: box?.y ?? 0 };
}

test.describe('the plan of the organization', () => {
  test('shows the plan it is on, its card and its invoices', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto();

    await expect(plan.heading()).toBeVisible();
    await expect(
      page.getByText(
        'Your organization’s Kaiten Cloud plan: what it includes, what you use, and how you pay.',
      ),
    ).toBeVisible();
    await expect(plan.currentPlan()).toContainText('Cloud Starter');
    await expect(plan.currentPlanPrice()).toHaveText('$0.00/month');
    await expect(plan.currentPlan()).toContainText('Renews on Dec 1, 2026');
    await expect(plan.paymentMethod()).toContainText('Visa •••• 4242');
    await expect(plan.invoices()).toHaveCount(3);
    await expect(plan.invoices().first()).toContainText(
      'Nov 1, 2026 – Dec 1, 2026',
    );
    await expect(plan.invoices().last()).toContainText('Activation');
  });

  test('shows what the plan has used, the unlimited quotas included, and not the portal’s meters', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto();

    await expect(
      plan.usage().getByRole('heading', { level: 2, name: 'Cloud Starter' }),
    ).toBeVisible();
    // A quota something caps has its figures, the share used and a bar...
    const customers = plan.usageRow('Managed customers');
    await expect(customers).toContainText('9 / 25');
    await expect(customers).toContainText('36%');
    await expect(
      customers.getByRole('progressbar', { name: 'Managed customers: 9 / 25' }),
    ).toBeVisible();
    // ...and a counter that resets each month says over which month it counts.
    const webhooks = plan.usageRow('Webhook events');
    await expect(webhooks).toContainText('870 / 1,000');
    await expect(webhooks).toContainText('87%');
    await expect(webhooks).toContainText('Nov 1, 2026');
    await expect(webhooks).toContainText('Dec 1, 2026');
    await expect(
      webhooks.getByRole('progressbar', {
        name: 'Webhook events: 870 / 1,000',
      }),
    ).toBeVisible();
    // A quota nothing caps has what is used out of "Unlimited", and nothing to fill.
    for (const [name, figures] of [
      ['Instances', '14 / Unlimited'],
      ['Console users', '4 / Unlimited'],
    ]) {
      await expect(plan.usageRow(name)).toContainText(figures);
      await expect(plan.usageRow(name).getByRole('progressbar')).toHaveCount(0);
    }
    await expect(plan.usage().getByRole('listitem')).toHaveCount(4);
    // The portal's meters would draw the capped quotas a second time and leave the
    // unlimited ones out: the usage block takes their place.
    await expect(plan.usageMeters()).toHaveCount(0);
    await expect(page.getByText('9 / 25')).toHaveCount(1);
    await expect(plan.usage()).toHaveCount(1);
  });

  test('draws the usage between what the plan includes and how it is paid', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto();
    await expect(plan.usageRow('Webhook events')).toBeVisible();
    await expect(plan.invoices()).toHaveCount(3);

    const features = await verticalExtent(plan.includedFeatures());
    const usage = await verticalExtent(plan.usage());
    const payment = await verticalExtent(plan.paymentMethod());
    const invoices = await verticalExtent(plan.invoices().first());
    // Below the plan and its features, above the card, the voucher and the invoices: the
    // page's subtitle reads in that order, what it includes, what you use, how you pay.
    expect(usage.top).toBeGreaterThanOrEqual(features.bottom);
    expect(payment.top).toBeGreaterThanOrEqual(usage.bottom);
    expect(invoices.top).toBeGreaterThan(payment.bottom);
  });

  test('keeps the gap of the page between the portal and the plan change', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto();
    await expect(plan.plans()).toContainText('Cloud Growth');

    const portal = await plan.portal().last().boundingBox();
    const change = await plan.change().boundingBox();
    expect(portal).not.toBeNull();
    expect(change).not.toBeNull();
    // The SDK resets the margins of its own elements outside any cascade layer, so a
    // margin of Tailwind's on the portal is lost: the gap is the wrapper's, 2rem.
    expect(
      (change?.y ?? 0) - ((portal?.y ?? 0) + (portal?.height ?? 0)),
    ).toBeCloseTo(32, 0);
  });

  test('mints one session, which the SDK sends to Kaiten Cloud, reads the portal once, and reads the plans with the key', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    const minted = recordWrites(page, /^\/api\/plan\/session$/);
    // Recorded, not awaited: a wait armed before the navigation would have to see the
    // page load, draw and mint within one action timeout, and a navigation of the dev
    // server on a CI runner takes most of that alone. The page drawn below is the wait.
    const sessions: Response[] = [];
    const portalReads: Request[] = [];
    const catalogReads: Request[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/plan/session') {
        sessions.push(response);
      }
    });
    page.on('request', (request) => {
      if (request.url() === `${KAITEN_CLOUD}/public/session/portal`) {
        portalReads.push(request);
      }
      if (request.url().startsWith(`${KAITEN_CLOUD}/public/catalog`)) {
        catalogReads.push(request);
      }
    });
    await plan.goto();
    await expect(plan.invoices()).toHaveCount(3);
    await expect(plan.usageRow('Managed customers')).toBeVisible();
    await expect(plan.plans()).toContainText('Cloud Growth');

    expect(minted).toHaveLength(1);
    expect(sessions).toHaveLength(1);
    const { token } = (await sessions[0].json()) as { token: string };
    expect(token).toMatch(/^kst_/);
    // The plan, its usage and its card read the one portal the provider holds.
    expect(portalReads).toHaveLength(1);
    expect(portalReads[0].headers().authorization).toBe(`Bearer ${token}`);
    expect(catalogReads).not.toHaveLength(0);
    for (const catalogRead of catalogReads) {
      const catalog = catalogRead.headers();
      expect(catalog['kaiten-publishable-key']).toMatch(/^pk_/);
      expect(catalog.authorization).toBeUndefined();
    }
  });

  test('is offered from the settings, where the organization has it', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await page.goto('/settings');

    await page.getByRole('link', { name: 'Open plan & usage' }).click();

    await expect(page).toHaveURL(/\/settings\/plan$/);
    await expect(plan.heading()).toBeVisible();
    await expect(plan.currentPlanPrice()).toHaveText('$0.00/month');
  });

  test('does not exist for an organization plan-billing leaves out, which mints nothing', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel(), { planBilling: false });
    const minted = recordWrites(page, /^\/api\/plan\/session$/);
    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Open plan & usage' }),
    ).toHaveCount(0);

    await plan.goto();

    await expect(
      page.getByRole('main').getByText('Page not found'),
    ).toBeVisible();
    expect(minted).toEqual([]);
  });
});
