/**
 * Smoke-check: instantiate every scenario factory and assert that the
 * `parseContract` validation in each model constructor accepts the seed.
 *
 * This catches the "model class drifts from API schema" regression at the
 * cheapest possible level — no browser, no Playwright, just constructors.
 *
 * Run with: `pnpm exec tsx scripts/check-e2e-contracts.ts`
 */
import { bulkFlagEvaluation } from '../e2e/app/_support/model/platform-flags';
import { createUsageEventsAuditTrailModel } from '../e2e/app/audit-trail/audit-trail.scenarios';
import {
  createCustomersListModel,
  createDeletableCustomerModel,
  createEditableCustomerModel,
  createEmptyCustomersModel,
  createFuzzCustomersReadModel,
} from '../e2e/app/customers/customers.scenarios';
import {
  createDeletableEntitlementModel,
  createEmptyEntitlementsModel,
  createEntitlementsListModel,
  createPeriodicEntitlementModel,
} from '../e2e/app/entitlements/entitlements.scenarios';
import {
  createEditableFeatureFlagModel,
  createEmptyFeatureFlagsModel,
  createEvaluableFeatureFlagModel,
  createFeatureFlagsListModel,
  createNumberFeatureFlagModel,
  createObjectFeatureFlagModel,
} from '../e2e/app/feature-flags/feature-flags.scenarios';
import {
  createCustomerScopedInstanceModel,
  createDeletableInstanceModel,
  createDeployableInstanceModel,
  createEditableInstanceModel,
  createEmptyInstancesModel,
  createInstancesListModel,
  createTypedMetadataInstanceModel,
} from '../e2e/app/instances/instances.scenarios';
import {
  createSdkServiceAccount,
  WEBHOOKS_ON,
} from '../e2e/app/integrations/integrations.scenarios';
import { createLicenseCatalogModel } from '../e2e/app/licenses/licenses.scenarios';
import {
  createComponentsCatalogModel,
  createDeploymentFlowModel,
  createDeploymentZoneEditModel,
  createReleaseCreationModel,
  createReleaseManagementReadModel,
  createSupersededReleaseModel,
} from '../e2e/app/release-management/release-management.scenarios';

type Check = readonly [name: string, factory: () => unknown];

const checks: Check[] = [
  [
    'audit-trail/createUsageEventsAuditTrailModel',
    createUsageEventsAuditTrailModel,
  ],
  ['customers/createCustomersListModel', createCustomersListModel],
  ['customers/createEditableCustomerModel', createEditableCustomerModel],
  ['customers/createDeletableCustomerModel', createDeletableCustomerModel],
  ['customers/createEmptyCustomersModel', createEmptyCustomersModel],
  [
    'customers/createFuzzCustomersReadModel(2026042501)',
    () => createFuzzCustomersReadModel(2026042501),
  ],
  [
    'customers/createFuzzCustomersReadModel(2026042502)',
    () => createFuzzCustomersReadModel(2026042502),
  ],
  [
    'customers/createFuzzCustomersReadModel(2026042503)',
    () => createFuzzCustomersReadModel(2026042503),
  ],
  ['entitlements/createEntitlementsListModel', createEntitlementsListModel],
  ['entitlements/createEmptyEntitlementsModel', createEmptyEntitlementsModel],
  [
    'entitlements/createDeletableEntitlementModel',
    createDeletableEntitlementModel,
  ],
  [
    'entitlements/createPeriodicEntitlementModel',
    createPeriodicEntitlementModel,
  ],
  ['feature-flags/createFeatureFlagsListModel', createFeatureFlagsListModel],
  ['feature-flags/createEmptyFeatureFlagsModel', createEmptyFeatureFlagsModel],
  [
    'feature-flags/createEditableFeatureFlagModel',
    createEditableFeatureFlagModel,
  ],
  [
    'feature-flags/createEvaluableFeatureFlagModel',
    createEvaluableFeatureFlagModel,
  ],
  ['feature-flags/createNumberFeatureFlagModel', createNumberFeatureFlagModel],
  ['feature-flags/createObjectFeatureFlagModel', createObjectFeatureFlagModel],
  ['instances/createInstancesListModel', createInstancesListModel],
  ['instances/createEmptyInstancesModel', createEmptyInstancesModel],
  ['instances/createEditableInstanceModel', createEditableInstanceModel],
  ['instances/createDeletableInstanceModel', createDeletableInstanceModel],
  ['instances/createDeployableInstanceModel', createDeployableInstanceModel],
  [
    'instances/createTypedMetadataInstanceModel',
    createTypedMetadataInstanceModel,
  ],
  [
    'instances/createCustomerScopedInstanceModel',
    createCustomerScopedInstanceModel,
  ],
  ['integrations/createSdkServiceAccount', createSdkServiceAccount],
  ['integrations/WEBHOOKS_ON', () => bulkFlagEvaluation(WEBHOOKS_ON)],
  ['licenses/createLicenseCatalogModel', createLicenseCatalogModel],
  [
    'release-management/createReleaseManagementReadModel',
    createReleaseManagementReadModel,
  ],
  [
    'release-management/createReleaseCreationModel',
    createReleaseCreationModel,
  ],
  [
    'release-management/createComponentsCatalogModel',
    createComponentsCatalogModel,
  ],
  [
    'release-management/createDeploymentZoneEditModel',
    createDeploymentZoneEditModel,
  ],
  [
    'release-management/createDeploymentFlowModel',
    createDeploymentFlowModel,
  ],
  [
    'release-management/createSupersededReleaseModel',
    createSupersededReleaseModel,
  ],
];

let failed = 0;
for (const [name, factory] of checks) {
  try {
    factory();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name}\n     ${message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} scenario factory(ies) failed contract validation.`);
  process.exit(1);
}

console.log(`\n${checks.length} scenario factories pass their contracts.`);
