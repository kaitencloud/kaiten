/**
 * Canonical browser-free inventory of scenario factories and explicit variants.
 * Consumers execute factories; model constructors validate their API seeds.
 */
import { bulkFlagEvaluation } from './model/platform-flags';
import { createUsageEventsAuditTrailModel } from '../audit-trail/audit-trail.scenarios';
import { createDisconnectedAttioModel } from '../connectors/connectors.scenarios';
import { createDashboardReadModel } from '../dashboard/dashboard.scenarios';
import {
  createNotificationsFeedModel,
  createMixedObjectsFeedModel,
} from '../notifications/notifications.scenarios';
import {
  createCustomersListModel,
  createDeletableCustomerModel,
  createEditableCustomerModel,
  createEmptyCustomersModel,
  createFuzzCustomersReadModel,
} from '../customers/customers.scenarios';
import {
  createDeletableEntitlementModel,
  createEmptyEntitlementsModel,
  createEntitlementsListModel,
  createPeriodicEntitlementModel,
  createUnitEntitlementModel,
  createIconedEntitlementModel,
} from '../entitlements/entitlements.scenarios';
import {
  createEditableFeatureFlagModel,
  createEmptyFeatureFlagsModel,
  createEvaluableFeatureFlagModel,
  createFeatureFlagsListModel,
  createNumberFeatureFlagModel,
  createObjectFeatureFlagModel,
} from '../feature-flags/feature-flags.scenarios';
import {
  createCustomerScopedInstanceModel,
  createDeletableInstanceModel,
  createDeployableInstanceModel,
  createEditableInstanceModel,
  createEmptyInstancesModel,
  createInstancesListModel,
  createTypedMetadataInstanceModel,
} from '../instances/instances.scenarios';
import {
  createSdkServiceAccount,
  WEBHOOKS_ON,
} from '../integrations/integrations.scenarios';
import {
  createLicenseCatalogModel,
  createNumberedLicenseFamilyModel,
} from '../licenses/licenses.scenarios';
import {
  createComponentsCatalogModel,
  createDeploymentFlowModel,
  createDeploymentZoneEditModel,
  createReleaseCreationModel,
  createReleaseManagementReadModel,
  createSupersededReleaseModel,
} from '../release-management/release-management.scenarios';

export type ScenarioCheck = readonly [name: string, factory: () => unknown];

export const e2eScenarioChecks: readonly ScenarioCheck[] = [
  ['connectors/createDisconnectedAttioModel', createDisconnectedAttioModel],
  ['dashboard/createDashboardReadModel', createDashboardReadModel],
  ['notifications/createNotificationsFeedModel', createNotificationsFeedModel],
  ['notifications/createMixedObjectsFeedModel', createMixedObjectsFeedModel],
  ['entitlements/createUnitEntitlementModel', createUnitEntitlementModel],
  ['entitlements/createIconedEntitlementModel', createIconedEntitlementModel],
  [
    'licenses/createNumberedLicenseFamilyModel',
    createNumberedLicenseFamilyModel,
  ],
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
  ['release-management/createReleaseCreationModel', createReleaseCreationModel],
  [
    'release-management/createComponentsCatalogModel',
    createComponentsCatalogModel,
  ],
  [
    'release-management/createDeploymentZoneEditModel',
    createDeploymentZoneEditModel,
  ],
  ['release-management/createDeploymentFlowModel', createDeploymentFlowModel],
  [
    'release-management/createSupersededReleaseModel',
    createSupersededReleaseModel,
  ],
];
