import type { SerializedAuditTrailAppModel } from '../model/audit-trail-app-model';
import type { SerializedBillingAppModel } from '../model/billing-app-model';
import type { SerializedConnectorAppModel } from '../model/connector-app-model';
import type { SerializedCustomerAppModel } from '../model/customer-app-model';
import type { SerializedDashboardAppModel } from '../model/dashboard-app-model';
import type { SerializedEntitlementAppModel } from '../model/entitlement-app-model';
import type { SerializedFeatureFlagAppModel } from '../model/feature-flag-app-model';
import type { SerializedInstanceAppModel } from '../model/instance-app-model';
import type { SerializedLicenseAppModel } from '../model/license-app-model';
import type { SerializedNotificationAppModel } from '../model/notification-app-model';
import type { SerializedReleaseManagementAppModel } from '../model/release-management-app-model';
import type { ServiceAccount } from '@/api-client';

/** Transport-neutral serialized state installed before app navigation. */
export type E2EMswConfig = {
  auditTrail?: SerializedAuditTrailAppModel;
  billing?: SerializedBillingAppModel;
  connectors?: SerializedConnectorAppModel;
  customers?: SerializedCustomerAppModel;
  dashboard?: SerializedDashboardAppModel;
  entitlements?: SerializedEntitlementAppModel;
  featureFlags?: SerializedFeatureFlagAppModel;
  // Mocking a backend and opening its platform gate are independent decisions.
  // An absent slot answers with no flags in E2E; dev may opt into passthrough.
  flagEvaluations?: Record<string, boolean>;
  instances?: SerializedInstanceAppModel;
  licenses?: SerializedLicenseAppModel;
  notifications?: SerializedNotificationAppModel;
  releaseManagement?: SerializedReleaseManagementAppModel;
  integrationStubs?: {
    serviceAccount?: ServiceAccount;
    emptyWebhooks?: boolean;
  };
};

export type MswSlotKey = keyof E2EMswConfig;
export type ModelSlotKey = Exclude<
  MswSlotKey,
  'flagEvaluations' | 'integrationStubs'
>;
export type SerializableModel<K extends ModelSlotKey> = {
  serializeForMsw(): NonNullable<E2EMswConfig[K]>;
};
export const E2E_MSW_STORAGE_KEY = '__KAITEN_E2E_MSW__';
