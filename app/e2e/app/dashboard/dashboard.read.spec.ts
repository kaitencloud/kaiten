import { expect, test } from '../_support/app-test';
import { installDashboardAppMocks } from '../_support/mocks/install-dashboard-app-mocks';
import {
  createCalmDashboardModel,
  createDashboardReadModel,
} from './dashboard.scenarios';

test.describe('dashboard read', () => {
  test('redirects "/" to the dashboard and opens on what needs attention', async ({
    page,
  }) => {
    await installDashboardAppMocks(page, createDashboardReadModel());
    await page.goto('/');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    // One main landmark: the shell's, around the page (C-95).
    await expect(page.getByRole('main')).toHaveCount(1);
    const main = page.getByRole('main');
    const attention = main.getByTestId('dashboard-attention');
    await expect(attention.getByText('Needs attention')).toBeVisible();
    await expect(
      attention.getByText(
        'Ninja Osaka has reached its Menu Items limit on Starter',
      ),
    ).toBeVisible();
    await expect(
      main.getByText('Customers', { exact: true }).first(),
    ).toBeVisible();
    await expect(main.getByTestId('dashboard-fleet')).toContainText(
      'Sakura Tokyo',
    );
    await expect(main.getByTestId('dashboard-fleet')).toContainText('At limit');
  });

  test('the Integration tab shows the integration checks and keeps the view in the address', async ({
    page,
  }) => {
    await installDashboardAppMocks(page, createDashboardReadModel());
    await page.goto('/dashboard');

    await page.getByRole('link', { name: /^Integration/ }).click();

    await expect(page).toHaveURL(/\/dashboard\?view=integration$/);
    const main = page.getByRole('main');
    await expect(
      main.getByText('7 usage reports refused in the last 24 hours'),
    ).toBeVisible();
    await expect(main.getByText('Usage reports per day')).toBeVisible();
    await expect(main.getByTestId('dashboard-zones')).toContainText(
      '1 release behind',
    );
  });

  test('the period travels in the address and the defaults are stripped', async ({
    page,
  }) => {
    await installDashboardAppMocks(page, createDashboardReadModel());
    await page.goto('/dashboard?range=7d');

    await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: '30 days' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('a quiet organization reads what was checked', async ({ page }) => {
    await installDashboardAppMocks(page, createCalmDashboardModel());
    await page.goto('/dashboard');

    const attention = page.getByTestId('dashboard-attention');
    await expect(
      attention.getByText('Nothing needs your attention').first(),
    ).toBeVisible();
    await expect(attention.getByText(/Checked at/)).toBeVisible();
  });

  test('a refused summary shows the route error with a retry', async ({
    page,
  }) => {
    const model = createDashboardReadModel();
    model.setReadError(500);
    await installDashboardAppMocks(page, model);

    await page.goto('/dashboard');

    await expect(page.getByText('Something went wrong')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
  });
});
