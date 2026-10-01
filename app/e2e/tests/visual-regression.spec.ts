/**
 * Visual regression tests using Playwright snapshots.
 *
 * These tests capture pixel-perfect screenshots of stable Storybook stories
 * and compare them against a stored baseline. They detect unintentional CSS/layout
 * regressions without any assertion logic.
 *
 * SETUP:
 *   Run
 *   `VISUAL_TESTS=true playwright test e2e/tests/visual-regression.spec.ts --project=chromium --update-snapshots`
 *   once to generate the baseline snapshots. Check them into source control.
 *
 * CI:
 *   The Chromium baselines are committed under
 *   `e2e/tests/visual-regression.spec.ts-snapshots/chromium/` and compared on
 *   every CI run. Differences fail the build.
 *
 * LOCAL:
 *   These tests are skipped locally by default (process.env.CI check).
 *   To run them locally: `VISUAL_TESTS=true playwright test visual-regression`
 */
import { expect, type Page, test } from '@playwright/test';
import { openStorybookStory } from './_storybook-helpers';

// Skip visual regression tests in local non-CI runs to avoid slowing down
// the feedback loop. Set VISUAL_TESTS=true to run them locally.
const skipLocally = !process.env.CI && process.env.VISUAL_TESTS !== 'true';

// Visual regression wants the page fully painted, hence `'networkidle'`.
const openStory = (page: Page, storyId: string) =>
  openStorybookStory(page, storyId, { waitUntil: 'networkidle' });

/** Wait for the customer table shell before asserting row content or screenshots. */
const waitForCustomerTable = async (page: Page) => {
  await expect(
    page.getByRole('columnheader', { name: 'CRM Sync' }),
  ).toBeVisible();
};

test.describe('Visual regression — VariantList', () => {
  test.skip(skipLocally, 'VISUAL_TESTS=true required locally');

  test('boolean-variants renders correctly', async ({ page }) => {
    await openStory(page, 'functionals-variants-variantlist--boolean-variants');
    await expect(page.getByRole('heading', { name: 'Variants' })).toBeVisible();
    await expect(page).toHaveScreenshot('variant-list-boolean.png');
  });

  test('string-variants renders correctly', async ({ page }) => {
    await openStory(page, 'functionals-variants-variantlist--string-variants');
    await expect(
      page.getByRole('button', { name: 'Add Variant' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('variant-list-string.png');
  });

  test('disabled state renders correctly', async ({ page }) => {
    await openStory(page, 'functionals-variants-variantlist--disabled');
    await expect(
      page.getByRole('button', { name: 'Add Variant' }),
    ).toBeDisabled();
    await expect(page).toHaveScreenshot('variant-list-disabled.png');
  });
});

test.describe('Visual regression — TargetingList', () => {
  test.skip(skipLocally, 'VISUAL_TESTS=true required locally');

  test('empty state renders correctly', async ({ page }) => {
    await openStory(page, 'functionals-targeting-targetinglist--empty');
    await expect(
      page.getByRole('button', { name: 'Add First Rule' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('targeting-list-empty.png');
  });

  test('multiple-rules renders correctly', async ({ page }) => {
    await openStory(
      page,
      'functionals-targeting-targetinglist--multiple-rules',
    );
    await expect(page.getByText('Enterprise Customers')).toBeVisible();
    await expect(page).toHaveScreenshot('targeting-list-multiple-rules.png');
  });
});

test.describe('Visual regression — CustomerTable', () => {
  test.skip(skipLocally, 'VISUAL_TESTS=true required locally');

  test('default renders seeded customers', async ({ page }) => {
    await openStory(page, 'features-customers-customertable--default');
    await waitForCustomerTable(page);
    await expect(
      page.getByRole('cell', { name: 'Acme Corp', exact: true }),
    ).toBeVisible();
    // Baseline captured from the CI (Linux) render, unlike the other
    // macOS-generated snapshots: the table's content-driven column widths
    // amplify cross-platform font-metric differences beyond the global
    // tolerance. Don't regenerate it locally — grab the actual from the CI
    // artifact instead.
    await expect(page).toHaveScreenshot('customer-table-default.png');
  });

  test('empty state renders without rows', async ({ page }) => {
    await openStory(page, 'features-customers-customertable--empty');
    await waitForCustomerTable(page);
    await expect(page.getByText('Acme Corp')).toHaveCount(0);
    await expect(page.getByText('No results')).toBeVisible();
    await expect(page).toHaveScreenshot('customer-table-empty.png');
  });
});

test.describe('Visual regression — DataTable', () => {
  test.skip(skipLocally, 'VISUAL_TESTS=true required locally');

  test('default renders the baseline table', async ({ page }) => {
    await openStory(page, 'functionals-datatable--default');
    await expect(page).toHaveScreenshot('data-table-default.png');
  });

  test('paginated renders the pagination controls', async ({ page }) => {
    await openStory(page, 'functionals-datatable--paginated');
    await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
    await expect(page).toHaveScreenshot('data-table-paginated.png');
  });

  test('simple variant renders compact layout', async ({ page }) => {
    await openStory(page, 'functionals-datatable--simple-variant');
    await expect(page).toHaveScreenshot('data-table-simple-variant.png');
  });
});

test.describe('Visual regression — SideNav', () => {
  test.skip(skipLocally, 'VISUAL_TESTS=true required locally');

  test('expanded renders primary destinations', async ({ page }) => {
    await openStory(page, 'routes-sidenav--expanded');
    await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible();
    await expect(page).toHaveScreenshot('side-nav-expanded.png');
  });

  test('collapsed renders rail-only layout', async ({ page }) => {
    await openStory(page, 'routes-sidenav--collapsed');
    await expect(page).toHaveScreenshot('side-nav-collapsed.png');
  });

  test('integrations active highlights the group', async ({ page }) => {
    await openStory(page, 'routes-sidenav--integrations-active');
    await expect(
      page.getByRole('button', { name: /integrations/i }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('side-nav-integrations-active.png');
  });
});

test.describe('Visual regression — Chart', () => {
  test.skip(skipLocally, 'VISUAL_TESTS=true required locally');

  test('line comparison renders', async ({ page }) => {
    await openStory(page, 'components-ui-chart--line-comparison');
    // Recharts renders its paths asynchronously; wait for a visible axis tick.
    await expect(page.getByText('Jan').first()).toBeVisible();
    await expect(page).toHaveScreenshot('chart-line-comparison.png', {
      animations: 'disabled',
    });
  });

  test('bar breakdown renders', async ({ page }) => {
    await openStory(page, 'components-ui-chart--bar-breakdown');
    await expect(page.getByText('Jan').first()).toBeVisible();
    await expect(page).toHaveScreenshot('chart-bar-breakdown.png', {
      animations: 'disabled',
    });
  });
});

// The row lays its cards on a shared subgrid: these catch a label, a value or
// a helper falling off its line, and a dense row that stops being denser.
test.describe('Visual regression — StatCard', () => {
  test.skip(skipLocally, 'VISUAL_TESTS=true required locally');

  test('default row renders', async ({ page }) => {
    await openStory(page, 'functionals-statcard--default');
    await expect(page.getByText('License Expires')).toBeVisible();
    await expect(page).toHaveScreenshot('stat-card-default.png');
  });

  test('dense row renders', async ({ page }) => {
    await openStory(page, 'functionals-statcard--dense');
    await expect(page.getByText('License Expires')).toBeVisible();
    await expect(page).toHaveScreenshot('stat-card-dense.png');
  });

  test('uneven content keeps its lines', async ({ page }) => {
    await openStory(page, 'functionals-statcard--uneven-content');
    await expect(page.getByText('Total zones')).toBeVisible();
    await expect(page).toHaveScreenshot('stat-card-uneven-content.png');
  });

  test('two values render at one size', async ({ page }) => {
    await openStory(page, 'functionals-statcard--two-values');
    await expect(page.getByText('limit reached')).toBeVisible();
    await expect(page).toHaveScreenshot('stat-card-two-values.png');
  });
});

test.describe('Visual regression — Tabs', () => {
  test.skip(skipLocally, 'VISUAL_TESTS=true required locally');

  // Guards the trigger sizing: tabs hug their content instead of stretching
  // across the list, which a primitive swap can silently change.
  test('default renders compact triggers', async ({ page }) => {
    await openStory(page, 'components-ui-tabs--default');
    await expect(page.getByRole('tab', { name: 'Account' })).toBeVisible();
    await expect(page).toHaveScreenshot('tabs-default.png');
  });

  test('line renders an underlined list', async ({ page }) => {
    await openStory(page, 'components-ui-tabs--line');
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page).toHaveScreenshot('tabs-line.png');
  });
});

test.describe('Visual regression — Select', () => {
  test.skip(skipLocally, 'VISUAL_TESTS=true required locally');

  // Guards the trigger sitting flush on its container: Base UI's Select appends
  // a hidden input, which `space-y-*` would turn into a margin under the trigger.
  test('stacked field keeps the trigger flush with the container', async ({
    page,
  }) => {
    await openStory(page, 'components-ui-select--stacked-field');
    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page).toHaveScreenshot('select-stacked-field.png');
  });
});
