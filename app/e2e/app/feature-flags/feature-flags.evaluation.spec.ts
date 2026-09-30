import { test } from '../_support/app-test';
import { FeatureFlagDetailDriver } from '../_support/drivers/feature-flag-detail.driver';
import { FeatureFlagTryItDriver } from '../_support/drivers/feature-flag-try-it.driver';
import { installFeatureFlagAppMocks } from '../_support/mocks/install-feature-flag-app-mocks';
import { createEvaluableFeatureFlagModel } from './feature-flags.scenarios';

test('evaluates a feature flag from try it and records the sample', async ({
  page,
}) => {
  const model = createEvaluableFeatureFlagModel();
  const detail = new FeatureFlagDetailDriver(page);
  const tryIt = new FeatureFlagTryItDriver(page);

  await installFeatureFlagAppMocks(page, model);
  await detail.goto('pricing-layout');
  await detail.expectLoaded('Pricing Layout');

  await detail.openTryIt();

  await tryIt.fillContext('{');
  await tryIt.evaluate();
  await tryIt.expectError(
    'Invalid JSON — please fix the syntax and try again.',
  );

  await tryIt.fillContext(
    '{\n  "targetingKey": "user-123",\n  "plan": "enterprise"\n}',
  );
  await tryIt.evaluate();
  await tryIt.expectResultVariant('premium');
  await tryIt.expectEvaluatedValue('"premium"');
  await tryIt.close();

  await detail.openTab('Try it history');
  await detail.expectEvaluationSampleVisible('premium');
  await detail.expectEvaluationSampleVisible('TARGETING_MATCH');
});
