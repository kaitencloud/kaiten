import { expect, test } from '../_support/app-test';
import { AiRateCardDriver } from '../_support/drivers/ai-rate-card.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { signInWithScopes } from '../_support/session-scopes';
import { createAiWorldModels } from './ai.scenarios';

// Who sees the AI screens and what they may do there. With the capability and
// the `ai-credits` flag off, the AI routes are not found and the AI section is
// not in the navigation. A session that may read licences but not write them
// sees the prices and changes none; without `read:addons`, the add-ons that can
// grant a pool are not listed, and the head says why.

const READER = [
  'read:licenses',
  'read:entitlements',
  'read:models',
  'read:instances',
  'read:customers',
];

test.describe('access to the AI screens', () => {
  test('with the AI flag off, the rate card is not found and the AI section is gone', async ({
    page,
  }) => {
    await installAiWorldMocks(page, createAiWorldModels({ flag: 'off' }));
    await page.goto('/ai/pricing');

    await expect(page.getByText('Page not found').first()).toBeVisible();
    await expect(page.getByRole('table', { name: /^Rate card/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: 'AI', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Pricing', exact: true }),
    ).toHaveCount(0);
  });

  test('with the AI flag off, the AI usage tab of an instance is not found', async ({
    page,
  }) => {
    await installAiWorldMocks(page, createAiWorldModels({ flag: 'off' }));
    await page.goto('/customers/instances/acme-production/ai-usage');

    await expect(
      page.getByRole('navigation', { name: 'breadcrumb' }),
    ).toContainText('Page not found');
    await expect(page.getByRole('tab', { name: 'AI usage' })).toHaveCount(0);
  });

  test('a session that may only read sees the prices and cannot change them', async ({
    page,
  }) => {
    await signInWithScopes(page, READER);
    await installAiWorldMocks(page, createAiWorldModels());
    const card = new AiRateCardDriver(page);
    await card.goto();

    await expect(page.getByRole('main')).toContainText(
      'You can view prices. Changing them needs write access to licences.',
    );
    await expect(
      card.cell('enterprise-v2~claude-sonnet-4-5'),
    ).toHaveAccessibleName(/1\.60 credits for the reference call/);
    await card.openCell('enterprise-v2~claude-sonnet-4-5');
    await expect(card.panelButton('Save rule')).toHaveCount(0);
    await expect(card.panelButton('Archive')).toHaveCount(0);
  });

  test('without read:addons, the add-ons of a pool are not listed, and the head says why', async ({
    page,
  }) => {
    await signInWithScopes(page, READER);
    await installAiWorldMocks(page, createAiWorldModels());
    const card = new AiRateCardDriver(page);
    await card.goto('?pool=partner-ai-credits');

    await card
      .columnHeader('Business 2025')
      .getByRole('button', { name: /^Through add-on/ })
      .click();
    await expect(page.getByRole('dialog')).toContainText(
      'This session cannot read add-ons (read:addons), so they are not listed here.',
    );
  });
});
