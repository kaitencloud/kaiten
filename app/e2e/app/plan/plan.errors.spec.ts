import { expect, recordWrites, test } from '../_support/app-test';
import { PlanPageDriver } from '../_support/drivers/plan.driver';
import type { PlanSessionRefusal } from '../_support/model/plan-app-model';
import { installPlanAppMocks } from '../_support/mocks/install-plan-app-mocks';
import {
  createPlanSessionRefusedModel,
  createPlanUnavailableOnceModel,
} from './plan.scenarios';

// When saas-api mints no session, the page says why in a card of its own, and nothing of
// the SDK is drawn. Only what can change by itself is offered again: an organization
// still being set up, and Kaiten Cloud out of reach; a flag or a role does not change on
// a retry.

const REFUSALS: Array<{
  description: string;
  problem: string;
  refusal: PlanSessionRefusal;
  retryable: boolean;
  title: string;
}> = [
  {
    description:
      'Plan & usage is not available for your organization. Contact us to change your plan.',
    problem: 'not-enabled',
    refusal: 'notEnabled',
    retryable: false,
    title: 'Not available for this organization',
  },
  {
    description:
      'Kaiten Cloud has no plan for your organization yet. Try again in a few minutes.',
    problem: 'not-provisioned',
    refusal: 'notProvisioned',
    retryable: true,
    title: 'Your organization is still being set up',
  },
  {
    description:
      'Only an administrator of the organization can see and change its plan.',
    problem: 'forbidden',
    refusal: 'forbidden',
    retryable: false,
    title: 'Administrators only',
  },
  {
    description:
      'Kaiten Cloud did not answer. Nothing has changed on your plan. Try again.',
    problem: 'unavailable',
    refusal: 'unavailable',
    retryable: true,
    title: 'Your plan cannot be loaded right now',
  },
];

test.describe('a session saas-api refuses', () => {
  for (const { description, problem, refusal, retryable, title } of REFUSALS) {
    test(`draws ${refusal} as its card, ${retryable ? 'offered again' : 'with nothing to retry'}`, async ({
      page,
    }) => {
      const plan = new PlanPageDriver(page);
      await installPlanAppMocks(page, createPlanSessionRefusedModel(refusal));
      await plan.goto();

      await expect(plan.problem()).toHaveAttribute('data-problem', problem);
      await expect(plan.problem()).toContainText(title);
      await expect(plan.problem()).toContainText(description);
      await expect(plan.problem().getByRole('button')).toHaveCount(
        retryable ? 1 : 0,
      );
      await expect(plan.heading()).toBeVisible();
      await expect(plan.portal()).toHaveCount(0);
    });
  }

  test('mints a session again on "Try again", and shows the plan once Kaiten Cloud answers', async ({
    page,
  }) => {
    const plan = new PlanPageDriver(page);
    await installPlanAppMocks(page, createPlanUnavailableOnceModel());
    const minted = recordWrites(page, /^\/api\/plan\/session$/);
    await plan.goto();
    await expect(plan.problem()).toHaveAttribute('data-problem', 'unavailable');

    await plan.problem().getByRole('button', { name: 'Try again' }).click();

    await expect(plan.problem()).toHaveCount(0);
    await expect(plan.currentPlanPrice()).toHaveText('$0.00/month');
    expect(minted).toHaveLength(2);
  });
});
