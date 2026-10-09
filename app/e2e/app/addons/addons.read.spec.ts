import { expect, test } from '../_support/app-test';
import { AddonDetailDriver } from '../_support/drivers/addon-detail.driver';
import { AddonsListDriver } from '../_support/drivers/addons-list.driver';
import { FilterToolbarDriver } from '../_support/drivers/filter-toolbar.driver';
import { installAddonsWorld } from './install-addons-world';

// The catalogue of add-ons: every family with its versions, to search and filter, and the
// page of one version with its overview, its entitlements, its prices and the licenses it
// fits. Extra seats has a first version on sale (the default of its family) and a draft;
// Extra tokens is on sale; Priority support has its first version withdrawn and a second
// sold on request.

test.describe('the catalogue', () => {
  test('lists every family with how many versions it has, its default and whether it is public', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    await installAddonsWorld(page);

    await list.goto();

    await expect(list.family('Extra seats')).toContainText('2 versions');
    await expect(list.family('Extra seats')).toContainText('Default: 2026');
    await expect(list.family('Extra tokens')).toContainText('1 version');
    await expect(list.family('Priority support')).toContainText('2 versions');
    await expect(list.family('Priority support')).toContainText(
      'Default: 2026',
    );
    await expect(list.publicBadge('Extra seats')).toBeVisible();
    await expect(list.publicBadge('Extra tokens')).toHaveCount(0);
  });

  test('lists the versions of a family with how each is sold, its state, its default and the most an instance can hold', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    await installAddonsWorld(page);
    await list.goto();

    await list.expandFamily('Extra seats');
    await list.expandFamily('Priority support');

    await list.expectVersionState('Extra seats', '2026', 'Published');
    await list.expectVersionState('Extra seats', '2027', 'Draft');
    await expect(list.versionRow('Extra seats', '2026')).toContainText('Paid');
    await expect(list.versionRow('Extra seats', '2026')).toContainText(
      'Default',
    );
    await expect(list.versionRow('Extra seats', '2026')).toContainText('3');
    await expect(list.versionRow('Extra seats', '2027')).toContainText('10');
    await list.expectVersionState('Priority support', '2025', 'Archived');
    await list.expectVersionState('Priority support', '2026', 'Published');
    await expect(list.versionRow('Priority support', '2026')).toContainText(
      'Custom',
    );
    // A version with no maximum has an unbounded quantity.
    await list.expandFamily('Extra tokens');
    await expect(list.versionRow('Extra tokens', '2026')).toContainText(
      'Unbounded',
    );
  });

  test('offers each version the one transition its state accepts', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    await installAddonsWorld(page);
    await list.goto();
    await list.expandFamily('Extra seats');
    await list.expandFamily('Priority support');

    await expect(list.action('Extra seats', '2027', 'Publish')).toBeEnabled();
    await expect(
      list.action('Priority support', '2025', 'Unarchive'),
    ).toBeEnabled();
    // The default of a family cannot be archived.
    await expect(list.action('Extra seats', '2026', 'Archive')).toBeDisabled();
  });

  test('searches the families by name, and says when none matches', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    await installAddonsWorld(page);
    await list.goto();

    await list.searchField().fill('tokens');

    await expect(list.family('Extra tokens')).toBeVisible();
    await expect(list.family('Extra seats')).toHaveCount(0);

    await list.searchField().fill('zzz');
    await expect(page.getByText('No results')).toBeVisible();
    await list.searchField().fill('');
    await expect(list.family('Extra seats')).toBeVisible();
  });

  test('filters the versions by state, and lists a family when any of its versions is kept', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const filters = new FilterToolbarDriver(page);
    await installAddonsWorld(page);
    await list.goto();

    await filters.addFilter('State');
    await filters.pick('Archived');
    await filters.closeEditor();

    await expect(list.family('Priority support')).toBeVisible();
    await expect(list.family('Extra seats')).toHaveCount(0);
    await expect(list.family('Extra tokens')).toHaveCount(0);
    await list.expandFamily('Priority support');
    await expect(list.versionRow('Priority support', '2025')).toBeVisible();
    await expect(list.versionRow('Priority support', '2026')).toHaveCount(0);
  });

  test('opens a version from its row, on its own page', async ({ page }) => {
    const list = new AddonsListDriver(page);
    const detail = new AddonDetailDriver(page);
    await installAddonsWorld(page);
    await list.goto();

    await list.expandFamily('Extra seats');
    await list.openVersion('Extra seats', '2027');

    await expect(page).toHaveURL('/catalog/addons/extra-seats-v2');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Extra seats' }),
    ).toBeVisible();
    await detail.expectState('Draft');
  });

  test('says there is nothing to show of a page that is none', async ({
    page,
  }) => {
    await installAddonsWorld(page);

    await page.goto('/catalog/addons/no-such-version');

    await expect(page.getByText('Page not found')).toBeVisible();
  });
});

test.describe('a version', () => {
  test('says what it is: its name and number, how it is sold, its state, its default and the most an instance can hold', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);
    await installAddonsWorld(page);

    await detail.goto('extra-seats-v1', 'Extra seats');

    await detail.expectState('Published');
    await expect(detail.field('Name')).toContainText('Extra seats');
    await expect(detail.field('Version')).toContainText('1 (2026)');
    await expect(detail.field('Default')).toContainText('Default version');
    await expect(detail.field('Pricing')).toContainText('Paid');
    await expect(detail.field('Max quantity')).toContainText('3');
    await expect(detail.field('Description')).toContainText(
      'Five more named users a unit',
    );
  });

  test('offers four tabs, each a page of its own that a link opens', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);
    await installAddonsWorld(page);
    await detail.goto('extra-seats-v1', 'Extra seats');

    await expect(detail.tabs()).toHaveText([
      'Overview',
      'Entitlements',
      'Prices',
      'Compatible licenses',
    ]);
    await detail.tab('Entitlements').click();
    await expect(page).toHaveURL('/catalog/addons/extra-seats-v1/entitlements');
    await detail.tab('Prices').click();
    await expect(page).toHaveURL('/catalog/addons/extra-seats-v1/prices');
    await detail.tab('Compatible licenses').click();
    await expect(page).toHaveURL(
      '/catalog/addons/extra-seats-v1/compatibility',
    );
    await detail.tab('Overview').click();
    await expect(page).toHaveURL('/catalog/addons/extra-seats-v1');

    await page.goto('/catalog/addons/extra-seats-v1/prices');
    await expect(detail.tab('Prices')).toHaveAttribute('aria-selected', 'true');
  });

  test('is named after the add-on in the title of the page', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);
    await installAddonsWorld(page);

    await detail.goto('priority-support-v2', 'Priority support');

    await expect(page).toHaveTitle(/Priority support/);
  });
});
