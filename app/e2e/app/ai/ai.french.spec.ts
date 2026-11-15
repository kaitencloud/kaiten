import { expect, test } from '../_support/app-test';
import { startInLanguage } from '../_support/language';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// The AI screens in French: the rate card, its cells and the add-on head, and a
// charge receipt with its refunds. The drivers name things in English, so this
// spec finds them by their French names.

test.describe('the AI screens in French', () => {
  test.beforeEach(async ({ page }) => {
    await startInLanguage(page, 'fr');
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('the rate card names its prices and its add-ons in French', async ({
    page,
  }) => {
    await page.goto('/ai/pricing?pool=partner-ai-credits');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Tarification' }),
    ).toBeVisible();
    const grid = page.getByRole('table', { name: /^Grille tarifaire/ });
    await expect(
      grid.locator('[data-cell="enterprise-v2~claude-sonnet-4-5"]'),
    ).toHaveAccessibleName(
      /^Claude Sonnet 4\.5 sur Enterprise : .* crédits pour l’appel de référence/,
    );
    await expect(
      grid.getByRole('button', {
        exact: true,
        name: 'Par un add-on · Partner credit pack',
      }),
    ).toBeVisible();
    await expect(
      grid.locator('[data-cell="business~gpt-5"]'),
    ).toHaveAccessibleName(/, Par un add-on · Partner credit pack$/);
  });

  test('the charge receipt and its refunds read in French', async ({
    page,
  }) => {
    await page.goto(
      '/customers/instances/acme-production/ai-usage?receipt=txn_acme_017',
    );

    const receipt = page.getByRole('dialog', { name: 'Reçu de facturation' });
    await expect(receipt).toContainText('txn_acme_017');
    await expect(
      receipt.getByRole('region', { name: 'Comment il a été tarifé' }),
    ).toBeVisible();
    await expect(
      receipt.getByRole('region', { name: 'Remboursements' }),
    ).toContainText(/30[,.]00 crédits remboursés sur 78[,.]50\./);
    await expect(
      receipt.getByRole('button', { name: /^Rembourser 48[,.]50 crédits…$/ }),
    ).toBeVisible();
  });
});
