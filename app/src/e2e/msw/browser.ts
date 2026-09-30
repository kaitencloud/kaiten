import { HttpResponse, http } from 'msw';
import { setupWorker } from 'msw/browser';
import type {
  ComponentWritable,
  ConnectorSettingsWritable,
  ReleaseWritable,
  CustomerWritable,
  DeploymentZoneWritable,
  Entitlement,
  EvaluationRequest,
  FeatureFlagWritable,
  InstanceWritable,
} from '@/api-client';
import type { SerializedAuditTrailAppModel } from '../../../e2e/app/_support/model/audit-trail-app-model';
import { AuditTrailAppModel } from '../../../e2e/app/_support/model/audit-trail-app-model';
import type { SerializedConnectorAppModel } from '../../../e2e/app/_support/model/connector-app-model';
import { ConnectorAppModel } from '../../../e2e/app/_support/model/connector-app-model';
import type { SerializedCustomerAppModel } from '../../../e2e/app/_support/model/customer-app-model';
import { CustomerAppModel } from '../../../e2e/app/_support/model/customer-app-model';
import type { SerializedDashboardAppModel } from '../../../e2e/app/_support/model/dashboard-app-model';
import { DashboardAppModel } from '../../../e2e/app/_support/model/dashboard-app-model';
import type { SerializedEntitlementAppModel } from '../../../e2e/app/_support/model/entitlement-app-model';
import { EntitlementAppModel } from '../../../e2e/app/_support/model/entitlement-app-model';
import type { SerializedFeatureFlagAppModel } from '../../../e2e/app/_support/model/feature-flag-app-model';
import { FeatureFlagAppModel } from '../../../e2e/app/_support/model/feature-flag-app-model';
import type { SerializedInstanceAppModel } from '../../../e2e/app/_support/model/instance-app-model';
import { InstanceAppModel } from '../../../e2e/app/_support/model/instance-app-model';
import type { SerializedLicenseAppModel } from '../../../e2e/app/_support/model/license-app-model';
import { LicenseAppModel } from '../../../e2e/app/_support/model/license-app-model';
import type { SerializedNotificationAppModel } from '../../../e2e/app/_support/model/notification-app-model';
import { NotificationAppModel } from '../../../e2e/app/_support/model/notification-app-model';
import {
  bulkFlagEvaluation,
  NO_PLATFORM_FLAGS,
} from '../../../e2e/app/_support/model/platform-flags';
import type { SerializedReleaseManagementAppModel } from '../../../e2e/app/_support/model/release-management-app-model';
import { ReleaseManagementAppModel } from '../../../e2e/app/_support/model/release-management-app-model';
import {
  asFallback,
  decodeLastPathSegment,
  getPathSegments,
  graphqlOperationHandler,
  parseRequestJson,
  withErrorHandling,
  withFallbacksLast,
} from './handler-factory';
import { licenseHandlers } from './license-handlers';
import { notificationHandlers } from './notification-handlers';

export type E2EMswConfig = {
  auditTrail?: SerializedAuditTrailAppModel;
  connectors?: SerializedConnectorAppModel;
  customers?: SerializedCustomerAppModel;
  dashboard?: SerializedDashboardAppModel;
  entitlements?: SerializedEntitlementAppModel;
  featureFlags?: SerializedFeatureFlagAppModel;
  /**
   * Boolean answers for the bulk OFREP evaluation the app gates its own
   * features on (`lib/feature-flags`), keyed by flag slug.
   *
   * Its own slot rather than a side effect of another one: mocking a feature's
   * backend and enabling that feature are different decisions, and a spec that
   * wants the gate CLOSED with the backend mocked has to be able to say so.
   *
   * Absent, the worker answers with no flag on (`NO_PLATFORM_FLAGS`) rather
   * than letting the request through: a spec that says nothing about flags runs
   * the open-source console, the same on every machine.
   */
  flagEvaluations?: Record<string, boolean>;
  instances?: SerializedInstanceAppModel;
  licenses?: SerializedLicenseAppModel;
  notifications?: SerializedNotificationAppModel;
  releaseManagement?: SerializedReleaseManagementAppModel;
};

const flagEvaluationHandlers = (flags: Record<string, boolean>) => [
  http.post(/\/api\/ofrep\/v1\/evaluate\/flags$/, () =>
    HttpResponse.json(bulkFlagEvaluation(flags)),
  ),
];

const E2E_MSW_STORAGE_KEY = '__KAITEN_E2E_MSW__';
const noop = () => {};

type PersistMswState = () => void;

function readStoredConfig(): E2EMswConfig {
  try {
    return JSON.parse(
      window.sessionStorage.getItem(E2E_MSW_STORAGE_KEY) ?? '{}',
    ) as E2EMswConfig;
  } catch {
    return {};
  }
}

function writeStoredConfig(config: E2EMswConfig) {
  window.sessionStorage.setItem(E2E_MSW_STORAGE_KEY, JSON.stringify(config));
  (window as E2EWindow).__KAITEN_E2E_MSW__ = config;
}

function persistSlot<K extends keyof E2EMswConfig>(
  slot: K,
  state: E2EMswConfig[K],
) {
  writeStoredConfig({
    ...readStoredConfig(),
    [slot]: state,
  });
}

type E2EWindow = Window & {
  __KAITEN_E2E_MSW__?: E2EMswConfig;
};

const customerHandlers = (
  model: CustomerAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler({
    GetCustomersWithInstances: () => model.getCustomersWithInstances(),
    GetInstancesWithRelations: () => model.getInstancesWithRelations(),
  }),
  http.get(/\/api\/customers$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listCustomers() }),
  ),
  http.post(
    /\/api\/customers$/,
    withErrorHandling('Unexpected customer mock error', async ({ request }) => {
      const customer = model.createCustomer(
        await parseRequestJson<CustomerWritable>(request),
      );
      persist();
      return HttpResponse.json(customer, { status: 201 });
    }),
  ),
  http.get(
    /\/api\/customers\/[^/]+$/,
    withErrorHandling('Unexpected customer mock error', ({ request }) =>
      HttpResponse.json(model.getCustomer(decodeLastPathSegment(request.url))),
    ),
  ),
  http.get(
    /\/api\/customers\/[^/]+\/integrations\/[^/]+$/,
    withErrorHandling(
      'Unexpected customer integration mock error',
      ({ request }) => {
        const segments = getPathSegments(request.url);
        const customerSlug = decodeURIComponent(segments[2] ?? '');
        const integration = model.getCustomerIntegration(customerSlug);
        persist();
        return HttpResponse.json(integration);
      },
    ),
  ),
  http.put(
    /\/api\/customers\/[^/]+$/,
    withErrorHandling('Unexpected customer mock error', async ({ request }) => {
      const customer = model.updateCustomer(
        decodeLastPathSegment(request.url),
        await parseRequestJson<CustomerWritable>(request),
      );
      persist();
      return HttpResponse.json(customer);
    }),
  ),
  http.delete(
    /\/api\/customers\/[^/]+$/,
    withErrorHandling('Unexpected customer mock error', ({ request }) => {
      model.deleteCustomer(decodeLastPathSegment(request.url));
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];

const auditTrailHandlers = (model: AuditTrailAppModel) => [
  graphqlOperationHandler({
    GetGlobalAuditTrail: (variables) => model.getGlobalAuditTrail(variables),
  }),
];

const dashboardHandlers = (model: DashboardAppModel) => [
  graphqlOperationHandler({
    GetDashboardData: () => model.getDashboardData(),
  }),
];

const connectorHandlers = (
  model: ConnectorAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler({
    GetAttioSyncedRecords: () => model.getSyncedRecords(),
  }),
  http.get(
    /\/api\/connectors\/[^/]+\/settings$/,
    withErrorHandling('Unexpected connector mock error', () =>
      HttpResponse.json(model.getSettings()),
    ),
  ),
  http.put(
    /\/api\/connectors\/[^/]+\/settings$/,
    withErrorHandling(
      'Unexpected connector mock error',
      async ({ request }) => {
        const settings = model.updateSettings(
          await parseRequestJson<ConnectorSettingsWritable>(request),
        );
        persist();
        return HttpResponse.json(settings);
      },
    ),
  ),
  http.delete(
    /\/api\/connectors\/[^/]+\/settings$/,
    withErrorHandling('Unexpected connector mock error', () => {
      model.deleteSettings();
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];

const entitlementHandlers = (
  model: EntitlementAppModel,
  persist: PersistMswState = noop,
) => [
  http.get(/\/api\/entitlements$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listEntitlements() }),
  ),
  http.post(
    /\/api\/entitlements$/,
    withErrorHandling(
      'Unexpected entitlement mock error',
      async ({ request }) => {
        const entitlement = model.createEntitlement(
          await parseRequestJson<Partial<Entitlement>>(request),
        );
        persist();
        return HttpResponse.json(entitlement, { status: 201 });
      },
    ),
  ),
  http.get(
    /\/api\/entitlements\/[^/]+$/,
    withErrorHandling('Unexpected entitlement mock error', ({ request }) =>
      HttpResponse.json(
        model.getEntitlement(decodeLastPathSegment(request.url)),
      ),
    ),
  ),
  http.put(
    /\/api\/entitlements\/[^/]+$/,
    withErrorHandling(
      'Unexpected entitlement mock error',
      async ({ request }) => {
        const entitlement = model.updateEntitlement(
          decodeLastPathSegment(request.url),
          await parseRequestJson<Partial<Entitlement>>(request),
        );
        persist();
        return HttpResponse.json(entitlement);
      },
    ),
  ),
  http.delete(
    /\/api\/entitlements\/[^/]+$/,
    withErrorHandling('Unexpected entitlement mock error', ({ request }) => {
      model.deleteEntitlement(decodeLastPathSegment(request.url));
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  // Entitlement groups: read-only stub used by the entitlement form.
  http.get(/\/api\/entitlement-groups$/, () =>
    HttpResponse.json({ hasMore: false, items: [] }),
  ),
  // Detail pages read sibling resources; keep this slot self-contained. These
  // are fallbacks: a slot that owns the resource answers first.
  asFallback(
    http.get(/\/api\/customers$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
  asFallback(
    http.get(/\/api\/instances$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
  asFallback(
    http.get(/\/api\/licenses$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
  asFallback(
    http.get(/\/api\/licenses\/[^/]+\/entitlements$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
];

const featureFlagHandlers = (
  model: FeatureFlagAppModel,
  persist: PersistMswState = noop,
) => [
  http.get(/\/api\/feature-flags$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listFeatureFlags() }),
  ),
  http.post(
    /\/api\/feature-flags$/,
    withErrorHandling(
      'Unexpected feature flag mock error',
      async ({ request }) => {
        const featureFlag = model.createFeatureFlag(
          await parseRequestJson<FeatureFlagWritable>(request),
        );
        persist();
        return HttpResponse.json(featureFlag, { status: 201 });
      },
    ),
  ),
  http.get(
    /\/api\/feature-flags\/[^/]+$/,
    withErrorHandling('Unexpected feature flag mock error', ({ request }) =>
      HttpResponse.json(
        model.getFeatureFlag(decodeLastPathSegment(request.url)),
      ),
    ),
  ),
  http.put(
    /\/api\/feature-flags\/[^/]+$/,
    withErrorHandling(
      'Unexpected feature flag mock error',
      async ({ request }) => {
        const featureFlag = model.updateFeatureFlag(
          decodeLastPathSegment(request.url),
          await parseRequestJson<FeatureFlagWritable>(request),
        );
        persist();
        return HttpResponse.json(featureFlag);
      },
    ),
  ),
  http.delete(
    /\/api\/feature-flags\/[^/]+$/,
    withErrorHandling('Unexpected feature flag mock error', ({ request }) => {
      model.deleteFeatureFlag(decodeLastPathSegment(request.url));
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.post(
    /\/api\/ofrep\/v1\/evaluate\/flags\/[^/]+$/,
    withErrorHandling(
      'Unexpected feature flag evaluation mock error',
      async ({ request }) => {
        const body = await parseRequestJson<EvaluationRequest>(request);
        return HttpResponse.json(
          model.evaluateFlag(
            decodeLastPathSegment(request.url),
            body.context ?? {},
          ),
        );
      },
    ),
  ),
];

const instanceHandlers = (
  model: InstanceAppModel,
  persist: PersistMswState = noop,
) => {
  const getCustomerSegmentSlug = (url: string) => {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(segments[2] ?? '');
  };

  return [
    graphqlOperationHandler({
      GetCustomersWithInstances: () => model.getCustomersWithInstances(),
      GetInstancesWithRelations: () => model.getInstancesWithRelations(),
      // Instance detail overview pulls release-management overview eagerly.
      // Empty payload keeps the slot self-contained.
      MetadataFields: () => model.getMetadataFields(),
      GetReleaseManagementOverview: () => ({ releases: { items: [] } }),
    }),

    // Customer relations (read-only from the instance side).
    http.get(/\/api\/customers$/, () =>
      HttpResponse.json({ hasMore: false, items: model.listCustomers() }),
    ),
    http.get(
      /\/api\/customers\/[^/]+$/,
      withErrorHandling('Unexpected customer mock error', ({ request }) =>
        HttpResponse.json(
          model.getCustomer(decodeLastPathSegment(request.url)),
        ),
      ),
    ),

    // Licenses + entitlements relations.
    http.get(/\/api\/licenses$/, () =>
      HttpResponse.json({ hasMore: false, items: model.listLicenses() }),
    ),
    http.get(/\/api\/license-families$/, () =>
      HttpResponse.json({
        hasMore: false,
        items: model.listLicenseFamilies(),
      }),
    ),
    http.get(
      /\/api\/licenses\/[^/]+\/entitlements$/,
      withErrorHandling('Unexpected license mock error', ({ request }) =>
        HttpResponse.json({
          hasMore: false,
          items: model.getLicenseEntitlements(
            getCustomerSegmentSlug(request.url),
          ),
        }),
      ),
    ),
    http.get(
      /\/api\/licenses\/[^/]+$/,
      withErrorHandling('Unexpected license mock error', ({ request }) =>
        HttpResponse.json(model.getLicense(decodeLastPathSegment(request.url))),
      ),
    ),

    // Sibling resources read by the instance detail overview and offered as
    // targets by the deploy / migrate action.
    http.get(/\/api\/deployment-zones$/, () =>
      HttpResponse.json({
        hasMore: false,
        items: model.listDeploymentZones(),
      }),
    ),
    http.get(/\/api\/releases$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),

    // Instances CRUD + nested entitlement usage.
    http.get(/\/api\/instances$/, () =>
      HttpResponse.json({ hasMore: false, items: model.listInstances() }),
    ),
    http.post(
      /\/api\/instances$/,
      withErrorHandling(
        'Unexpected instance mock error',
        async ({ request }) => {
          const instance = model.createInstance(
            await parseRequestJson<InstanceWritable>(request),
          );
          persist();
          return HttpResponse.json(instance, { status: 201 });
        },
      ),
    ),
    http.get(
      /\/api\/instances\/[^/]+\/entitlements\/usage$/,
      withErrorHandling('Unexpected instance mock error', ({ request }) =>
        HttpResponse.json(
          model.getEntitlementsUsageMetrics(
            getCustomerSegmentSlug(request.url),
          ),
        ),
      ),
    ),
    http.get(
      /\/api\/instances\/[^/]+$/,
      withErrorHandling('Unexpected instance mock error', ({ request }) =>
        HttpResponse.json(
          model.getInstance(decodeLastPathSegment(request.url)),
        ),
      ),
    ),
    http.put(
      /\/api\/instances\/[^/]+$/,
      withErrorHandling(
        'Unexpected instance mock error',
        async ({ request }) => {
          const instance = model.updateInstance(
            decodeLastPathSegment(request.url),
            await parseRequestJson<InstanceWritable>(request),
          );
          persist();
          return HttpResponse.json(instance);
        },
      ),
    ),
    http.delete(
      /\/api\/instances\/[^/]+$/,
      withErrorHandling('Unexpected instance mock error', ({ request }) => {
        model.deleteInstance(decodeLastPathSegment(request.url));
        persist();
        return new HttpResponse(null, { status: 204 });
      }),
    ),
  ];
};

const releaseManagementHandlers = (
  model: ReleaseManagementAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler({
    GetReleaseManagementOverview: () =>
      model.getReleaseManagementOverviewData(),
  }),

  // Components.
  http.get(/\/api\/components$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listComponents() }),
  ),
  http.post(
    /\/api\/components$/,
    withErrorHandling(
      'Unexpected component mock error',
      async ({ request }) => {
        const component = model.createComponent(
          await parseRequestJson<ComponentWritable>(request),
        );
        persist();
        return HttpResponse.json(component, { status: 201 });
      },
    ),
  ),
  http.get(
    /\/api\/components\/[^/]+$/,
    withErrorHandling('Unexpected component mock error', ({ request }) =>
      HttpResponse.json(model.getComponent(decodeLastPathSegment(request.url))),
    ),
  ),
  http.put(
    /\/api\/components\/[^/]+$/,
    withErrorHandling(
      'Unexpected component mock error',
      async ({ request }) => {
        const component = model.updateComponent(
          decodeLastPathSegment(request.url),
          await parseRequestJson<ComponentWritable>(request),
        );
        persist();
        return HttpResponse.json(component);
      },
    ),
  ),

  // Releases.
  http.get(/\/api\/releases$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listReleases() }),
  ),
  http.post(
    /\/api\/releases$/,
    withErrorHandling('Unexpected release mock error', async ({ request }) => {
      const release = model.createRelease(
        await parseRequestJson<ReleaseWritable>(request),
      );
      persist();
      return HttpResponse.json(release, { status: 201 });
    }),
  ),
  http.get(
    /\/api\/releases\/[^/]+$/,
    withErrorHandling('Unexpected release mock error', ({ request }) =>
      HttpResponse.json(model.getRelease(decodeLastPathSegment(request.url))),
    ),
  ),
  http.delete(
    /\/api\/releases\/[^/]+$/,
    withErrorHandling('Unexpected release mock error', ({ request }) => {
      model.deleteRelease(decodeLastPathSegment(request.url));
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  // Deployment zones.
  http.get(/\/api\/deployment-zones$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listDeploymentZones() }),
  ),
  http.post(
    /\/api\/deployment-zones$/,
    withErrorHandling(
      'Unexpected deployment zone mock error',
      async ({ request }) => {
        const deploymentZone = model.createDeploymentZone(
          await parseRequestJson<DeploymentZoneWritable>(request),
        );
        persist();
        return HttpResponse.json(deploymentZone, { status: 201 });
      },
    ),
  ),
  http.get(
    /\/api\/deployment-zones\/[^/]+$/,
    withErrorHandling('Unexpected deployment zone mock error', ({ request }) =>
      HttpResponse.json(
        model.getDeploymentZone(decodeLastPathSegment(request.url)),
      ),
    ),
  ),
  http.put(
    /\/api\/deployment-zones\/[^/]+$/,
    withErrorHandling(
      'Unexpected deployment zone mock error',
      async ({ request }) => {
        const deploymentZone = model.updateDeploymentZone(
          decodeLastPathSegment(request.url),
          await parseRequestJson<DeploymentZoneWritable>(request),
        );
        persist();
        return HttpResponse.json(deploymentZone);
      },
    ),
  ),
  http.delete(
    /\/api\/deployment-zones\/[^/]+$/,
    withErrorHandling(
      'Unexpected deployment zone mock error',
      ({ request }) => {
        model.deleteDeploymentZone(decodeLastPathSegment(request.url));
        persist();
        return new HttpResponse(null, { status: 204 });
      },
    ),
  ),
];

type StartE2EMockServiceWorkerOptions = {
  /**
   * What an absent `flagEvaluations` slot does: answer with no flag on (the e2e
   * default), or let the evaluation through to the API behind the dev server,
   * for the dev mocks that mock one slot over a running stack and must keep that
   * stack's own flags.
   */
  unmockedFlags?: 'off' | 'passthrough';
};

export async function startE2EMockServiceWorker(
  config: E2EMswConfig,
  { unmockedFlags = 'off' }: StartE2EMockServiceWorkerOptions = {},
) {
  const effectiveConfig = {
    ...config,
    ...readStoredConfig(),
  };
  writeStoredConfig(effectiveConfig);

  const auditTrail = effectiveConfig.auditTrail
    ? AuditTrailAppModel.fromSerialized(effectiveConfig.auditTrail)
    : null;
  const connectors = effectiveConfig.connectors
    ? ConnectorAppModel.fromSerialized(effectiveConfig.connectors)
    : null;
  const customers = effectiveConfig.customers
    ? CustomerAppModel.fromSerialized(effectiveConfig.customers)
    : null;
  const dashboard = effectiveConfig.dashboard
    ? DashboardAppModel.fromSerialized(effectiveConfig.dashboard)
    : null;
  const entitlements = effectiveConfig.entitlements
    ? EntitlementAppModel.fromSerialized(effectiveConfig.entitlements)
    : null;
  const featureFlags = effectiveConfig.featureFlags
    ? FeatureFlagAppModel.fromSerialized(effectiveConfig.featureFlags)
    : null;
  const instances = effectiveConfig.instances
    ? InstanceAppModel.fromSerialized(effectiveConfig.instances)
    : null;
  const licenses = effectiveConfig.licenses
    ? LicenseAppModel.fromSerialized(effectiveConfig.licenses)
    : null;
  const notifications = effectiveConfig.notifications
    ? NotificationAppModel.fromSerialized(effectiveConfig.notifications)
    : null;
  const releaseManagement = effectiveConfig.releaseManagement
    ? ReleaseManagementAppModel.fromSerialized(
        effectiveConfig.releaseManagement,
      )
    : null;
  const flagEvaluations =
    effectiveConfig.flagEvaluations ??
    (unmockedFlags === 'off' ? NO_PLATFORM_FLAGS : null);

  // MSW answers with the first matching handler. Every slot's own handlers
  // come first, then the stubs slots keep for each other's resources
  // (asFallback), so stacking slots never hides an installed slot's data.
  const handlers = [
    ...(auditTrail ? auditTrailHandlers(auditTrail) : []),
    ...(licenses
      ? licenseHandlers(licenses, () =>
          persistSlot('licenses', licenses.serializeForMsw()),
        )
      : []),
    ...(connectors
      ? connectorHandlers(connectors, () =>
          persistSlot('connectors', connectors.serializeForMsw()),
        )
      : []),
    ...(customers
      ? customerHandlers(customers, () =>
          persistSlot('customers', customers.serializeForMsw()),
        )
      : []),
    ...(dashboard ? dashboardHandlers(dashboard) : []),
    ...(entitlements
      ? entitlementHandlers(entitlements, () =>
          persistSlot('entitlements', entitlements.serializeForMsw()),
        )
      : []),
    ...(featureFlags
      ? featureFlagHandlers(featureFlags, () =>
          persistSlot('featureFlags', featureFlags.serializeForMsw()),
        )
      : []),
    ...(flagEvaluations ? flagEvaluationHandlers(flagEvaluations) : []),
    ...(instances
      ? instanceHandlers(instances, () =>
          persistSlot('instances', instances.serializeForMsw()),
        )
      : []),
    ...(notifications
      ? notificationHandlers(notifications, () =>
          persistSlot('notifications', notifications.serializeForMsw()),
        )
      : []),
    ...(releaseManagement
      ? releaseManagementHandlers(releaseManagement, () =>
          persistSlot('releaseManagement', releaseManagement.serializeForMsw()),
        )
      : []),
  ];

  if (handlers.length === 0) {
    return;
  }

  await setupWorker(...withFallbacksLast(handlers)).start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}
