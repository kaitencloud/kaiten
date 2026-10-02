import type { RequestHandler, UnhandledFrameHandle } from 'msw';
import { setupWorker } from 'msw/browser';
import type { E2EMswConfig } from '../../../e2e/app/_support/contracts/msw-slots';
import { AuditTrailAppModel } from '../../../e2e/app/_support/model/audit-trail-app-model';
import { ConnectorAppModel } from '../../../e2e/app/_support/model/connector-app-model';
import { CustomerAppModel } from '../../../e2e/app/_support/model/customer-app-model';
import { DashboardAppModel } from '../../../e2e/app/_support/model/dashboard-app-model';
import { EntitlementAppModel } from '../../../e2e/app/_support/model/entitlement-app-model';
import { FeatureFlagAppModel } from '../../../e2e/app/_support/model/feature-flag-app-model';
import { InstanceAppModel } from '../../../e2e/app/_support/model/instance-app-model';
import { LicenseAppModel } from '../../../e2e/app/_support/model/license-app-model';
import { NotificationAppModel } from '../../../e2e/app/_support/model/notification-app-model';
import { NO_PLATFORM_FLAGS } from '../../../e2e/app/_support/model/platform-flags';
import { ReleaseManagementAppModel } from '../../../e2e/app/_support/model/release-management-app-model';
import { auditTrailHandlers } from './audit-trail-handlers';
import { connectorHandlers } from './connector-handlers';
import { customerHandlers } from './customer-handlers';
import { dashboardHandlers } from './dashboard-handlers';
import { entitlementHandlers } from './entitlement-handlers';
import { featureFlagHandlers } from './feature-flag-handlers';
import { flagEvaluationHandlers } from './flag-evaluation-handlers';
import { withFallbacksLast } from './handler-factory';
import { instanceHandlers } from './instance-handlers';
import { licenseHandlers } from './license-handlers';
import { notificationHandlers } from './notification-handlers';
import { createPageNetwork } from './page-network';
import {
  persistSlot,
  readStoredConfig,
  writeStoredConfig,
} from './persistence';
import { releaseManagementHandlers } from './release-management-handlers';

type StartE2EMockServiceWorkerOptions = {
  // E2E defaults closed; partial dev mocks keep the running stack's flags.
  unmockedFlags?: 'off' | 'passthrough';
  /**
   * Whether an API request no handler answers prints an `[MSW]` warning that
   * names it before it reaches the network: for the dev mocks, which have no
   * API behind them, so that what they do not serve shows.
   */
  warnUnhandledApiRequests?: boolean;
};

type MockWindow = Window & {
  /** The mocks this page started: the worker, or the network in the page. */
  __KAITEN_MSW_RUNNING__?: {
    resetHandlers: (...handlers: RequestHandler[]) => void;
  };
};

// The frame of an unhandled HTTP request carries it as `data.request`
// (HttpNetworkFrame); msw types the frames of every protocol as one.
const isApiRequest = (frame: { protocol: string; data: unknown }) =>
  frame.protocol === 'http' &&
  new URL((frame.data as { request: Request }).request.url).pathname.startsWith(
    '/api/',
  );

/**
 * Starts the mocks of `config` in this page, merged under the state an earlier
 * page of the tab left in `sessionStorage`. A browser that refuses the service
 * worker (an embedded browser, a private window) still gets them, in the page:
 * `fetch` and `XMLHttpRequest` are patched there, but an `EventSource` is not,
 * so the notification stream is then left unserved.
 *
 * Vite runs main.tsx again in the same page when a module only it imports
 * changes, the code of these mocks or of their seeds among them, and then
 * reloads the page. That second start begins from `config` alone, dropping
 * the stored state, so that the reload shows the edited seeds; and it hands
 * its handlers to the mocks already running rather than starting others,
 * since Mock Service Worker cannot patch the globals of a page twice.
 */
export async function startE2EMockServiceWorker(
  config: E2EMswConfig,
  {
    unmockedFlags = 'off',
    warnUnhandledApiRequests = false,
  }: StartE2EMockServiceWorkerOptions = {},
) {
  const page = window as MockWindow;
  const running = page.__KAITEN_MSW_RUNNING__;
  const effectiveConfig = running
    ? config
    : { ...config, ...readStoredConfig() };
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

  // Preserve first-match ownership and the original slot registration order.
  // Explicit sibling fallbacks are sorted last, after all installed owners.
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
  if (handlers.length === 0) return;

  const orderedHandlers = withFallbacksLast(handlers);
  if (running) {
    running.resetHandlers(...orderedHandlers);
    return;
  }

  const onUnhandledFrame: UnhandledFrameHandle = warnUnhandledApiRequests
    ? ({ frame, defaults }) => {
        if (isApiRequest(frame)) {
          defaults.warn();
        }
      }
    : 'bypass';

  try {
    const worker = setupWorker(...orderedHandlers);
    await worker.start({
      onUnhandledFrame,
      quiet: true,
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
    page.__KAITEN_MSW_RUNNING__ = worker;
  } catch (error) {
    console.warn(
      '[MSW] The mock service worker could not start; mocking in the page instead, without the notification stream.',
      error,
    );
    const network = createPageNetwork({
      handlers: orderedHandlers,
      onUnhandledFrame,
    });
    network.enable();
    page.__KAITEN_MSW_RUNNING__ = network;
  }
}
