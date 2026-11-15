import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { AiModelsDriver } from '../_support/drivers/ai-models.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// Deleting a model from the list. A model that rules name is not deleted: the
// dialog says so and offers Archive. A model the API refuses to delete for a
// rule the list does not count (an archived rule) gets the same offer once the
// API answers 409. A model nothing names is deleted.

const MODEL_WRITES = /^\/api\/models\/[^/]+$/;

test.describe('deleting a model', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('a model that rules name is archived instead', async ({ page }) => {
    const models = new AiModelsDriver(page);
    const writes = recordWrites(page, MODEL_WRITES);
    await models.goto();
    await models.search('gpt-5-mini');

    await models.delete('GPT-5 mini');
    const dialog = models.removalDialog();
    await expect(dialog).toContainText('GPT-5 mini cannot be deleted');
    await expect(dialog).toContainText(
      'A model a rule references cannot be deleted.',
    );
    await expect(
      dialog.getByRole('button', { name: 'Delete', exact: true }),
    ).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Archive model' }).click();

    await expectToast(page, 'GPT-5 mini is archived.');
    await expect(models.row('GPT-5 mini')).toContainText('Archived');
    expect(writes.map(({ method }) => method)).not.toContain('DELETE');
  });

  test('a deletion the API refuses for an archived rule turns into the same offer', async ({
    page,
  }) => {
    const models = new AiModelsDriver(page);
    await models.goto();
    await models.search('claude-opus');

    await expect(models.rulesLink('Claude Opus 4.1')).toContainText('No rule');
    await models.delete('Claude Opus 4.1');
    await models
      .removalDialog()
      .getByRole('button', { name: 'Delete', exact: true })
      .click();

    const dialog = models.removalDialog();
    await expect(dialog).toContainText(
      'The API refused the deletion: a conversion rule references this model',
    );
    await expect(
      dialog.getByRole('button', { name: 'Archive model' }),
    ).toBeVisible();
  });

  test('a model nothing names is deleted', async ({ page }) => {
    const models = new AiModelsDriver(page);
    const writes = recordWrites(page, MODEL_WRITES);
    await models.goto();
    await models.search('voyage-3');

    await models.delete('Voyage 3');
    await models
      .removalDialog()
      .getByRole('button', { name: 'Delete', exact: true })
      .click();

    await expectToast(page, 'Voyage 3 is deleted.');
    await expect(models.row('Voyage 3')).toHaveCount(0);
    expect(writes).toEqual([
      { body: null, method: 'DELETE', pathname: '/api/models/voyage-3' },
    ]);
  });
});
