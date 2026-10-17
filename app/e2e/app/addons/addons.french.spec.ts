import { expect, test } from '../_support/app-test';
import { AddonCompatibilityDriver } from '../_support/drivers/addon-compatibility.driver';
import { AddonDetailDriver } from '../_support/drivers/addon-detail.driver';
import { AddonGrantsDriver } from '../_support/drivers/addon-grants.driver';
import { AddonPricesDriver } from '../_support/drivers/addon-prices.driver';
import { AddonsListDriver } from '../_support/drivers/addons-list.driver';
import { InstanceAddonsDriver } from '../_support/drivers/instance-addons.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { startInLanguage } from '../_support/language';
import { createAddonsBillingModel } from './addons.scenarios';
import { installAddonsWorld } from './install-addons-world';

// The console reads its language when it starts. The catalogue of add-ons, the page of a
// version with its four tabs, and the card of the add-ons an instance holds have their text
// in French, their amounts as the locale writes them, and no English word where a key would
// be missing. What the API wrote, the name of a version or a label of a price, is the API's
// and stays as it came.

test.describe('the catalogue of add-ons, read in French', () => {
  test.beforeEach(async ({ page }) => {
    await startInLanguage(page, 'fr');
    await installAddonsWorld(page);
  });

  test('the list, its families, its versions and the actions of a row', async ({
    page,
  }) => {
    await page.goto('/catalog/addons');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Add-ons' }),
    ).toBeVisible();
    await expect(page.getByPlaceholder('Nom de l’add-on')).toBeVisible();
    const seats = page
      .locator('[data-slot="accordion-item"]')
      .filter({ hasText: 'Extra seats' });
    await expect(seats).toContainText('2 versions');
    await expect(seats).toContainText('Par défaut : 2026');
    await expect(seats).toContainText('Public');
    await expect(
      seats.getByRole('switch', {
        name: 'Lister Extra seats dans le catalogue public',
      }),
    ).toBeChecked();
    await expect(
      page.getByRole('link', { exact: true, name: 'Nouvel add-on' }).first(),
    ).toBeVisible();
    await expect(
      seats.getByRole('link', { name: 'Nouvelle version' }),
    ).toBeVisible();

    const row = seats.getByRole('row').filter({ hasText: '2027' });
    await expect(row).toContainText('Brouillon');
    await expect(row).toContainText('Payant');
    for (const action of ['Publier', 'Définir par défaut', 'Supprimer']) {
      await expect(
        row.getByRole('button', { exact: true, name: action }),
      ).toBeVisible();
    }
    await expect(
      seats.getByRole('columnheader', { exact: true, name: 'Quantité max.' }),
    ).toBeVisible();
  });

  test('the confirmation to publish, with what publishing changes', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    await page.goto('/catalog/addons');
    await list.expandFamily('Extra seats');

    await list.action('Extra seats', '2027', 'Publier').click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Publier Extra seats v2 ?');
    await expect(dialog).toContainText(
      'Ses prix ne peuvent plus être modifiés',
    );
    await expect(dialog).toContainText('Ses droits sont gelés');
    await expect(dialog).toContainText(
      'Elle ne peut être attachée qu’aux familles de licences',
    );
    await dialog.getByRole('button', { exact: true, name: 'Publier' }).click();
    await expect(
      page
        .locator('[data-sonner-toast]')
        .filter({ hasText: 'Version publiée' }),
    ).toBeVisible();
  });

  test('the dialog that makes an add-on', async ({ page }) => {
    await page.goto('/catalog/addons/new');

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Nouvel add-on' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('textbox', { exact: true, name: 'Nom' }),
    ).toBeVisible();
    await expect(dialog.getByLabel(/^Quantité maximale/)).toHaveAttribute(
      'placeholder',
      'Illimitée',
    );
    await expect(
      dialog.getByRole('checkbox', { name: /Créer en brouillon/ }),
    ).toBeChecked();
    await expect(
      dialog.getByRole('button', { name: 'Créer l’add-on' }),
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Créer l’add-on' }).click();
    await expect(dialog.getByText('Le nom est requis')).toBeVisible();
  });

  test('the dialog that makes the next version of a family', async ({
    page,
  }) => {
    await page.goto('/catalog/addons/new?family=extra-seats');

    await expect(
      page
        .getByRole('dialog')
        .getByRole('heading', { name: 'Nouvelle version de Extra seats' }),
    ).toBeVisible();
  });
});

test.describe('a version of an add-on, read in French', () => {
  test.beforeEach(async ({ page }) => {
    await startInLanguage(page, 'fr');
    await installAddonsWorld(page);
  });

  test('its overview and its four tabs', async ({ page }) => {
    const detail = new AddonDetailDriver(page);

    await page.goto('/catalog/addons/extra-seats-v1');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Extra seats' }),
    ).toBeVisible();
    await expect(detail.tabs()).toHaveText([
      'Aperçu',
      'Droits',
      'Prix',
      'Licences compatibles',
    ]);
    const card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: 'Détails de l’add-on' });
    await expect(card).toContainText('Publiée');
    await expect(card).toContainText('Version par défaut');
    await expect(card).toContainText('Payant');
    await expect(card).toContainText('Quantité max.');
    await expect(
      card.getByRole('link', { exact: true, name: 'Modifier' }),
    ).toBeVisible();
    await expect(
      card.getByRole('button', { exact: true, name: 'Archiver' }),
    ).toBeDisabled();
  });

  test('what it grants, with the combination and the overage in words', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);

    await page.goto('/catalog/addons/extra-tokens-v1/entitlements');

    await expect(grants.row('Tokens')).toContainText('10 000 par unité');
    await expect(grants.row('Tokens')).toContainText('Additionner');
    await expect(grants.row('Tokens')).toContainText('+20 %');
    await page
      .getByRole('link', { exact: true, name: 'Ajouter un droit' })
      .click();
    await expect(
      grants.dialog().getByRole('heading', { name: 'Ajouter un droit' }),
    ).toBeVisible();
    await expect(
      grants.dialog().getByLabel(/^Dépassement toléré/),
    ).toHaveAttribute('placeholder', 'Hériter');
  });

  test('the warning when the overage is lower than the license’s', async ({
    page,
  }) => {
    await page.goto(
      '/catalog/addons/extra-tokens-v1/entitlements?grant=tokens',
    );

    await expect(page.getByTestId('license-overage-warning')).toContainText(
      'Cet add-on tolère un dépassement de 20 %, et Pro en tolère 50 %.',
    );
  });

  test('what it is sold for, with the amounts as French writes them, and the slot that is missing', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);
    // The slots are named in French: they are found by the period they stand for.
    const slot = (period: string) => page.locator(`[data-period="${period}"]`);

    await page.goto('/catalog/addons/extra-seats-v2/prices');

    await expect(
      page.getByRole('region', {
        name: 'Prix par défaut de chaque période de facturation',
      }),
    ).toBeVisible();
    await expect(slot('MONTHLY')).toContainText(/12,00\s\$US/);
    await expect(slot('ANNUAL')).toContainText(
      'Aucun prix par défaut : cet add-on ne peut pas être attaché à un abonnement annuel.',
    );
    await expect(prices.row('Extra seat, monthly')).toContainText('Mensuel');
    await page
      .getByRole('link', { exact: true, name: 'Ajouter un prix' })
      .click();
    const drawer = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Nouveau prix' }) });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Cette version est facturée en USD');
  });

  test('which licenses it fits, and the warning when it fits none', async ({
    page,
  }) => {
    const compatibility = new AddonCompatibilityDriver(page);

    await page.goto('/catalog/addons/extra-seats-v2/compatibility');
    await expect(
      page.getByRole('list', { name: 'Familles de licences' }),
    ).toBeVisible();
    await page
      .getByRole('list', { name: 'Familles de licences' })
      .getByRole('checkbox', { name: /^Pro/ })
      .click();

    await expect(compatibility.emptyWarning()).toContainText(
      'Attachable à rien',
    );
  });

  test('the dialog of a version that a billed instance holds', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    await page.goto('/catalog/addons/extra-seats-v1/entitlements');

    await page.getByRole('button', { name: 'Retirer Seats' }).click();
    await grants
      .confirmation()
      .getByRole('button', { exact: true, name: 'Retirer' })
      .click();

    await expect(page.getByRole('alertdialog')).toContainText(
      'Cette version est détenue par une instance facturée',
    );
    await expect(
      page.getByRole('link', { name: 'Créer une nouvelle version' }),
    ).toHaveAttribute('href', '/catalog/addons/new?family=extra-seats');
  });
});

test.describe('the add-ons of an instance, read in French', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await startInLanguage(page, 'fr');
    await installAddonsWorld(page, createAddonsBillingModel());
  });

  test('the card, its table, the note and the way to add one', async ({
    page,
  }) => {
    const addons = new InstanceAddonsDriver(page);

    await page.goto('/customers/instances/initech-prod/billing');

    await expect(addons.card()).toBeVisible();
    await expect(addons.card()).toContainText(
      'Des droits supplémentaires que cette instance détient',
    );
    await expect(addons.row('Extra seats')).toContainText(/10,00\s\$US\/mois/);
    await expect(addons.note()).toHaveText(
      'Le droit change tout de suite ; facturé dès le prochain renouvellement ; ni proratisation ni remboursement.',
    );
    await expect(
      addons.card().getByRole('link', { name: 'Ajouter un add-on' }),
    ).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Quantité de Extra seats' }),
    ).toBeVisible();
  });

  test('the dialog that adds one, with its price', async ({ page }) => {
    await page.goto('/customers/instances/initech-prod/billing/attach-addon');

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'Ajouter un add-on à Initech Production',
      }),
    ).toBeVisible();
    await expect(
      dialog.getByText(
        'Les add-ons en vente qui conviennent à la licence de cette instance.',
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Ajouter l’add-on' }),
    ).toBeVisible();
  });

  test('the confirmation to take one off, with what it costs', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-prod/billing');

    await page.getByRole('button', { name: 'Retirer Extra seats' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(
      'Retirer Extra seats de cette instance ?',
    );
    await expect(dialog).toContainText(
      'Ses droits prennent fin tout de suite.',
    );
    await expect(dialog).toContainText(
      'La période en cours n’est pas remboursée',
    );
  });
});
