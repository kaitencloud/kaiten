import { expect, test } from '../_support/app-test';
import { expectToast } from '../_support/assertions/toast';
import { PublishableKeysDriver } from '../_support/drivers/publishable-keys.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { createPublishableKeysBillingModel } from './integrations.scenarios';

// The console reads its language when it starts. The publishable keys have their text in
// French, their dates as the locale writes them, and no English word where a key would be
// missing. What the API wrote (the label someone gave a key, an origin) stays as it came.

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await startInLanguage(page, 'fr');
  await installBillingAppMocks(page, createPublishableKeysBillingModel());
});

test.describe('the publishable keys, read in French', () => {
  test('the list: its columns, the state of each key and what a key is for', async ({
    page,
  }) => {
    await page.goto('/integrations/publishable-keys');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Clés publiables' }),
    ).toBeVisible();
    const columns = page.getByRole('columnheader');
    for (const header of [
      'Libellé',
      'Clé',
      'Origines autorisées',
      'Créée le',
      'Dernière utilisation',
      'Statut',
    ]) {
      await expect(columns.filter({ hasText: header }).first()).toBeVisible();
    }
    const keys = new PublishableKeysDriver(page);
    await expect(keys.row('pricing')).toContainText('…a1B2');
    await expect(keys.row('pricing')).toContainText('Active');
    await expect(keys.row('pricing')).toContainText('1 sept. 2026');
    await expect(keys.row('Storefront')).toContainText('Jamais utilisée');
    await expect(keys.intro()).toContainText('Une clé publiable permet');
    await expect(keys.intro()).toContainText('Catalogue public');
    await expect(
      keys.intro().getByRole('link', { name: 'Familles de licences' }),
    ).toBeVisible();
    await expect(keys.searchField()).toHaveCount(0);
    await expect(
      page.getByPlaceholder('Rechercher par libellé, fin de clé ou origine'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Nouvelle clé publiable' }).first(),
    ).toBeVisible();
  });

  test('the revoked keys: the switch, the state and the missing actions', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await page.goto('/integrations/publishable-keys');

    await page
      .getByRole('switch', { name: 'Inclure les clés révoquées' })
      .click();

    await expect(keys.row('Legacy checkout')).toContainText('Révoquée');
    await expect(keys.row('Legacy checkout').getByRole('link')).toHaveCount(0);
  });

  test('issuing a key: the form, what it refuses, the key once and the copy', async ({
    page,
  }) => {
    const keys = new PublishableKeysDriver(page);
    await page.goto('/integrations/publishable-keys/new');

    await expect(keys.dialog()).toContainText('Nouvelle clé publiable');
    await expect(keys.dialog()).toContainText(
      'La clé n’est affichée qu’une fois, à sa création.',
    );
    await keys.labelField().focus();
    await keys.originsField().fill('http://shop.acme.test');
    await keys.originsField().press('Tab');
    await expect(keys.dialog()).toContainText('Saisissez un libellé');
    await expect(keys.rejectedOrigins()).toHaveText(
      'Pas une origine : http://shop.acme.test',
    );
    await expect(keys.dialog()).toContainText(
      'Chaque origine est https://hôte[:port]',
    );

    await keys.fill({ label: 'Caisse', origins: ['https://shop.acme.test'] });
    await keys.dialog().getByRole('button', { name: 'Créer la clé' }).click();

    await expect(keys.dialog()).toContainText('Clé publiable créée');
    await expect(keys.createdKey()).toHaveValue('pk_test_key_0001');
    await expect(keys.dialog()).toContainText(
      'Vous ne reverrez plus cette clé',
    );
    await keys.dialog().getByRole('button', { name: 'Copier la clé' }).click();
    await expectToast(page, 'Clé copiée');
    await keys.dialog().getByRole('button', { name: 'Terminé' }).click();
    await expect(keys.row('Caisse')).toContainText('…0001');
  });

  test('changing a key, and revoking it', async ({ page }) => {
    const keys = new PublishableKeysDriver(page);
    await page.goto('/integrations/publishable-keys');

    await page.getByRole('link', { name: 'Modifier pricing' }).click();
    await expect(keys.dialog()).toContainText('Modifier pricing');
    await keys.fill({ label: 'pricing page' });
    await keys.dialog().getByRole('button', { name: 'Enregistrer' }).click();
    await expectToast(page, 'pricing page enregistrée');

    await page.getByRole('button', { name: 'Révoquer Docs' }).click();
    await expect(keys.confirmation()).toContainText('Révoquer Docs ?');
    await expect(keys.confirmation()).toContainText(
      'ne peut pas être rétablie',
    );
    await keys
      .confirmation()
      .getByRole('button', { name: 'Révoquer la clé' })
      .click();
    await expectToast(page, 'Docs révoquée');
  });
});
