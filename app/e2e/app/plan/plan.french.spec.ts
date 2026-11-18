import { expect, test } from '../_support/app-test';
import { PlanPageDriver } from '../_support/drivers/plan.driver';
import { startInLanguage } from '../_support/language';
import { installPlanAppMocks } from '../_support/mocks/install-plan-app-mocks';
import {
  createPlanModel,
  createPlanSessionRefusedModel,
} from './plan.scenarios';

// The console reads its language when it starts, and hands the SDK its French pack: the
// page's own words and the SDK's are French, amounts and dates as the French locale writes
// them. What Kaiten Cloud names (its plans, what they grant) stays as it came.

test.beforeEach(async ({ page }) => {
  await startInLanguage(page, 'fr');
});

test.describe('the plan of the organization, read in French', () => {
  test('the portal and the plans it can move to', async ({ page }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto();

    await expect(plan.heading('Offre et consommation')).toBeVisible();
    await expect(
      page.getByText(
        'L’offre Kaiten Cloud de votre organisation : ce qu’elle comprend, ce que vous consommez et comment vous payez.',
      ),
    ).toBeVisible();
    await expect(plan.currentPlan('Offre actuelle')).toBeVisible();
    await expect(plan.currentPlanPrice()).toHaveText('0,00 $US/mois');
    await expect(plan.currentPlan('Offre actuelle')).toContainText(
      'Renouvellement le 1 déc. 2026',
    );
    await expect(plan.paymentMethod('Moyen de paiement')).toBeVisible();
    await expect(plan.invoices().first()).toContainText(
      '1 nov. 2026 – 1 déc. 2026',
    );
    const change = plan.change('Changer d’offre');
    await expect(change).toContainText(
      'Passez à une autre offre Kaiten Cloud. Le montant dû s’affiche avant que vous confirmiez.',
    );
    await expect(change).toContainText('Cloud Growth');
  });

  test('what the plan has used, with the pack’s words for what nothing caps', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto();

    // What Kaiten names stays as it came; the words around it are the pack's.
    await expect(
      plan.usage().getByRole('heading', { level: 2, name: 'Cloud Starter' }),
    ).toBeVisible();
    await expect(
      plan.usage().getByRole('list', { name: 'Usage' }),
    ).toBeVisible();
    await expect(plan.usageRow('Instances')).toContainText('14 / Illimité');
    await expect(plan.usageRow('Console users')).toContainText('4 / Illimité');
    await expect(plan.usageRow('Managed customers')).toContainText(
      'Depuis toujours',
    );
    await expect(plan.usageRow('Webhook events')).toContainText(
      'Sur cette période',
    );
    await expect(
      plan.usageRow('Managed customers').getByRole('progressbar'),
    ).toBeVisible();
  });

  test('the checkout of the plan chosen', async ({ page }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanModel());
    await plan.goto('?plan=kaiten-growth-v1');

    await expect(plan.dueToday()).toHaveText('79,00 $US');
    await expect(plan.checkout()).toContainText('À payer aujourd');
    await expect(
      plan.checkout().getByRole('button', { name: 'Souscrire' }),
    ).toBeVisible();
    await expect(
      plan.checkout().getByRole('button', { name: 'Annuler' }),
    ).toBeVisible();
  });

  test('a session saas-api refuses', async ({ page }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanSessionRefusedModel('forbidden'));
    await plan.goto();

    await expect(plan.problem()).toContainText('Réservé aux administrateurs');
    await expect(plan.problem()).toContainText(
      'Seul un administrateur de l’organisation peut consulter et changer son offre.',
    );
  });
});
