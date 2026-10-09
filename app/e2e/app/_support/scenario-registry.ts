/**
 * Canonical browser-free inventory of scenario factories and explicit variants.
 * Consumers execute factories; model constructors validate their API seeds.
 */
import {
  createAddonsBillingModel,
  createAddonsInstancesModel,
  createAddonsLicensesModel,
  createEmptyAddonsBillingModel,
} from '../addons/addons.scenarios';
import { createUsageEventsAuditTrailModel } from '../audit-trail/audit-trail.scenarios';
import {
  createBillingDisabledModel,
  createBillingFeatureGatedModel,
  createBillingFullModel,
  createBillingOutageModel,
  createBillingStackModel,
  createDeletedInstanceModel,
  createEmptyInvoicesModel,
  createInvoicesModel,
  createLongHandoffQueueModel,
  createManyAcmeInvoicesModel,
  createManyInvoicesModel,
  createManyReportsModel,
  createMismatchedTotalsModel,
  createStripeBillingModel,
  createSubscriptionsModel,
} from '../billing/billing.scenarios';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  createLifecycleLicensesModel,
  createLifecycleStripeModels,
} from '../billing/lifecycle-world';
import {
  createDisconnectedAttioModel,
  createStripeConnectorModels,
} from '../connectors/connectors.scenarios';
import { createDashboardReadModel } from '../dashboard/dashboard.scenarios';
import {
  createNotificationsFeedModel,
  createMixedObjectsFeedModel,
} from '../notifications/notifications.scenarios';
import {
  createEmptyVouchersBillingModel,
  createVouchersBillingModel,
  createVouchersInstancesModel,
  createVouchersLicensesModel,
  createVouchersNotShippedBillingModel,
} from '../vouchers/vouchers.scenarios';
import {
  createBillingCustomersModel,
  createCustomersListModel,
  createStripeCustomersModels,
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
  createReferencedEntitlementModel,
  createReferencedLastEntitlementModel,
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
  createBilledInstancesModel,
  createCustomerScopedInstanceModel,
  createDeletableInstanceModel,
  createDeployableInstanceModel,
  createEditableInstanceModel,
  createEmptyInstancesModel,
  createInstancesListModel,
  createTypedMetadataInstanceModel,
} from '../instances/instances.scenarios';
import {
  createEmptyPublishableKeysBillingModel,
  createPublishableKeysBillingModel,
  createSdkServiceAccount,
} from '../integrations/integrations.scenarios';
import {
  createBilledCatalogModel,
  createDraftPricesModel,
  createLicenseCatalogModel,
  createNumberedLicenseFamilyModel,
  createPricedCatalogModel,
  createTwoFlatFeesModel,
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
  ['addons/createAddonsBillingModel', createAddonsBillingModel],
  ['addons/createAddonsInstancesModel', createAddonsInstancesModel],
  ['addons/createAddonsLicensesModel', createAddonsLicensesModel],
  ['addons/createEmptyAddonsBillingModel', createEmptyAddonsBillingModel],
  ['vouchers/createVouchersBillingModel', createVouchersBillingModel],
  ['vouchers/createVouchersInstancesModel', createVouchersInstancesModel],
  ['vouchers/createVouchersLicensesModel', createVouchersLicensesModel],
  ['vouchers/createEmptyVouchersBillingModel', createEmptyVouchersBillingModel],
  [
    'vouchers/createVouchersNotShippedBillingModel',
    createVouchersNotShippedBillingModel,
  ],
  ['connectors/createDisconnectedAttioModel', createDisconnectedAttioModel],
  ['connectors/createStripeConnectorModels', createStripeConnectorModels],
  [
    "connectors/createStripeConnectorModels({ standing: 'connected' })",
    () => createStripeConnectorModels({ standing: 'connected' }),
  ],
  [
    "connectors/createStripeConnectorModels({ standing: 'vaultMissing' })",
    () => createStripeConnectorModels({ standing: 'vaultMissing' }),
  ],
  [
    "connectors/createStripeConnectorModels({ standing: 'notEntitled' })",
    () => createStripeConnectorModels({ standing: 'notEntitled' }),
  ],
  ['billing/createSubscriptionsModel', createSubscriptionsModel],
  ['billing/createLifecycleBillingModel', createLifecycleBillingModel],
  ['billing/createLifecycleInstancesModel', createLifecycleInstancesModel],
  ['billing/createLifecycleLicensesModel', createLifecycleLicensesModel],
  ['billing/createLifecycleStripeModels', createLifecycleStripeModels],
  [
    'billing/createLifecycleStripeModels({ billingEmail: null })',
    () => createLifecycleStripeModels({ billingEmail: null }),
  ],
  [
    "billing/createLifecycleStripeModels({ standing: 'available' })",
    () => createLifecycleStripeModels({ standing: 'available' }),
  ],
  ['customers/createBillingCustomersModel', createBillingCustomersModel],
  ['customers/createStripeCustomersModels', createStripeCustomersModels],
  [
    "customers/createStripeCustomersModels({ standing: 'available' })",
    () => createStripeCustomersModels({ standing: 'available' }),
  ],
  [
    'entitlements/createReferencedEntitlementModel',
    createReferencedEntitlementModel,
  ],
  [
    'entitlements/createReferencedLastEntitlementModel',
    createReferencedLastEntitlementModel,
  ],
  ['instances/createBilledInstancesModel', createBilledInstancesModel],
  ['dashboard/createDashboardReadModel', createDashboardReadModel],
  ['notifications/createNotificationsFeedModel', createNotificationsFeedModel],
  ['notifications/createMixedObjectsFeedModel', createMixedObjectsFeedModel],
  ['entitlements/createUnitEntitlementModel', createUnitEntitlementModel],
  ['entitlements/createIconedEntitlementModel', createIconedEntitlementModel],
  [
    'licenses/createNumberedLicenseFamilyModel',
    createNumberedLicenseFamilyModel,
  ],
  ['licenses/createPricedCatalogModel', createPricedCatalogModel],
  ['licenses/createBilledCatalogModel', createBilledCatalogModel],
  ['licenses/createDraftPricesModel', createDraftPricesModel],
  ['licenses/createTwoFlatFeesModel', createTwoFlatFeesModel],
  [
    'audit-trail/createUsageEventsAuditTrailModel',
    createUsageEventsAuditTrailModel,
  ],
  ['billing/createBillingStackModel', createBillingStackModel],
  ['billing/createBillingFullModel', createBillingFullModel],
  ['billing/createBillingFeatureGatedModel', createBillingFeatureGatedModel],
  [
    "billing/createBillingDisabledModel('DEPLOYMENT_DISABLED')",
    () => createBillingDisabledModel('DEPLOYMENT_DISABLED'),
  ],
  [
    "billing/createBillingDisabledModel('NOT_ENTITLED')",
    () => createBillingDisabledModel('NOT_ENTITLED'),
  ],
  [
    "billing/createBillingOutageModel('missingScope')",
    () => createBillingOutageModel('missingScope'),
  ],
  [
    "billing/createBillingOutageModel('unavailable')",
    () => createBillingOutageModel('unavailable'),
  ],
  [
    "billing/createBillingOutageModel('notImplemented')",
    () => createBillingOutageModel('notImplemented'),
  ],
  [
    "billing/createBillingOutageModel('hang')",
    () => createBillingOutageModel('hang'),
  ],
  ['billing/createInvoicesModel', createInvoicesModel],
  ['billing/createStripeBillingModel', createStripeBillingModel],
  [
    "billing/createStripeBillingModel({ sync: 'failing' })",
    () => createStripeBillingModel({ sync: 'failing' }),
  ],
  [
    'billing/createInvoicesModel({ stripe: true })',
    () => createInvoicesModel({ stripe: true }),
  ],
  [
    "billing/createInvoicesModel({ retentionStart: '2026-04-01T00:00:00.000Z' })",
    () => createInvoicesModel({ retentionStart: '2026-04-01T00:00:00.000Z' }),
  ],
  ['billing/createEmptyInvoicesModel', createEmptyInvoicesModel],
  [
    'billing/createInvoicesModel({ retentionMonths: 1 })',
    () => createInvoicesModel({ retentionMonths: 1 }),
  ],
  ['billing/createManyInvoicesModel', createManyInvoicesModel],
  ['billing/createManyAcmeInvoicesModel', createManyAcmeInvoicesModel],
  ['billing/createManyReportsModel', createManyReportsModel],
  ['billing/createLongHandoffQueueModel', createLongHandoffQueueModel],
  ['billing/createDeletedInstanceModel', createDeletedInstanceModel],
  ['billing/createMismatchedTotalsModel', createMismatchedTotalsModel],
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
  [
    'integrations/createPublishableKeysBillingModel',
    createPublishableKeysBillingModel,
  ],
  [
    'integrations/createEmptyPublishableKeysBillingModel',
    createEmptyPublishableKeysBillingModel,
  ],
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
