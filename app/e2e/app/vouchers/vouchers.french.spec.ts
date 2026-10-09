import type { Page } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { InstanceVouchersDriver } from '../_support/drivers/instance-vouchers.driver';
import { startInLanguage } from '../_support/language';
import { BILLED_NOW } from '../billing/billed-instances';
import { installVouchersWorld } from './install-vouchers-world';

// The console reads its language when it starts. The vouchers have their text in French, their
// amounts and their dates as the locale writes them, and no English word where a key would be
// missing. What the API wrote (the name of a voucher, the description someone gave it) is the
// API's and stays as it came; so does the word "voucher", which the French of the console keeps.

test.beforeEach(async ({ page }) => {
  await startInLanguage(page, 'fr');
  await page.clock.setFixedTime(new Date(BILLED_NOW));
  await installVouchersWorld(page);
});

const button = (page: Page, name: RegExp | string) =>
  page.getByRole('button', { name });

test.describe('the catalogue of vouchers, read in French', () => {
  test('the list: its columns, the state of each row, the way to make one', async ({
    page,
  }) => {
    await page.goto('/vouchers');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Codes promo' }),
    ).toBeVisible();
    await expect(page.getByPlaceholder('Nom, code ou client')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Nouveau code promo' }),
    ).toBeVisible();
    const columns = page.getByRole('columnheader');
    for (const header of [
      'Nom',
      'Code',
      'Type',
      'Statut',
      'Utilisations',
      'Valide jusqu’au',
      'Client',
    ]) {
      await expect(columns.filter({ hasText: header }).first()).toBeVisible();
    }
    const row = (name: string) =>
      page.getByRole('row').filter({ hasText: name });
    await expect(row('Summer sale')).toContainText('Remise');
    await expect(row('Summer sale')).toContainText('Brouillon');
    await expect(row('Summer sale')).toContainText('0 (sans limite)');
    await expect(row('Tokens times two')).toContainText('Bonus de droits');
    await expect(row('Tokens times two')).toContainText('Actif');
    await expect(row('Tokens times two')).toContainText('1 sur 3');
    await expect(row('Hooli agreement')).toContainText('Épuisé');
    await expect(row('Hooli agreement')).toContainText('Hooli');
    await expect(row('Launch boost')).toContainText('Sans date de fin');
    await expect(row('Launch boost')).toContainText('Tous les clients');
    await expect(
      page.getByText('Affichage des enregistrements 1-10 sur 13'),
    ).toBeVisible();
  });

  test('the list: what it says when a search keeps no row, and the search by code', async ({
    page,
  }) => {
    await page.goto('/vouchers');

    await page.getByPlaceholder('Nom, code ou client').fill('introuvable');

    await expect(page.getByText('Aucun code promo ne correspond')).toHaveCount(
      2,
    );
    await expect(
      page.getByText(
        'Aucun code promo ne correspond à cette recherche ou à ces filtres.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Effacer les filtres' })
      .first()
      .click();
    await expect(
      page.getByRole('row').filter({ hasText: 'Summer sale' }),
    ).toBeVisible();

    await page
      .getByPlaceholder('Nom, code ou client')
      .fill('welcome-spring-2027');
    await expect(
      page.getByRole('row').filter({ hasText: 'Welcome spring' }),
    ).toBeVisible();
  });

  test('the page of a discount: its code, what it does in words and its redemptions', async ({
    page,
  }) => {
    await page.goto('/vouchers/voucher-welcome');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Welcome spring' }),
    ).toBeVisible();
    for (const action of [
      'Modifier',
      'Ajouter un bonus de droits',
      'Archiver',
    ]) {
      await expect(
        page
          .getByRole('link', { name: action })
          .or(page.getByRole('button', { name: action })),
      ).toBeVisible();
    }
    await expect(page.getByTestId('voucher-code')).toHaveText(
      'WELCOME-SPRING-2027',
    );
    await expect(
      page.getByRole('button', { name: 'Copier le code' }),
    ).toBeVisible();
    const summary = page.getByTestId('voucher-summary');
    await expect(summary).toContainText(
      '20 % de remise sur le prix de base, sur les 3 prochaines factures.',
    );
    await expect(summary).toContainText('Il peut être utilisé 100 fois.');
    await expect(summary).toContainText(
      'Tout client peut l’utiliser, une fois par instance.',
    );
    await expect(summary).toContainText(
      'Il peut être utilisé jusqu’au 30 juin 2027 (UTC).',
    );
    await expect(page.getByText('2 sur 100')).toBeVisible();
    await expect(page.getByText('20 févr. 2026 (UTC)').first()).toBeVisible();

    const redemptions = page
      .getByRole('row')
      .filter({ hasText: 'initech-annual' });
    await expect(redemptions).toContainText('1 mars 2026 (UTC)');
    await expect(redemptions).toContainText('1/3 factures');
    await expect(redemptions).toContainText('Active');
  });

  test('the page of a boost: its changes in words, counted in billing periods', async ({
    page,
  }) => {
    await page.goto('/vouchers/voucher-launch-boost');

    const summary = page.getByTestId('voucher-summary');
    await expect(summary).toContainText(
      'Tokens + 50 000, pendant une période de facturation.',
    );
    await expect(
      page.getByText('Aucune instance n’a encore utilisé ce code promo.'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Ajouter un bonus de droits' }),
    ).toHaveCount(0);
  });

  test('the dialogs of a voucher: its edit, the revocation of a redemption and its archive', async ({
    page,
  }) => {
    await page.goto('/vouchers/voucher-welcome');

    await page.getByRole('link', { name: 'Modifier' }).click();
    const edit = page.getByRole('dialog');
    await expect(
      edit.getByRole('heading', { name: 'Modifier Welcome spring' }),
    ).toBeVisible();
    await expect(
      edit.getByText(
        'Date et heure en UTC. Laissez vide pour aucune date de fin.',
      ),
    ).toBeVisible();
    await expect(
      edit.getByText(
        'Laissez vide pour aucune limite. Il ne peut pas être inférieur aux 2 utilisations déjà faites.',
      ),
    ).toBeVisible();
    await edit.getByLabel(/^Nombre maximal d’utilisations/).fill('1');
    await expect(
      edit.getByText('Le code promo a déjà été utilisé plus de fois que cela'),
    ).toBeVisible();
    await edit.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page
      .getByRole('row')
      .filter({ hasText: 'initech-annual' })
      .getByRole('button', { name: /^Révoquer/ })
      .click();
    const revoke = page.getByRole('dialog');
    await expect(
      revoke.getByRole('heading', {
        name: 'Révoquer Welcome spring sur initech-annual',
      }),
    ).toBeVisible();
    await expect(revoke).toContainText(
      'Un bonus cesse de s’appliquer immédiatement et une remise ne s’applique plus à aucune facture à venir.',
    );
    await revoke.getByLabel(/Motif/).fill('erreur de vente');
    await revoke.getByRole('button', { exact: true, name: 'Révoquer' }).click();
    await expect(
      page
        .locator('[data-sonner-toast]')
        .filter({ hasText: 'Welcome spring révoqué' }),
    ).toBeVisible();
    await expect(
      page.getByRole('row').filter({ hasText: 'initech-annual' }),
    ).toContainText('Révoquée : erreur de vente');

    await page.getByRole('button', { name: 'Archiver' }).click();
    const archive = page.getByRole('alertdialog');
    await expect(archive).toContainText('Archiver Welcome spring ?');
    await expect(archive).toContainText(
      'Plus aucune instance ne pourra utiliser le code.',
    );
    await archive
      .getByRole('button', { exact: true, name: 'Archiver' })
      .click();
    await expect(
      page
        .locator('[data-sonner-toast]')
        .filter({ hasText: 'Code promo archivé' }),
    ).toBeVisible();
  });

  test('the confirmation to publish a draft', async ({ page }) => {
    await page.goto('/vouchers/voucher-draft');

    await page.getByRole('button', { name: 'Publier' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Publier Summer sale ?');
    await expect(dialog).toContainText('Publier rend le code utilisable.');
    await dialog.getByRole('button', { exact: true, name: 'Publier' }).click();
    await expect(
      page
        .locator('[data-sonner-toast]')
        .filter({ hasText: 'Code promo publié' }),
    ).toBeVisible();
  });
});

test.describe('the wizard that makes a voucher, read in French', () => {
  test('the kinds, the two that come later and what a step that is not valid says', async ({
    page,
  }) => {
    await page.goto('/vouchers/new');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Nouveau code promo' }),
    ).toBeVisible();
    for (const name of ['Type', 'Offre', 'Qui et quand', 'Relecture']) {
      await expect(button(page, new RegExp(name)).first()).toBeVisible();
    }
    await expect(
      page.getByText('De quel type de code promo s’agit-il ?'),
    ).toBeVisible();
    await expect(button(page, /^Remise/)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(button(page, /^Bonus de droits/)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    for (const later of ['Activation de fonctionnalité', 'Lot']) {
      await expect(button(page, new RegExp(`^${later}`))).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await expect(button(page, new RegExp(`^${later}`))).toContainText(
        'Disponible dans une prochaine version',
      );
    }

    await button(page, /^Suivant/).click();
    await expect(page.getByText('Saisissez un nom')).toBeVisible();
  });

  test('the offer of a discount: its messages, its prices and the count of invoices', async ({
    page,
  }) => {
    await page.goto('/vouchers/new');
    await page.getByLabel(/^Nom/).fill('Remise de lancement');
    await button(page, /^Suivant/).click();

    await expect(
      page.getByText('Comment la remise est-elle calculée ?'),
    ).toBeVisible();
    await button(page, /^Suivant/).click();
    await expect(
      page.getByText('Saisissez un pourcentage supérieur à 0 et jusqu’à 100'),
    ).toBeVisible();

    await button(page, /^Un montant fixe/).click();
    await page.getByLabel(/^Montant/).fill('50');
    await button(page, /^Suivant/).click();
    await expect(page.getByText('Devise requise')).toBeVisible();
    await button(page, /^Un pourcentage/).click();
    await page.getByLabel(/^Pourcentage/).fill('20');

    await button(page, /^Des prix choisis/).click();
    await expect(
      page.getByRole('list', { name: 'Prix auxquels la remise s’applique' }),
    ).toBeVisible();
    await button(page, /^Suivant/).click();
    await expect(page.getByText('Cochez au moins un prix')).toBeVisible();
    await button(page, /^Le prix de base/).click();

    await page
      .getByRole('combobox', { name: /Combien de temps dure-t-elle/ })
      .click();
    await page
      .getByRole('option', { exact: true, name: 'Un nombre de fois' })
      .click();
    await expect(page.getByLabel(/^Nombre de factures/)).toBeVisible();
    await button(page, /^Suivant/).click();
    await expect(
      page.getByText('Saisissez un nombre entier à partir de 1'),
    ).toBeVisible();
  });

  test('the offer of a boost: its changes, its modifiers and its count of billing periods', async ({
    page,
  }) => {
    await page.goto('/vouchers/new');
    await button(page, /^Bonus de droits/).click();
    await page.getByLabel(/^Nom/).fill('Plus de tokens');
    await button(page, /^Suivant/).click();

    await button(page, /^Suivant/).click();
    await expect(
      page.getByText('Ajoutez au moins une modification'),
    ).toBeVisible();
    await button(page, /Ajouter une modification/).click();
    const change = page.getByTestId('voucher-grant-row').first();
    await change.getByRole('combobox', { name: /Modification/ }).click();
    for (const modifier of [
      'Fixer à',
      'Ajouter',
      'Multiplier par',
      'Rendre illimité',
    ]) {
      await expect(
        page.getByRole('option', { exact: true, name: modifier }),
      ).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await page
      .getByRole('combobox', {
        name: /Combien de temps dure-t-il|Combien de temps dure-t-elle/,
      })
      .click();
    await page
      .getByRole('option', { exact: true, name: 'Un nombre de fois' })
      .click();
    await expect(
      page.getByLabel(/^Nombre de périodes de facturation/),
    ).toBeVisible();
  });

  test('the review in words and the publication, with the code to copy and the boost for the same offer', async ({
    page,
  }) => {
    await page.goto('/vouchers/new');
    await page.getByLabel(/^Nom/).fill('Remise de lancement');
    await button(page, /^Suivant/).click();
    await page.getByLabel(/^Pourcentage/).fill('20');
    await button(page, /^Suivant/).click();

    await expect(page.getByLabel(/^Code personnalisé/)).toBeVisible();
    await page.getByLabel(/^Code personnalisé/).fill('LANCEMENT27');
    await expect(page.getByTestId('weak-code-warning')).toContainText(
      'Un code court peut être deviné',
    );
    await page.getByLabel(/^Nombre maximal d’utilisations/).fill('100');
    await expect(page.getByTestId('weak-code-warning')).toHaveCount(0);
    await button(page, /^Suivant/).click();

    const review = page.getByTestId('voucher-review');
    await expect(review).toContainText(
      '20 % de remise sur le prix de base, sur une seule facture.',
    );
    await expect(review).toContainText('Il peut être utilisé 100 fois.');
    await expect(page.getByText('LANCEMENT27', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Le code promo en clair' }),
    ).toBeVisible();
    await expect(
      page.getByText('Publier rend le code utilisable.', { exact: false }),
    ).toBeVisible();
    await expect(button(page, 'Enregistrer en brouillon')).toBeVisible();

    await page.getByRole('button', { exact: true, name: 'Publier' }).click();

    const published = page.getByTestId('voucher-published');
    await expect(published).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Code promo publié' }),
    ).toBeVisible();
    await expect(
      page.getByText('Remise de lancement peut maintenant être utilisé.'),
    ).toBeVisible();
    await expect(page.getByTestId('voucher-code')).toHaveValue('LANCEMENT27');
    await expect(
      page.getByRole('button', { name: 'Copier le code' }),
    ).toBeVisible();
    await expect(published).toContainText(
      'Ajouter un bonus de droits pour la même offre',
    );
    await expect(
      page.getByRole('link', { name: 'Ajouter un bonus de droits' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Voir le code promo' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Créer un autre code promo' }),
    ).toBeVisible();
  });
});

test.describe('what an instance redeemed, read in French', () => {
  test('the card, the dialog that applies a code and what it did', async ({
    page,
  }) => {
    const vouchers = new InstanceVouchersDriver(page);
    await page.goto('/customers/instances/initech-prod/billing');

    await expect(vouchers.card()).toBeVisible();
    await expect(vouchers.card()).toContainText('Utilisations');
    await expect(vouchers.card()).toContainText(
      'Les codes promo que cette instance a utilisés.',
    );
    const row = vouchers.row('Tokens times two');
    await expect(row).toContainText('Bonus de droits');
    await expect(row).toContainText('Code se terminant par LEQ4');
    await expect(row).toContainText('1 oct. 2026 (UTC)');
    await expect(row).toContainText(
      '1 oct. 2026, 09:00 – 1 déc. 2026, 09:00 (UTC)',
    );
    await expect(row).toContainText('Aucun');
    await expect(row).toContainText('Active');

    await page.getByRole('link', { name: 'Appliquer un code' }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'Appliquer un code à Initech Production',
      }),
    ).toBeVisible();
    await expect(dialog).toContainText(
      'Le code est d’abord vérifié : rien n’est utilisé tant que vous ne confirmez pas.',
    );
    await dialog.getByLabel(/^Code promo/).fill('LAUNCH-BOOST-50K');
    await dialog.getByRole('button', { name: 'Vérifier le code' }).click();

    await expect(vouchers.validVerdict()).toContainText(
      'Launch boost peut être utilisé',
    );
    await expect(vouchers.validVerdict()).toContainText(
      'Tokens + 50 000, pendant une période de facturation',
    );
    await expect(vouchers.validVerdict()).toContainText(
      'Initech Production remplit toutes les conditions de ce code promo.',
    );
    await dialog.getByRole('button', { name: 'Utiliser le code' }).click();

    await expect(
      dialog.getByRole('heading', {
        name: 'Code appliqué à Initech Production',
      }),
    ).toBeVisible();
    await expect(vouchers.outcome()).toContainText('S’applique jusqu’au');
    await expect(vouchers.outcome()).toContainText('7 nov. 2026 (UTC)');
    await expect(vouchers.outcome()).toContainText('Ce qui a changé');
    // The API adds before it multiplies: a hundred thousand with the +50 000 of the code, then
    // doubled by the boost the instance already holds.
    await expect(vouchers.outcome()).toContainText(
      'Tokens : 200 000 → 300 000',
    );
  });

  test('the reasons a code cannot be redeemed, in the words of the console', async ({
    page,
  }) => {
    const vouchers = new InstanceVouchersDriver(page);
    await page.goto('/customers/instances/initech-prod/billing');
    await expect(vouchers.card()).toBeVisible();
    await page.getByRole('link', { name: 'Appliquer un code' }).click();
    const dialog = page.getByRole('dialog');

    const reasons: Array<[string, string]> = [
      ['NOPE-NOPE-NOPE', 'Ce code promo n’existe pas.'],
      ['TOKENS-DOUBLE-Q4', 'Cette instance a déjà utilisé ce code promo.'],
      ['HOOLI-ONLY-10', 'Ce code promo est réservé à un autre client.'],
      ['ANNUAL-ONLY-15', 'Ce code promo exige un abonnement annuel.'],
      [
        'EURO-CREDIT-25',
        'Cette remise est dans une autre devise que celle de l’abonnement.',
      ],
      [
        'SUMMER-SALE-2027',
        'Ce code promo n’est pas actif : c’est un brouillon ou il a été archivé.',
      ],
      ['SPRING-2026-PROMO', 'Ce code promo a expiré.'],
    ];
    for (const [code, sentence] of reasons) {
      await dialog.getByLabel(/^Code promo/).fill(code);
      await dialog.getByRole('button', { name: 'Vérifier le code' }).click();
      await expect(vouchers.invalidVerdict()).toContainText(
        'Ce code ne peut pas être utilisé',
      );
      await expect(vouchers.invalidVerdict()).toContainText(sentence);
    }
  });

  test('the discount lines of the invoice the next boundary will issue, composed in words', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-annual/billing');
    await page.getByRole('button', { name: 'Voir les lignes' }).click();

    const preview = page.getByRole('dialog', { name: 'Prochaine facture' });
    const how = preview.getByTestId('invoice-line-discount');
    await expect(how).toContainText('20 % de 990,00');
    await expect(how).toContainText('Facture 2 sur 3 pour cette utilisation');
    await expect(how).toContainText('Porte sur Pro, annual (198,00');
    await expect(preview).toContainText('Sous-total');
    await expect(preview).toContainText('Remises');
  });

  test('the invoice a subscription with a code issued, and the list that says what the discounts took off', async ({
    page,
  }) => {
    await page.goto('/customers/instances/initech-fresh/billing/subscribe');

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'Souscrire un abonnement pour Initech Fresh',
      }),
    ).toBeVisible();
    await expect(dialog.getByLabel(/^Code promo/)).toBeVisible();
    await expect(dialog).toContainText(
      'Facultatif. Le code est utilisé avec l’abonnement',
    );
    await dialog.getByLabel('Essai (jours)').fill('0');
    await dialog.getByLabel(/^Code promo/).fill('WELCOME-SPRING-2027');
    await dialog
      .getByRole('button', { exact: true, name: 'Souscrire' })
      .click();
    await expect(dialog.getByTestId('subscribed')).toContainText(
      'Abonnement démarré',
    );
    await dialog.getByRole('link', { name: 'Voir la facture' }).click();

    await expect(page).toHaveURL(/\/billing\/invoices\/[^/]+$/);
    await expect(page.getByText('2 lignes, après 19,80')).toBeVisible();
    const how = page.getByTestId('invoice-line-discount');
    await expect(how).toContainText('20 % de 99,00');
    await expect(how).toContainText('Facture 1 sur 3 pour cette utilisation');
    await expect(how).toContainText('Porte sur Pro, monthly (19,80');

    await page.goto('/billing/invoices');
    await expect(page.getByTestId('invoice-discount-total')).toContainText(
      'Après 19,80',
    );
  });
});
