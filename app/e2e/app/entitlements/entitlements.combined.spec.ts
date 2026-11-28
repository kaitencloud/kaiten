import { expect, recordWrites, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createCombinableEntitlementsModel,
  createCombinedEntitlementModel,
  createMonthlyCombinedEntitlementModel,
} from './entitlements.scenarios';

// A combined entitlement is the weighted sum of the usage of other entitlements, its
// sources, computed when it is read: the vendor shows its customers one "Credits" line in
// place of the two behind it. It is chosen once, takes the window its sources share, and
// enforces nothing. The sources are picked among what can be summed, each with a weight,
// the rate one unit of it is worth.

test.describe('creating a combined entitlement', () => {
  test('sums two entitlements at their weights, and takes no window of its own', async ({
    page,
  }) => {
    const model = createCombinableEntitlementsModel();
    const list = new EntitlementsListDriver(page);
    const form = new EntitlementFormDriver(page);
    const writes = recordWrites(page, /\/api\/entitlements$/);

    await installEntitlementAppMocks(page, model);
    await list.goto();
    await list.openCreatePage();
    await form.fill({ name: 'Credits' });
    await form.clickNext();

    await form.selectUsageSource('Combined');
    // Two lines start the list, the least a sum can have.
    await expect(form.sourceRows()).toHaveCount(2);
    // A combined entitlement is always a sum: the aggregation is shown, greyed.
    await expect(form.aggregationTrigger()).toBeDisabled();
    await expect(form.aggregationTrigger()).toContainText('Sum');

    await form.chooseSource(1, 'Firecrawl Credits');
    await form.setSourceWeight(1, '0.4');
    await form.chooseSource(2, 'AI Credits');
    await form.setSourceWeight(2, '0.6');
    await expect(form.combinedWindow()).toContainText('Never (lifetime)');
    await form.submitButton().click();

    await expect(page).toHaveURL('/catalog/entitlements/credits');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({
      aggregationMethod: 'SUM',
      name: 'Credits',
      sources: [
        { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
        { entitlementSlug: 'ai-credits', weight: '0.6' },
      ],
      type: 'NUMBER',
      usageSource: 'COMBINED_USAGE',
    });
    // The window is the sources': the API derives it, and refuses a value that is not theirs.
    expect(writes[0].body).not.toHaveProperty('resetPeriod');
    expect(writes[0].body).not.toHaveProperty('resetAnchor');
    expect(writes[0].body).not.toHaveProperty('warningThresholdPercent');

    // It is stored with its sources, which the API lists alphabetically.
    const stored = await page.evaluate(async () =>
      (await fetch('/api/entitlements/credits')).json(),
    );
    expect(stored).toMatchObject({
      usageSource: 'COMBINED_USAGE',
      sources: [
        { entitlementSlug: 'ai-credits', weight: '0.6' },
        { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
      ],
    });
  });

  test('offers only what can be summed, and only what shares the window of the other lines', async ({
    page,
  }) => {
    const model = createCombinableEntitlementsModel();
    const form = new EntitlementFormDriver(page);

    await installEntitlementAppMocks(page, model);
    await page.goto('/catalog/entitlements/new');
    await form.fill({ name: 'Throughput' });
    await form.clickNext();
    await form.selectUsageSource('Combined');

    // Counters that are summed or counted: not the average, not the flag.
    expect(await form.offeredSources(1)).toEqual([
      'AI Credits',
      'Firecrawl Credits',
      'Monthly Exports',
      'Monthly Requests',
    ]);
    await expect(form.combinedWindow()).toContainText(
      'Choose the sources to see the window',
    );

    await form.chooseSource(1, 'Monthly Requests');
    // The window is the one the sources share, which cannot be chosen.
    await expect(form.combinedWindow()).toContainText('Every month');
    await expect(form.combinedWindow()).toContainText('Calendar');
    expect(await form.offeredSources(2)).toEqual(['Monthly Exports']);
    await form.chooseSource(2, 'Monthly Exports');
    // A source is named once: each line offers what the other does not name, and keeps its own.
    expect(await form.offeredSources(1)).toEqual(['Monthly Requests']);
    expect(await form.offeredSources(2)).toEqual(['Monthly Exports']);
  });

  test('is not sent with fewer than two sources or a weight that is not a positive number', async ({
    page,
  }) => {
    const model = createCombinableEntitlementsModel();
    const form = new EntitlementFormDriver(page);
    const writes = recordWrites(page, /\/api\/entitlements$/);

    await installEntitlementAppMocks(page, model);
    await page.goto('/catalog/entitlements/new');
    await form.fill({ name: 'Credits' });
    await form.clickNext();
    await form.selectUsageSource('Combined');
    await form.chooseSource(1, 'Firecrawl Credits');
    await form.chooseSource(2, 'AI Credits');
    await expect(form.submitButton()).toBeEnabled();

    await form.setSourceWeight(2, '0');
    await expect(
      form.sourceRow(2).getByText('Enter a weight greater than 0'),
    ).toBeVisible();
    await expect(form.submitButton()).toBeDisabled();
    await form.setSourceWeight(2, '0.0000000001');
    await expect(form.submitButton()).toBeEnabled();
    await form.setSourceWeight(2, '1.5x');
    await expect(form.submitButton()).toBeDisabled();
    await form.setSourceWeight(2, '1.5');

    await form.removeSourceButton(2).click();
    await expect(form.sourceRows()).toHaveCount(1);
    await expect(
      page.getByText('Choose at least two entitlements to sum.'),
    ).toBeVisible();
    await expect(form.submitButton()).toBeDisabled();
    expect(writes).toHaveLength(0);

    await form.addSourceButton().click();
    await form.chooseSource(2, 'AI Credits');
    await expect(
      page.getByText('Choose at least two entitlements to sum.'),
    ).toHaveCount(0);
    await expect(form.submitButton()).toBeEnabled();
  });

  test('says what the API refused about the sources on the sources, in the words of the console', async ({
    page,
  }) => {
    const model = createCombinableEntitlementsModel();
    const form = new EntitlementFormDriver(page);
    const detail = 'source "ai-credits" is on a lifetime counter, where ...';
    model.setNextProblem('create', {
      code: 'CreateEntitlement.SourceWindowMismatch',
      detail,
      status: 422,
    });

    await installEntitlementAppMocks(page, model);
    await page.goto('/catalog/entitlements/new');
    await form.fill({ name: 'Credits' });
    await form.clickNext();
    await form.selectUsageSource('Combined');
    await form.chooseSource(1, 'Firecrawl Credits');
    await form.chooseSource(2, 'AI Credits');
    await form.submitButton().click();

    const sources = page.locator('[data-field-name="sources"]').first();
    await expect(sources).toContainText(
      'The sources do not share one usage window.',
    );
    await expect(sources).not.toContainText(detail);
    await expect(page).toHaveURL(/\/catalog\/entitlements\/new/);

    // The refusal is about what was typed: changing a source takes it back.
    await form.setSourceWeight(1, '2');
    await expect(sources).not.toContainText('do not share one usage window');
    await form.submitButton().click();
    await expect(page).toHaveURL('/catalog/entitlements/credits');
  });
});

test.describe('reading a combined entitlement', () => {
  test('tells it from the others in the list, and in its page', async ({
    page,
  }) => {
    const model = createCombinedEntitlementModel();
    const list = new EntitlementsListDriver(page);

    await installEntitlementAppMocks(page, model);
    await list.goto();

    await expect(
      list.entitlementRow('Credits').getByText('Combined'),
    ).toBeVisible();
    await expect(
      list.entitlementRow('Firecrawl Credits').getByText('Calculated'),
    ).toBeVisible();

    await list.openEntitlement('Credits');
    await expect(page).toHaveURL('/catalog/entitlements/credits');
    const general = page.locator('[data-slot="card"]').filter({
      hasText: 'General Information',
    });
    await expect(general).toContainText('Usage source');
    await expect(general).toContainText('Combined');
    await expect(general).toContainText('Usage resets (from its sources)');

    // Where the sum comes from: its sources, with the rate each is summed at.
    const sources = page.locator('[data-slot="card"]').filter({
      has: page.getByRole('columnheader', { name: 'Weight' }),
    });
    await expect(sources).toContainText('Sources');
    await expect(sources).toContainText('Nothing is stored for the sum');
    await expect(sources.getByRole('row')).toHaveCount(3);
    await expect(
      sources.getByRole('row', { name: /AI Credits/ }),
    ).toContainText('0.6');
    await expect(
      sources.getByRole('row', { name: /Firecrawl Credits/ }),
    ).toContainText('0.4');

    await sources.getByRole('row', { name: /Firecrawl Credits/ }).click();
    await expect(page).toHaveURL('/catalog/entitlements/firecrawl-credits');
  });
});

test.describe('editing a combined entitlement', () => {
  test('locks where the usage comes from, and says before saving that new weights re-value the present', async ({
    page,
  }) => {
    const model = createCombinedEntitlementModel();
    const form = new EntitlementFormDriver(page);
    const writes = recordWrites(page, /\/api\/entitlements\/credits$/);

    await installEntitlementAppMocks(page, model);
    await page.goto('/catalog/entitlements/credits?mode=configure');
    await form.clickNext();

    await expect(form.usageSourceTrigger()).toBeDisabled();
    await expect(form.usageSourceTrigger()).toContainText('Combined');
    await expect(form.aggregationTrigger()).toBeDisabled();
    await expect(form.aggregationTrigger()).toContainText('Sum');
    // The sources come in the order the API lists them, alphabetically by slug.
    await expect(form.sourceRows()).toHaveCount(2);
    await expect(form.sourceEntitlement(1)).toContainText('AI Credits');
    await expect(form.sourceWeight(1)).toHaveValue('0.6');
    await expect(form.sourceEntitlement(2)).toContainText('Firecrawl Credits');
    await expect(form.sourceWeight(2)).toHaveValue('0.4');
    await expect(form.revalueHint()).toHaveCount(0);

    await form.setSourceWeight(1, '0.5');
    await expect(form.revalueHint()).toContainText(
      'Saving re-values the present',
    );
    // What is written the way the API writes it back is not a change.
    await form.setSourceWeight(1, '0.60');
    await expect(form.revalueHint()).toHaveCount(0);

    await form.setSourceWeight(1, '0.5');
    await form.setSourceWeight(2, '0.5');
    await form.updateButton().click();
    await expect(page).toHaveURL('/catalog/entitlements/credits');

    const put = writes.find(({ method }) => method === 'PUT');
    expect(put?.body).toMatchObject({
      sources: [
        { entitlementSlug: 'ai-credits', weight: '0.5' },
        { entitlementSlug: 'firecrawl-credits', weight: '0.5' },
      ],
      usageSource: 'COMBINED_USAGE',
    });
    const stored = await page.evaluate(async () =>
      (await fetch('/api/entitlements/credits')).json(),
    );
    expect(stored.sources).toEqual([
      { entitlementSlug: 'ai-credits', weight: '0.5' },
      { entitlementSlug: 'firecrawl-credits', weight: '0.5' },
    ]);
  });

  test('keeps its sources when it is renamed in place, which is not about them', async ({
    page,
  }) => {
    const model = createCombinedEntitlementModel();

    await installEntitlementAppMocks(page, model);
    await page.goto('/catalog/entitlements/credits');
    await page.getByRole('button', { name: 'Credits', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Edit name' })
      .fill('Credits (renamed)');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Credits (renamed)' }),
    ).toBeVisible();

    // The PUT replaces the sources as a whole: a rename that left them out would be refused.
    const stored = await page.evaluate(async () =>
      (await fetch('/api/entitlements/credits')).json(),
    );
    expect(stored.name).toBe('Credits (renamed)');
    expect(stored.sources).toHaveLength(2);
    expect(stored.usageSource).toBe('COMBINED_USAGE');
  });

  test('moves to the window of its new sources, which the API derives', async ({
    page,
  }) => {
    const model = createMonthlyCombinedEntitlementModel();
    const form = new EntitlementFormDriver(page);
    const writes = recordWrites(page, /\/api\/entitlements\/throughput$/);

    await installEntitlementAppMocks(page, model);
    await page.goto('/catalog/entitlements/throughput?mode=configure');
    await form.clickNext();
    await expect(form.combinedWindow()).toContainText('Every month');

    // A line offers what shares the window of the others: to leave the month, the others go first.
    await form.removeSourceButton(2).click();
    await form.chooseSource(1, 'Firecrawl Credits');
    await form.addSourceButton().click();
    await form.chooseSource(2, 'AI Credits');
    await expect(form.combinedWindow()).toContainText('Never (lifetime)');
    await form.updateButton().click();
    await expect(page).toHaveURL('/catalog/entitlements/throughput');

    // The window is not sent: the stored pair is the old one, and would be refused.
    const put = writes.find(({ method }) => method === 'PUT');
    expect(put?.body).not.toHaveProperty('resetPeriod');
    expect(put?.body).not.toHaveProperty('resetAnchor');
    const stored = await page.evaluate(async () =>
      (await fetch('/api/entitlements/throughput')).json(),
    );
    expect(stored.resetPeriod).toBeUndefined();
    expect(stored.sources).toEqual([
      { entitlementSlug: 'ai-credits', weight: '1' },
      { entitlementSlug: 'firecrawl-credits', weight: '1' },
    ]);
  });

  test('refuses a reset cadence on a source of a combined entitlement, above the buttons', async ({
    page,
  }) => {
    const model = createCombinedEntitlementModel();
    const form = new EntitlementFormDriver(page);

    await installEntitlementAppMocks(page, model);
    await page.goto('/catalog/entitlements/firecrawl-credits?mode=configure');
    await form.clickNext();
    await form.selectResetPeriod('Every month');
    await form.updateButton().click();

    await expect(page.getByTestId('entitlement-refusal')).toContainText(
      'This entitlement is a source of a combined entitlement, whose sources share one usage window',
    );
    // Nothing was written, and the form can be sent again once the cadence is taken back.
    await expect(form.updateButton()).toBeEnabled();
    await expect(page).toHaveURL(/mode=configure/);
  });
});
