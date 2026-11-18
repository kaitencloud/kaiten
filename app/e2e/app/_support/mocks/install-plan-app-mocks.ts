import type { Page } from '@playwright/test';
import type { PlanAppModel } from '../model/plan-app-model';
import { installFlagEvaluations, installMswMocks } from './install-app-mocks';

/**
 * The organization's own Kaiten Cloud plan (`PlanAppModel`), and the `plan-billing`
 * platform flag that gives it the Plan & usage page: on, unless a spec asks for the
 * organization the flag leaves out, where `/settings/plan` does not exist.
 */
export async function installPlanAppMocks(
  page: Page,
  model: PlanAppModel,
  { planBilling = true }: { planBilling?: boolean } = {},
) {
  await installMswMocks(page, 'plan', model);
  await installFlagEvaluations(page, { 'plan-billing': planBilling });
}
