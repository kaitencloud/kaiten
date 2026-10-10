import { expect, test } from '../_support/app-test';
import { BillingInvoicesDriver } from '../_support/drivers/billing-invoices.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { createInvoicesModel } from './billing.scenarios';

// The console reads its language when it starts. Every screen of the invoices has
// its text in French, its dates and amounts as the locale writes them, and no
// English word where a key would be missing. What the API wrote, a label of a
// line or the arithmetic of a price, is the API's and stays as it came.

test.describe('the invoices, read in French', () => {
  test.beforeEach(async ({ page }) => {
    await startInLanguage(page, 'fr');
    await installBillingAppMocks(page, createInvoicesModel());
    // Waits for the title: the first load reloads once on its own under the
    // mocks, and the tests go on to navigate, which that reload would interrupt.
    await new BillingInvoicesDriver(page).goto('', 'Factures');
  });

  test('the list, its columns, its statuses, its filters and its export', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Factures' }),
    ).toBeVisible();
    for (const column of [
      'Client',
      'Facture',
      'Période de service',
      'Total',
      'Statut',
      'Échéance de paiement',
      'Transmission',
    ]) {
      // A header that sorts is named by its button, so the text says which it is.
      await expect(
        page
          .getByRole('columnheader')
          .filter({ hasText: new RegExp(`^${column}$`) }),
      ).toBeVisible();
    }
    // The status is read in words, the amount and the date as French writes them.
    const list = new BillingInvoicesDriver(page);
    await expect(list.rows().first()).toBeVisible();
    await list.showRowsPerPage(20, 'Lignes par page');
    await expect(
      list.statusBadges().filter({ hasText: 'Bloquée' }).first(),
    ).toBeVisible();
    await expect(
      list.statusBadges().filter({ hasText: 'Payée' }).first(),
    ).toBeVisible();
    await expect(page.getByRole('table')).toContainText(/\d,\d{2}\s\$US/);
    await expect(page.getByRole('table')).toContainText(
      /\d+ \p{L}+\.? 20\d\d/u,
    );

    await page.getByRole('button', { exact: true, name: 'Exporter' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([
      'CSV par ligne de facture',
      'CSV par facture',
      'NDJSON, une facture par ligne',
    ]);
    await page.keyboard.press('Escape');

    await expect(list.searchField('Client, instance ou facture')).toBeVisible();
    await page.getByRole('button', { exact: true, name: 'Filtrer' }).click();
    const menu = page.getByRole('dialog');
    await expect(menu.getByRole('option')).toHaveText([
      'Statut',
      'Type',
      'Transmission',
      'En retard',
      'Bloquées',
      'Émission',
      'Début de la période de service',
    ]);
    await menu
      .getByRole('option', { exact: true, name: 'Transmission' })
      .click();
    await expect(
      menu.getByRole('option', { name: 'En attente de votre ERP' }),
    ).toBeVisible();
  });

  test('a held draft, its hold, its lines and what its actions ask', async ({
    page,
  }) => {
    await page.goto('/invoices/inv-h1');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      / · facture du \d+ \p{L}+\.? 20\d\d \(UTC\)$/u,
    );
    await expect(page.getByTestId('hold-banner')).toContainText('Bloquée :');
    await expect(page.getByTestId('hold-banner')).toContainText(
      'La facture a été composée mais pas émise',
    );
    const invoice = new InvoiceDetailDriver(page);
    // The boundary is not called what the due date is: the strip says "Échéance de
    // paiement", the summary the boundary and since when the draft is held.
    await expect(invoice.summary('Résumé')).toContainText(
      'Échéance de facturation',
    );
    await expect(invoice.summary('Résumé')).toContainText('Bloquée depuis');
    await expect(invoice.actionButtons()).toHaveText([
      'Débloquer la facture',
      'Recomposer',
      'Annuler la facture',
    ]);
    await expect(invoice.linesCard('Lignes')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /^Voir \d+ rapports? d’usage$/ }).first(),
    ).toBeVisible();
    await expect(page.getByTestId('line-fingerprint').first()).toContainText(
      /^Rapports \d+–\d+ · \d+ lignes? · Σ /,
    );

    await page
      .getByTestId('invoice-actions')
      .getByRole('button', { exact: true, name: 'Débloquer la facture' })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(
      'Accepter les montants tels que composés',
    );
    await expect(dialog.getByLabel(/^Motif/)).toBeVisible();
    await expect(
      dialog.getByRole('button', { exact: true, name: 'Débloquer' }),
    ).toBeDisabled();
    await dialog.getByLabel(/^Motif/).fill('contrôlé à la main');
    await expect(
      dialog.getByRole('button', { exact: true, name: 'Débloquer' }),
    ).toBeEnabled();
  });

  test('the figures under the header of an invoice, in words, dates and amounts as French writes them', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    // Long overdue, ready to bill, with one line.
    await page.goto('/invoices/inv-m1');
    await expect(invoice.stat('Total')).toContainText(/29,00\s\$US/);
    await expect(invoice.stat('Total')).toContainText('1 ligne');
    await expect(invoice.stat('Échéance de paiement')).toContainText(
      /31 mars 2026\s*\(UTC\)/,
    );
    await expect(invoice.stat('Échéance de paiement')).toContainText(
      /en retard de \d+ jours/,
    );
    await expect(invoice.stat('Période de service')).toContainText(
      /1 mars – 1 avr\. 2026\s*\(UTC\)/,
    );
    await expect(invoice.stat('Période de service')).toContainText(
      'Activation',
    );

    // A draft was not issued, and an invoice that ended says when it did.
    await page.goto('/invoices/inv-h1');
    await expect(invoice.stat('Échéance de paiement')).toContainText(
      'Non émise',
    );
    await page.goto('/invoices/inv-d1');
    await expect(invoice.stat('Payée')).toContainText(
      /10 févr\. 2026\s*\(UTC\)/,
    );
    await expect(invoice.stat('Payée')).toContainText(/10:00\s*\(UTC\)/);
  });

  test('an invoice that waits for the ERP is marked paid from a dialog in French', async ({
    page,
  }) => {
    await page.goto('/invoices/inv-m1');

    await page
      .getByTestId('invoice-actions')
      .getByRole('button', { exact: true, name: 'Marquer comme payée' })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Marquer comme payée' }),
    ).toBeVisible();
    await expect(dialog.getByLabel('Référence externe')).toBeVisible();
    await expect(dialog.getByLabel('Payée le (UTC)')).toBeVisible();
    await expect(dialog.getByLabel('Note')).toBeVisible();
    await expect(dialog).toContainText('Facultatif');
  });

  test('the usage behind a line, window by window', async ({ page }) => {
    await page.goto('/invoices/inv-p1/lines/inv-p1-line-1');

    await expect(page.getByTestId('line-reports')).toBeVisible();
    await expect(page.getByText('Cette ligne', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { exact: true, name: 'Retour à la facture' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { exact: true, name: 'Exporter en CSV' }),
    ).toBeVisible();
    for (const column of ['Rapport', 'Reçu le', 'Mode', 'Compteur', 'Limite']) {
      await expect(
        page.getByRole('columnheader', { exact: true, name: column }).first(),
      ).toBeVisible();
    }
    await expect(page.getByTestId('line-reports')).toContainText(
      /\d+ rapports?/,
    );
    // How a report moved the counter is said in French, not as the API wrote it.
    await expect(page.getByTestId('line-reports')).toContainText('Ajout');
    await expect(page.getByTestId('line-reports')).not.toContainText('append');
  });

  test('the handoff queue, its view, its tabs, its search and its acknowledgement', async ({
    page,
  }) => {
    await page.goto('/invoices?view=waiting');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Factures' }),
    ).toBeVisible();
    // The status views of the list, the two parts of the queue among them.
    await expect(
      page.getByRole('link', { name: /^Toutes \d+$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /^En retard \d+$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /^Bloquées \d+$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /^En attente de votre ERP \d+$/ }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('link', { name: /^Acquittées \d+$/ }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder('Client, instance ou facture'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { exact: true, name: 'Filtrer' }),
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { exact: true, name: 'Statut' }),
    ).toBeVisible();

    await page
      .getByRole('button', { exact: true, name: 'Acquitter' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Acquitter la facture' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Référence externe')).toBeVisible();
    await expect(
      dialog.getByRole('button', { exact: true, name: 'Annuler' }),
    ).toBeVisible();
  });
});
