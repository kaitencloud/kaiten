import { expect, recordWrites, test } from '../_support/app-test';
import { PlanPageDriver } from '../_support/drivers/plan.driver';
import { installPlanAppMocks } from '../_support/mocks/install-plan-app-mocks';
import { createPlanModel } from './plan.scenarios';

// The organization's own plan on Kaiten Cloud, drawn by Kaiten's React SDK under the
// console's heading. saas-api mints one customer session; the SDK reads the portal and
// the invoices from Kaiten Cloud's public surface with it, and the plans on sale with
// the console's publishable key. Northwind Software is on Cloud Starter, free.

const KAITEN_CLOUD = 'https://kaiten-cloud.test/api';

test.describe('the plan of the organization', () => {
  test('shows the plan it is on, what it uses, its card and its invoices', async ({
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
    await expect(plan.portal()).toContainText('Cloud Starter');
    await expect(plan.currentPlanPrice()).toHaveText('$0.00/month');
    await expect(plan.portal()).toContainText('Renews on Dec 1, 2026');
    await expect(plan.portal()).toContainText('9 / 25');
    await expect(plan.portal()).toContainText('Visa •••• 4242');
    await expect(plan.invoices()).toHaveCount(3);
    await expect(plan.invoices().first()).toContainText(
      'Nov 1, 2026 – Dec 1, 2026',
    );
    await expect(plan.invoices().last()).toContainText('Activation');
  });

  test('keeps the gap of the page between the portal and the plan change', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto();
    await expect(plan.plans()).toContainText('Cloud Growth');

    const portal = await plan.portal().boundingBox();
    const change = await plan.change().boundingBox();
    expect(portal).not.toBeNull();
    expect(change).not.toBeNull();
    // The SDK resets the margins of its own elements outside any cascade layer, so a
    // margin of Tailwind's on the portal is lost: the gap is the wrapper's, 2rem.
    expect(
      (change?.y ?? 0) - ((portal?.y ?? 0) + (portal?.height ?? 0)),
    ).toBeCloseTo(32, 0);
  });

  test('mints one session, which the SDK sends to Kaiten Cloud, and reads the plans with the key', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    const minted = recordWrites(page, /^\/api\/plan\/session$/);
    const session = page.waitForResponse(/\/api\/plan\/session$/);
    const portalRead = page.waitForRequest(
      `${KAITEN_CLOUD}/public/session/portal`,
    );
    const catalogRead = page.waitForRequest((request) =>
      request.url().startsWith(`${KAITEN_CLOUD}/public/catalog`),
    );
    await plan.goto();
    await expect(plan.invoices()).toHaveCount(3);
    await expect(plan.plans()).toContainText('Cloud Growth');

    const { token } = (await (await session).json()) as { token: string };
    expect(token).toMatch(/^kst_/);
    expect((await portalRead).headers().authorization).toBe(`Bearer ${token}`);
    const catalog = (await catalogRead).headers();
    expect(catalog['kaiten-publishable-key']).toMatch(/^pk_/);
    expect(catalog.authorization).toBeUndefined();
    expect(minted).toHaveLength(1);
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
