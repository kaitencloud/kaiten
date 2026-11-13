import { expect, test } from '../_support/app-test';
import { AiRateCardDriver } from '../_support/drivers/ai-rate-card.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// The partner pool: granted by Enterprise 2026, granted to Business only
// through the Partner credit pack add-on, and not granted at all by Enterprise
// 2025. The column head of a version an add-on can grant the pool on opens the
// add-on versions; where billing is off they cannot be listed, and the head
// says why.

const PARTNER = '?pool=partner-ai-credits';

test.describe('a pool granted through an add-on', () => {
  test('Business says "Through add-on" on its head and its cells, and lists the add-on', async ({
    page,
  }) => {
    await installAiWorldMocks(page, createAiWorldModels());
    const card = new AiRateCardDriver(page);
    await card.goto(PARTNER);

    await expect(card.columnHeader('Business 2025')).toContainText(
      'Through add-on · Partner credit pack',
    );
    await expect(card.columnHeader('Enterprise 2026')).toContainText(
      'Grants pool · 20,000',
    );
    await expect(card.columnHeader('Starter 2026')).toContainText(
      'Pool not granted',
    );
    await expect(card.cell('business~claude-haiku-4-5')).toHaveAccessibleName(
      /, Through add-on · Partner credit pack$/,
    );

    await card
      .columnHeader('Business 2025')
      .getByRole('button', { name: 'Through add-on · Partner credit pack' })
      .click();
    const popover = page.getByRole('dialog');
    await expect(popover).toContainText('Partner credit pack');
    await expect(popover).toContainText(
      'It does not mean every instance holds it',
    );
  });

  test('a version of the family that does not grant the pool says so', async ({
    page,
  }) => {
    await installAiWorldMocks(page, createAiWorldModels());
    const card = new AiRateCardDriver(page);
    await card.goto(`${PARTNER}&family=enterprise`);

    await expect(card.columnHeader('Enterprise 2025')).toContainText(
      'Pool not granted',
    );
    await expect(card.cell('enterprise~claude-haiku-4-5')).toHaveAccessibleName(
      'Claude Haiku 4.5 on Enterprise: pool not granted, no rule',
    );
    await expect(card.columnHeader('Enterprise 2026')).toContainText(
      'Grants pool · 20,000',
    );
  });

  test('a version that grants the pool, which an add-on can grant too, says "+ add-on"', async ({
    page,
  }) => {
    await installAiWorldMocks(page, createAiWorldModels());
    const card = new AiRateCardDriver(page);
    await card.goto('?pool=ai-credits');

    const head = card.columnHeader('Starter 2026');
    await expect(head).toContainText('Grants pool · 500');
    await head.getByRole('button', { name: '+ add-on' }).click();
    await expect(page.getByRole('dialog')).toContainText(
      'Add-ons that can grant this pool',
    );
  });

  test('with billing off, Business keeps "Through add-on" and says why the add-ons are not listed', async ({
    page,
  }) => {
    await installAiWorldMocks(
      page,
      createAiWorldModels({ billing: 'off', flag: 'on' }),
    );
    const card = new AiRateCardDriver(page);
    await card.goto(PARTNER);

    const head = card.columnHeader('Business 2025');
    await head.getByRole('button', { name: /^Through add-on/ }).click();
    await expect(page.getByRole('dialog')).toContainText(
      'Billing is off on this deployment, so the add-ons cannot be listed here.',
    );
  });
});
