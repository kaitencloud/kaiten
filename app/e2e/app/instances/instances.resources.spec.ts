import { expect, test } from '../_support/app-test';
import {
  expectNoAccessibilityViolations,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { InstanceResourcesDriver } from '../_support/drivers/instance-resources.driver';
import { UsageHistoryDriver } from '../_support/drivers/usage-history.driver';
import { startInLanguage } from '../_support/language';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createResourcesInstancesModel } from './instances.scenarios';

// An entitlement that counts per resource has one counter for each resource of the instance (a
// competitor, a source, a project), each against the same limit. Its row on the Entitlements tab
// reads as its highest counter, with how many resources hold one and how many are at the limit,
// and a drawer lists them. Nagare's `sources-per-competitor` is four for each competitor: Stigg
// stands at 2, Schematic at 4, which is the limit, Paid at 3, and fifty-seven others at 1. The
// mocks compute all of it from the counters, as the API does, so what the vendor's product
// reports, and forgets, moves what the console reads.

const PAIR = {
  entitlement: 'sources-per-competitor',
  instance: 'nagare-production',
};
const NAME = 'Sources per competitor';

test.describe('the resources of an entitlement', () => {
  test('are said on the row of the entitlement, beside the figure, which is its highest counter', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(page, createResourcesInstancesModel());

    await resources.goto(PAIR.instance);

    await expect(resources.row(NAME)).toContainText('4');
    await expect(resources.summary(NAME)).toHaveText(
      '60 resources, 1 at limit',
    );
    await expect(resources.summary(NAME)).toHaveAttribute(
      'title',
      'The figure is the highest counter among 60 resources',
    );
    // An entitlement that counts per instance says nothing of the sort.
    await expect(resources.row('API calls')).toContainText('120');
    await expect(resources.summary('API calls')).toHaveCount(0);
    // And so does the usage card above the table, which is where the figure is read first.
    await expect(
      page.locator('[data-slot="card"]').filter({ hasText: /Usage Overview/ }),
    ).toContainText('60 resources, 1 at limit');
  });

  test('are listed by the drawer the caption opens, fifty at a time, in the order of their keys, and the rest is read on request', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(page, createResourcesInstancesModel());
    await resources.goto(PAIR.instance);

    await resources.open(NAME);

    await expect(page).toHaveURL(
      /\/entitlements\?resources=sources-per-competitor$/,
    );
    await expect(resources.drawer()).toContainText(
      `${NAME} on Nagare Production: one counter for each resource, each measured against the same limit (4).`,
    );
    await expect(resources.headers()).toHaveText([
      'Resource',
      'Usage',
      'Status',
      'Reports',
      'History',
    ]);
    await expect(resources.rows()).toHaveCount(50);
    await expect(resources.rows().first()).toContainText('competitor-01');
    await expect(resources.rows().last()).toContainText('competitor-50');

    await resources.loadMore().click();

    await expect(resources.rows()).toHaveCount(60);
    await expect(resources.loadMore()).toHaveCount(0);
    // The order is the API's, bytewise: the competitors, then Paid, Schematic and Stigg.
    await expect(resources.rows().nth(57)).toContainText('paid');
    await expect(resources.rows().nth(58)).toContainText('schematic');
    await expect(resources.rows().nth(59)).toContainText('stigg');
    // Each says where its counter stands against the limit all of them share.
    await expect(resources.row$('schematic')).toContainText('Limit reached');
    await expect(resources.row$('schematic')).toContainText('4');
    await expect(resources.row$('stigg')).toContainText('Watch');
    await expect(resources.row$('competitor-01')).toContainText('Healthy');
  });

  test('link each resource to the usage history narrowed to it, which a chip says and takes off', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    const history = new UsageHistoryDriver(page);
    await installInstanceAppMocks(page, createResourcesInstancesModel());
    await resources.goto(PAIR.instance);
    await resources.open(NAME);
    await resources.loadMore().click();
    await expect(resources.rows()).toHaveCount(60);

    await resources.historyLink(NAME, 'stigg').click();

    // The list gives way to the history: one drawer at a time.
    await expect(page).toHaveURL(
      /\/entitlements\?history=sources-per-competitor&resource=stigg$/,
    );
    await expect(resources.drawer()).toHaveCount(0);
    await expect(history.drawer()).toContainText('Resource: stigg');
    // Stigg reported twice, and its reports are not contiguous in the journal of the pair.
    await expect(history.rows()).toHaveCount(2);
    await expect(history.headers()).toContainText([
      'Report',
      'Reported at',
      'Resource',
    ]);
    await expect(history.rows().first()).toContainText('stigg');
    await expect(history.rows().last()).toContainText('stigg');
    await expect(history.rows().first()).toContainText('0 → 1');
    await expect(history.rows().last()).toContainText('1 → 2');

    await history
      .drawer()
      .getByRole('button', { name: 'Show the reports of every resource' })
      .click();

    await expect(page).toHaveURL(
      /\/entitlements\?history=sources-per-competitor$/,
    );
    await expect(history.rows()).toHaveCount(4);
    await expect(history.drawer()).not.toContainText('Resource: stigg');
  });

  test('close with the drawer, which takes its entitlement off the URL', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(page, createResourcesInstancesModel());
    await resources.goto(PAIR.instance);

    await resources.open(NAME);
    await resources.close();

    await expect(page).toHaveURL(/\/entitlements$/);
    await expect(resources.summary(NAME)).toBeVisible();
  });

  test('are opened by a link, which a reload keeps, and a link that names no such entitlement opens the page as it is', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(page, createResourcesInstancesModel());

    await resources.goto(PAIR.instance, '?resources=sources-per-competitor');
    await expect(resources.drawer()).toBeVisible();
    await page.reload();
    await expect(resources.drawer()).toBeVisible();
    await expect(resources.rows()).toHaveCount(50);

    // An entitlement that counts per instance has no resources to list.
    await resources.goto(PAIR.instance, '?resources=api-calls');
    await expect(page).toHaveURL(/\/entitlements$/);
    await expect(resources.drawer()).toHaveCount(0);
    await expect(resources.row('API calls')).toBeVisible();
  });
});

// The vendor's product reports usage for a resource, and forgets it when the object is deleted.
// The console never does either: it reads what the instance now says, from the mocks that
// compute it as the API does.
test.describe('what the product of the vendor does', () => {
  test('moves the highest counter and what is at the limit with each report, and a refused report moves nothing', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(page, createResourcesInstancesModel());
    await resources.goto(PAIR.instance);
    await expect(resources.summary(NAME)).toHaveText(
      '60 resources, 1 at limit',
    );

    // Paid reaches the limit, and a competitor nobody followed yet is followed.
    const paid = await resources.report({ ...PAIR, resource: 'paid' }, 1);
    const newco = await resources.report({ ...PAIR, resource: 'newco' }, 2);
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({
      resourceKey: 'paid',
      value: { type: 'number', value: 4 },
    });
    expect(newco.status).toBe(200);
    await page.reload();
    await expect(resources.summary(NAME)).toHaveText(
      '61 resources, 2 at limit',
    );
    await expect(resources.row(NAME)).toContainText('4');

    // Schematic is at the limit: one more is refused, as a hard limit refuses it, for it alone.
    const refused = await resources.report(
      { ...PAIR, resource: 'schematic' },
      1,
    );
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      code: 'ReportEntitlementUsageMetric.ThresholdExceeded',
    });
    await page.reload();
    await expect(resources.summary(NAME)).toHaveText(
      '61 resources, 2 at limit',
    );
  });

  test('lowers the figure when the highest counter is lowered or forgotten, down to the next one', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(page, createResourcesInstancesModel());
    await resources.goto(PAIR.instance);

    // Schematic is forgotten: Paid's 3 is the highest, and nobody is at the limit.
    expect(await resources.forget({ ...PAIR, resource: 'schematic' })).toBe(
      204,
    );
    await page.reload();
    await expect(resources.summary(NAME)).toHaveText(
      '59 resources, 0 at limit',
    );
    await expect(resources.row(NAME)).toContainText('3');

    // Paid is corrected down by a set: Stigg's 2 is the highest.
    const set = await resources.report({ ...PAIR, resource: 'paid' }, 1, {
      behavior: 'set',
    });
    expect(set.status).toBe(200);
    await page.reload();
    await expect(resources.row(NAME)).toContainText('2');
    await expect(resources.summary(NAME)).toHaveText(
      '59 resources, 0 at limit',
    );

    // Forgetting is idempotent: a resource that is gone is forgotten.
    expect(await resources.forget({ ...PAIR, resource: 'schematic' })).toBe(
      204,
    );
  });

  test('is read by the drawer too: a report makes a resource, and forgetting it takes it away', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(
      page,
      createResourcesInstancesModel({ competitors: 3 }),
    );
    await resources.goto(PAIR.instance);

    await resources.report({ ...PAIR, resource: 'acme' }, 1);
    await page.reload();
    await resources.open(NAME);

    await expect(resources.rows()).toHaveCount(4);
    await expect(resources.row$('acme')).toContainText('Healthy');

    await resources.forget({ ...PAIR, resource: 'acme' });
    await page.reload();
    await expect(resources.rows()).toHaveCount(3);
    await expect(resources.row$('acme')).toHaveCount(0);
  });

  test('is counted once for a key sent twice, and again for the same key on another resource', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(page, createResourcesInstancesModel());
    await resources.goto(PAIR.instance);
    const key = { idempotencyKey: 'source-created:9f2c' };

    const first = await resources.report(
      { ...PAIR, resource: 'stigg' },
      1,
      key,
    );
    const replay = await resources.report(
      { ...PAIR, resource: 'stigg' },
      1,
      key,
    );
    const other = await resources.report({ ...PAIR, resource: 'paid' }, 1, key);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(other.replayed).toBe(false);
    await page.reload();
    await resources.open(NAME);
    await resources.loadMore().click();
    await expect(resources.row$('stigg')).toContainText('3');
    await expect(resources.row$('paid')).toContainText('4');
  });
});

test.describe('a refusal of the API', () => {
  test('is said in the drawer, in its own words, with a way to ask again', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    const model = createResourcesInstancesModel();
    model.resources.armProblem('listEntitlementResources', {
      code: 'ListEntitlementResources.Unavailable',
      detail: 'The usage store is not answering',
      status: 503,
    });
    await installInstanceAppMocks(page, model);

    await resources.goto(PAIR.instance, '?resources=sources-per-competitor');

    await expect(resources.error()).toContainText(
      'The usage store is not answering',
    );
    await resources.error().getByRole('button', { name: 'Retry' }).click();
    await expect(resources.rows()).toHaveCount(50);
    await expect(resources.error()).toHaveCount(0);
  });

  test('says there are none for an entitlement nothing was reported for', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(
      page,
      createResourcesInstancesModel({ competitors: 0 }),
    );

    await resources.goto(PAIR.instance);
    await expect(resources.summary(NAME)).toHaveText('No resource yet');
    // Nothing to open: the link is for a list that has something in it.
    await expect(page.getByRole('link', { name: /resource/ })).toHaveCount(0);
    await resources.goto(PAIR.instance, '?resources=sources-per-competitor');

    await expect(resources.empty()).toContainText('No resources');
  });
});

test.describe('the resources in French', () => {
  test('are said with the words of the locales', async ({ page }) => {
    const resources = new InstanceResourcesDriver(page);
    await startInLanguage(page, 'fr');
    await installInstanceAppMocks(page, createResourcesInstancesModel());

    await resources.goto(PAIR.instance);
    await expect(resources.summary(NAME)).toHaveText(
      '60 ressources, 1 à la limite',
    );
    await resources.open(NAME);

    await expect(resources.drawer()).toContainText('Ressources');
    await expect(resources.drawer()).toContainText(
      'un compteur par ressource, chacun mesuré face à la même limite (4)',
    );
    await expect(resources.headers()).toHaveText([
      'Ressource',
      'Utilisation',
      'Statut',
      'Rapports',
      'Historique',
    ]);
  });
});

test.describe('the drawer of the resources', () => {
  test('has no accessibility violation, and keeps the focus where a keyboard puts it', async ({
    page,
  }) => {
    const resources = new InstanceResourcesDriver(page);
    await installInstanceAppMocks(page, createResourcesInstancesModel());
    await resources.goto(PAIR.instance);
    await useLightTheme(page);

    await resources.open(NAME);
    await expect(resources.rows()).toHaveCount(50);

    await expectNoAccessibilityViolations(page);
    await page.keyboard.press('Escape');
    await expect(resources.drawer()).toHaveCount(0);
  });
});
