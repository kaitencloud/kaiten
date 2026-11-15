import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { AiUsageDriver } from '../_support/drivers/ai-usage.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// A call refused because the catalogue did not know the name the integration
// sent: its receipt offers to add that name as an external ID of a model. The
// model is suggested when a catalogue slug starts the name; once added, the
// receipt says the name is known since, and the call stays as recorded.

const ACME = 'acme-production';
const MODEL_WRITES = /^\/api\/models\/[^/]+$/;

test.describe('adding the name of an unknown model as an external ID', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('suggests the model whose slug starts the name, adds it, and the receipt says it is known since', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    const writes = recordWrites(page, MODEL_WRITES);
    await usage.goto(ACME, '?receipt=txn_acme_018');

    await usage.receiptButton('Add as external ID of…').click();
    const dialog = usage.externalIdDialog();
    await expect(dialog).toContainText(
      'The integration sent gpt-5-mini-2025-08-07, which the catalogue does not know.',
    );
    await expect(dialog).toContainText(
      'Suggested: its name starts with the slug of GPT-5 mini.',
    );
    await expect(dialog).toContainText('Past inferences are not re-priced.');
    await dialog.getByRole('button', { name: 'Add external ID' }).click();

    await expectToast(
      page,
      'gpt-5-mini-2025-08-07 is now an external ID of GPT-5 mini.',
    );
    await expect(usage.section('Why it was not charged')).toContainText(
      'gpt-5-mini-2025-08-07 has been added to GPT-5 mini since.',
    );
    await expect(usage.receiptButton('Add as external ID of…')).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      body: {
        externalIds: expect.arrayContaining(['gpt-5-mini-2025-08-07']),
      },
      pathname: '/api/models/gpt-5-mini',
    });
  });

  test('suggests nothing for a name no slug starts, and adds nothing until a model is chosen', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    const writes = recordWrites(page, MODEL_WRITES);
    await usage.goto(ACME, '?receipt=txn_acme_008');

    await usage.receiptButton('Add as external ID of…').click();
    const dialog = usage.externalIdDialog();
    await expect(dialog).toContainText('mistral-large-2411');
    await expect(dialog).not.toContainText('Suggested:');
    await expect(
      dialog.getByRole('button', { name: 'Add external ID' }),
    ).toBeDisabled();
    expect(writes).toEqual([]);
  });
});
