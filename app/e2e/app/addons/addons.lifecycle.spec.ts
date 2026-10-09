import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { AddonDetailDriver } from '../_support/drivers/addon-detail.driver';
import { AddonFormDriver } from '../_support/drivers/addon-form.driver';
import { AddonsListDriver } from '../_support/drivers/addons-list.driver';
import {
  createAddonsBillingModel,
  createEmptyAddonsBillingModel,
} from './addons.scenarios';
import { installAddonsWorld } from './install-addons-world';

// The life of an add-on: a family is made with its first version, which starts as a draft,
// each next version starts empty, and a version moves along draft, published and
// archived, one confirmed step at a time. The default of a family is a published version.
// Extra seats has a first version on sale that an instance holds, and a draft; Extra
// tokens is on sale; Priority support has its first version withdrawn.

const ADDON_WRITES = /^\/api\/(addons|addon-families)(\/[^/]+(\/[^/]+)?)?$/;

test.describe('making an add-on', () => {
  test('makes the first version of a new family as a draft, and opens it', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const form = new AddonFormDriver(page);
    const detail = new AddonDetailDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page, createEmptyAddonsBillingModel());

    await list.goto();
    await expect(list.empty()).toBeVisible();
    await list.newAddon().click();
    await form.expectOpen('New add-on');
    await expect(page).toHaveURL('/addons/new');

    // A new add-on is a draft until the person says otherwise, and priced; it needs a name.
    await expect(form.draftCheckbox()).toBeChecked();
    await form.submit();
    await expect(form.dialog().getByText('Name is required')).toBeVisible();
    expect(writes).toEqual([]);
    await form.fill({
      description: 'Ten more projects',
      maxQuantity: '5',
      name: 'Extra projects',
    });
    await form.submit();

    await expectToast(page, 'Add-on created');
    await expect(page).toHaveURL('/addons/extra-projects');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Extra projects' }),
    ).toBeVisible();
    await detail.expectState('Draft');
    await expect(detail.field('Max quantity')).toContainText('5');
    // The API names the slug and the version when the form leaves them out.
    expect(writes).toEqual([
      {
        body: {
          description: 'Ten more projects',
          lifecycleState: 'DRAFT',
          maxQuantity: 5,
          name: 'Extra projects',
          pricingType: 'PAID',
        },
        method: 'POST',
        pathname: '/api/addons',
      },
    ]);
  });

  test('sends the slug and the version name that were typed, and a version put on sale at once', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const form = new AddonFormDriver(page);
    const detail = new AddonDetailDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page, createEmptyAddonsBillingModel());

    await list.goto();
    await list.newAddon().click();
    await form.expectOpen('New add-on');
    await form.fill({
      draft: false,
      name: 'Extra history',
      pricingType: 'Free',
      slug: 'history-pack',
      versionName: 'Launch',
    });
    await form.submit();

    await expect(page).toHaveURL('/addons/history-pack');
    await detail.expectState('Published');
    expect(writes).toEqual([
      {
        body: {
          description: '',
          lifecycleState: 'PUBLISHED',
          name: 'Extra history',
          pricingType: 'FREE',
          slug: 'history-pack',
          versionName: 'Launch',
        },
        method: 'POST',
        pathname: '/api/addons',
      },
    ]);
  });

  test('shows the refusal of a slug that is taken on the slug field, which keeps what was typed', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const form = new AddonFormDriver(page);
    await installAddonsWorld(page);

    await list.goto();
    await list.newAddon().click();
    await form.expectOpen('New add-on');
    await form.fill({ name: 'Another seats', slug: 'extra-seats' });
    await form.submit();

    await expect(
      form
        .dialog()
        .getByText('an add-on family with slug "extra-seats" already exists'),
    ).toBeVisible();
    await expect(form.dialog()).toBeVisible();
    await expect(form.nameField()).toHaveValue('Another seats');
    await expect(page).toHaveURL('/addons/new');
  });

  test('makes the next version of a family from its row, which starts empty and is a draft', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const form = new AddonFormDriver(page);
    const detail = new AddonDetailDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);

    await list.goto();
    await list.expandFamily('Extra seats');
    await list.startNewVersion('Extra seats');
    await form.expectOpen('New version of Extra seats');
    await expect(page).toHaveURL('/addons/new?family=extra-seats');

    // The name and how it is sold are the family's; nothing else is copied.
    await expect(form.nameField()).toHaveValue('Extra seats');
    await form.fill({ versionName: '2028' });
    await form.submit();

    await expectToast(page, 'Add-on created');
    await expect(page).toHaveURL('/addons/extra-seats-v3');
    await detail.expectState('Draft');
    await expect(detail.field('Version')).toContainText('3 (2028)');
    expect(writes).toEqual([
      {
        body: {
          description: '',
          familySlug: 'extra-seats',
          lifecycleState: 'DRAFT',
          name: 'Extra seats',
          pricingType: 'PAID',
          versionName: '2028',
        },
        method: 'POST',
        pathname: '/api/addons',
      },
    ]);

    // Nothing of the previous version came with it.
    await detail.tab('Entitlements').click();
    await expect(
      page.getByText('This version grants nothing yet.'),
    ).toBeVisible();
    await detail.tab('Prices').click();
    await expect(
      page.getByText('This version has no price yet.'),
    ).toBeVisible();
    await detail.tab('Compatible licenses').click();
    await expect(page.getByTestId('compatibility-empty')).toBeVisible();
  });

  test('drops a link to a version of a family that does not exist', async ({
    page,
  }) => {
    await installAddonsWorld(page);

    await page.goto('/addons/new?family=no-such-family');

    await expect(page.getByText('Page not found')).toBeVisible();
  });
});

test.describe('editing a version', () => {
  test('changes its name and its description, and restates the rest as it is', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);
    const form = new AddonFormDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);

    await detail.goto('extra-tokens-v1', 'Extra tokens');
    await detail.editLink().click();
    await form.expectOpen('Edit add-on');
    await expect(page).toHaveURL('/addons/extra-tokens-v1?mode=configure');
    await form.descriptionField().fill('Twenty thousand more tokens a unit');
    await form.submit();

    await expectToast(page, 'Add-on updated');
    await expect(page).toHaveURL('/addons/extra-tokens-v1');
    await expect(detail.field('Description')).toContainText(
      'Twenty thousand more tokens a unit',
    );
    // The API replaces the version as a whole: the default flag goes back as it is.
    expect(writes).toEqual([
      {
        body: {
          description: 'Twenty thousand more tokens a unit',
          isDefault: true,
          name: 'Extra tokens',
          versionName: '2026',
        },
        method: 'PUT',
        pathname: '/api/addons/extra-tokens-v1',
      },
    ]);
  });

  test('stops lowering the maximum under what an instance holds, on the field, before the API is asked', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);
    const form = new AddonFormDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);

    // Initech Production holds two units of the seats, whose maximum is three.
    await detail.goto('extra-seats-v1', 'Extra seats');
    await detail.editLink().click();
    await form.expectOpen('Edit add-on');
    await form.maxQuantityField().fill('1');
    await form.submit();

    await expect(
      form
        .dialog()
        .getByText(
          'Initech Production holds 2 units: lower its quantity there before lowering the maximum.',
        ),
    ).toBeVisible();
    expect(writes).toEqual([]);

    // Down to what it holds is allowed, and so is more.
    await form.maxQuantityField().fill('2');
    await form.submit();

    await expectToast(page, 'Add-on updated');
    await expect(detail.field('Max quantity')).toContainText('2');
    expect(writes).toHaveLength(1);
  });

  test('takes the maximum off, which asks nobody', async ({ page }) => {
    const detail = new AddonDetailDriver(page);
    const form = new AddonFormDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);

    await detail.goto('extra-seats-v1', 'Extra seats');
    await detail.editLink().click();
    await form.expectOpen('Edit add-on');
    await form.maxQuantityField().fill('');
    await form.submit();

    await expectToast(page, 'Add-on updated');
    await expect(detail.field('Max quantity')).toContainText('Unbounded');
    expect(writes).toEqual([
      {
        body: {
          description: 'Five more named users a unit',
          isDefault: true,
          name: 'Extra seats',
          versionName: '2026',
        },
        method: 'PUT',
        pathname: '/api/addons/extra-seats-v1',
      },
    ]);
  });
});

test.describe('moving a version along its life', () => {
  test('publishes a draft once confirmed, after a note on what publishing changes', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const detail = new AddonDetailDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);

    await list.goto();
    await list.expandFamily('Extra seats');
    await list.expectVersionState('Extra seats', '2027', 'Draft');
    await list.action('Extra seats', '2027', 'Publish').click();

    await expect(detail.confirmation()).toContainText(
      'Publish Extra seats v2?',
    );
    const note = detail.confirmation().getByRole('list');
    await expect(note).toContainText('Its prices cannot be edited');
    await expect(note).toContainText('Its entitlements freeze');
    await expect(note).toContainText(
      'attachable only to the license families it fits',
    );
    await detail.confirm('Publish');

    await expectToast(page, 'Version published');
    await list.expectVersionState('Extra seats', '2027', 'Published');
    // The action is not a click on the row, which would open the version.
    await expect(page).toHaveURL('/addons');
    expect(writes).toEqual([
      {
        body: null,
        method: 'POST',
        pathname: '/api/addons/extra-seats-v2/publish',
      },
    ]);
  });

  test('changes nothing when the confirmation is dismissed', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const detail = new AddonDetailDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);

    await list.goto();
    await list.expandFamily('Priority support');
    await list.action('Priority support', '2025', 'Unarchive').click();
    await detail.confirmation().getByRole('button', { name: 'Cancel' }).click();

    await expect(detail.confirmation()).toHaveCount(0);
    await list.expectVersionState('Priority support', '2025', 'Archived');
    expect(writes).toEqual([]);
  });

  test('withdraws a version from sale and puts it back, from its page', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);
    await installAddonsWorld(page);

    await detail.goto('priority-support-v1', 'Priority support');
    await detail.expectState('Archived');
    await detail.action('Unarchive').click();
    await expect(detail.confirmation()).toContainText(
      'Unarchive Priority support v1?',
    );
    await detail.confirm('Unarchive');
    await expectToast(page, 'Version unarchived');
    await detail.expectState('Published');

    await detail.action('Archive').click();
    await expect(detail.confirmation()).toContainText(
      'Archive Priority support v1?',
    );
    await expect(detail.confirmation()).toContainText(
      'keep being billed for it',
    );
    await detail.confirm('Archive');
    await expectToast(page, 'Version archived');
    await detail.expectState('Archived');
  });

  test('withholds archiving the default of a family and says why, until it is no longer the default', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);
    await installAddonsWorld(page);

    await detail.goto('extra-tokens-v1', 'Extra tokens');
    const archive = detail.action('Archive');
    await expect(archive).toBeDisabled();
    // A disabled button emits no pointer events; its wrapper shows the reason.
    await archive.locator('..').hover();
    await expect(page.getByRole('tooltip')).toContainText(
      'The default version cannot be archived',
    );

    await detail.action('Unset default').click();
    await expectToast(page, 'Default version unset');
    await expect(detail.action('Archive')).toBeEnabled();
  });

  test('moves the default of a family onto a published version, which takes it off the other', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);

    await list.goto();
    await list.expandFamily('Extra seats');
    // A draft cannot be the default, and the row says what to do first.
    const draftDefault = list.action('Extra seats', '2027', 'Set as default');
    await expect(draftDefault).toBeDisabled();
    await draftDefault.locator('..').hover();
    await expect(page.getByRole('tooltip')).toContainText(
      'Only a published version can be set as the default',
    );

    await list.action('Extra seats', '2027', 'Publish').click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { exact: true, name: 'Publish' })
      .click();
    await expectToast(page, 'Version published');
    await list.action('Extra seats', '2027', 'Set as default').click();

    await expectToast(page, 'Default version updated');
    await expect(
      list.action('Extra seats', '2027', 'Unset default'),
    ).toBeVisible();
    await expect(
      list.action('Extra seats', '2026', 'Set as default'),
    ).toBeVisible();
    expect(writes.at(-1)).toEqual({
      body: {
        description: 'Five more named users a unit, and more tokens',
        isDefault: true,
        maxQuantity: 10,
        name: 'Extra seats',
        versionName: '2027',
      },
      method: 'PUT',
      pathname: '/api/addons/extra-seats-v2',
    });
  });

  test('shows the reason the API gives when the version moved in the meantime', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const detail = new AddonDetailDriver(page);
    await installAddonsWorld(page);

    await list.goto();
    await list.expandFamily('Extra seats');
    // Someone else publishes the draft while this page still shows it as one.
    await page.evaluate(async () => {
      await fetch('/api/addons/extra-seats-v2/publish', { method: 'POST' });
    });

    await list.action('Extra seats', '2027', 'Publish').click();
    await detail.confirm('Publish');

    await expectToast(page, 'add-on "extra-seats-v2" is PUBLISHED, not DRAFT');
    // Read again all the same, so the table catches up with the version.
    await list.expectVersionState('Extra seats', '2027', 'Published');
  });
});

test.describe('deleting a draft', () => {
  test('deletes a draft once confirmed, with what it was given, and leaves the family its other version', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const detail = new AddonDetailDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);

    await list.goto();
    await list.expandFamily('Extra seats');
    await list.action('Extra seats', '2027', 'Delete').click();
    await expect(detail.confirmation()).toContainText(
      'Delete the draft Extra seats v2?',
    );
    await detail.confirm('Delete');

    await expectToast(page, 'Draft deleted');
    await expect(list.versionRow('Extra seats', '2027')).toHaveCount(0);
    await expect(list.versionRow('Extra seats', '2026')).toBeVisible();
    expect(writes).toEqual([
      { body: null, method: 'DELETE', pathname: '/api/addons/extra-seats-v2' },
    ]);
  });

  test('offers nothing to delete on a version that has been on sale', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    await installAddonsWorld(page);

    await list.goto();
    await list.expandFamily('Extra seats');

    await expect(list.action('Extra seats', '2026', 'Delete')).toHaveCount(0);
    await expect(list.action('Extra seats', '2027', 'Delete')).toBeVisible();
  });

  test('says in the words of the API why a version that was held cannot be deleted', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const detail = new AddonDetailDriver(page);
    const model = createAddonsBillingModel();
    model.addons.armProblem('deleteAddon', {
      code: 'DeleteAddon.InUseConflict',
      detail:
        'this add-on version was attached to an instance: it is history and cannot be deleted; archive it instead',
      status: 409,
    });
    await installAddonsWorld(page, model);

    await list.goto();
    await list.expandFamily('Extra seats');
    await list.action('Extra seats', '2027', 'Delete').click();
    await detail.confirm('Delete');

    await expectToast(
      page,
      'this add-on version was attached to an instance: it is history and cannot be deleted; archive it instead',
    );
    await expect(list.versionRow('Extra seats', '2027')).toBeVisible();
  });

  test('leaves the page of a draft that is deleted from it', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);
    const list = new AddonsListDriver(page);
    await installAddonsWorld(page);

    await detail.goto('extra-seats-v2', 'Extra seats');
    await detail.action('Delete').click();
    await detail.confirm('Delete');

    await expectToast(page, 'Draft deleted');
    await expect(page).toHaveURL('/addons');
    await list.expectLoaded();
  });
});

test.describe('listing a family in the public catalogue', () => {
  test('lists a family and takes it out, and says which are listed', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const writes = recordWrites(page, ADDON_WRITES);
    await installAddonsWorld(page);

    await list.goto();
    // Extra seats is listed, Extra tokens is not.
    await expect(list.publicBadge('Extra seats')).toBeVisible();
    await expect(list.publicBadge('Extra tokens')).toHaveCount(0);
    await expect(list.publicSwitch('Extra seats')).toBeChecked();
    await expect(list.publicSwitch('Extra tokens')).not.toBeChecked();

    await list.publicSwitch('Extra tokens').click();
    await expectToast(page, 'The family is listed in the public catalogue');
    await expect(list.publicBadge('Extra tokens')).toBeVisible();
    await list.publicSwitch('Extra seats').click();
    await expectToast(
      page,
      'The family is no longer listed in the public catalogue',
    );
    await expect(list.publicBadge('Extra seats')).toHaveCount(0);

    expect(writes).toEqual([
      {
        body: { isPublic: true },
        method: 'PATCH',
        pathname: '/api/addon-families/extra-tokens',
      },
      {
        body: { isPublic: false },
        method: 'PATCH',
        pathname: '/api/addon-families/extra-seats',
      },
    ]);
  });

  test('shows the refusal of the API in a toast, and the switch as it was', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const model = createAddonsBillingModel();
    model.addons.armProblem('updateAddonFamily', {
      code: 'UpdateAddonFamily.NotFound',
      detail: 'add-on family "extra-tokens" not found',
      status: 404,
    });
    await installAddonsWorld(page, model);

    await list.goto();
    await list.publicSwitch('Extra tokens').click();

    await expectToast(page, 'add-on family "extra-tokens" not found');
    await expect(list.publicSwitch('Extra tokens')).not.toBeChecked();
  });
});
