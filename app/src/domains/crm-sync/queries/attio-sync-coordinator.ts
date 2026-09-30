import type { QueryClient } from '@tanstack/react-query';
import { getCustomerIntegration, getInstanceIntegration } from '@/api-client';
import {
  invalidateCustomerQueries,
  invalidateInstanceQueries,
} from '@/domains/customer-management';
import { ATTIO_CONNECTOR_NAME } from '../constants';
import { getAttioSyncInfo } from '../logic';
import { attioSettingsQueryOptions } from './attio-settings-query-options';
import {
  clearCrmSyncState,
  type CrmSyncTarget,
  crmSyncStateQueryKey,
  setDelayedCrmSyncState,
  setCrmSyncState,
} from './attio-sync-state';
import { getHttpErrorStatus } from './http-error-status';

const FAST_POLL_DURATION_MS = 10_000;
const FAST_POLL_INTERVAL_MS = 2_000;
const SLOW_POLL_INTERVAL_MS = 5_000;
const WATCH_TIMEOUT_MS = 45_000;
const MAX_CONSECUTIVE_ERRORS = 3;

type StartAttioSyncWatcherInput = CrmSyncTarget & {
  integrations?: Record<string, unknown> | null;
  queryClient: QueryClient;
  watchForChange?: boolean;
};

type CompleteIntegrationSyncInput = CrmSyncTarget & {
  connectorName: string;
  queryClient: QueryClient;
};

type ActiveWatcher = {
  cancelled: boolean;
  controller: AbortController;
  promise?: Promise<void>;
  resolveWait?: (completed: boolean) => void;
  timer?: ReturnType<typeof setTimeout>;
};

const activeWatchers = new WeakMap<QueryClient, Map<string, ActiveWatcher>>();

export function startAttioSyncWatcher(
  input: StartAttioSyncWatcherInput,
): Promise<void> {
  const entitySlug = input.entitySlug.trim();
  if (!entitySlug) {
    return Promise.resolve();
  }

  const target = { entityKind: input.entityKind, entitySlug };
  const previousSyncInfo = getAttioSyncInfo(input.integrations);
  if (previousSyncInfo && !input.watchForChange) {
    cancelActiveWatcher(input.queryClient, target);
    clearCrmSyncState(input.queryClient, target);
    return Promise.resolve();
  }

  const watcherKey = toWatcherKey(target);
  const watchers = getActiveWatchers(input.queryClient);
  const existingWatcher = watchers.get(watcherKey);
  if (existingWatcher) {
    if (!input.watchForChange) {
      return existingWatcherPromise(existingWatcher);
    }
    cancelWatcher(existingWatcher);
  }

  const pendingImmediately = Boolean(previousSyncInfo && input.watchForChange);
  if (pendingImmediately) {
    setCrmSyncState(input.queryClient, target, 'pending');
  }
  const watcher: ActiveWatcher = {
    cancelled: false,
    controller: new AbortController(),
  };
  watchers.set(watcherKey, watcher);

  const promise = runAttioSyncWatcher({
    ...input,
    ...target,
    pendingImmediately,
    previousSyncInfo,
    watcher,
  }).finally(() => {
    if (watchers.get(watcherKey) === watcher) {
      watchers.delete(watcherKey);
      if (
        watcher.cancelled &&
        input.queryClient.getQueryData<{ status?: string }>(
          crmSyncStateQueryKey(target),
        )?.status === 'pending'
      ) {
        clearCrmSyncState(input.queryClient, target);
      }
    }
  });
  watcher.promise = promise;

  return promise;
}

export async function completeIntegrationSync({
  connectorName,
  entityKind,
  entitySlug,
  queryClient,
}: CompleteIntegrationSyncInput): Promise<void> {
  if (connectorName !== ATTIO_CONNECTOR_NAME || !entitySlug.trim()) {
    return;
  }

  const target = { entityKind, entitySlug: entitySlug.trim() };
  cancelActiveWatcher(queryClient, target);
  try {
    await invalidateTargetQueries(queryClient, target);
  } finally {
    clearCrmSyncState(queryClient, target);
  }
}

async function runAttioSyncWatcher({
  entityKind,
  entitySlug,
  pendingImmediately,
  previousSyncInfo,
  queryClient,
  watcher,
}: StartAttioSyncWatcherInput & {
  pendingImmediately: boolean;
  previousSyncInfo: ReturnType<typeof getAttioSyncInfo>;
  watcher: ActiveWatcher;
}) {
  let settings;
  try {
    settings = await queryClient.fetchQuery(attioSettingsQueryOptions);
  } catch {
    if (pendingImmediately) {
      clearCrmSyncState(queryClient, { entityKind, entitySlug });
    }
    return;
  }

  if (!settings || watcher.cancelled) {
    if (pendingImmediately && !watcher.cancelled) {
      clearCrmSyncState(queryClient, { entityKind, entitySlug });
    }
    return;
  }

  const target = { entityKind, entitySlug };
  const startedAt = Date.now();
  if (!pendingImmediately) {
    setCrmSyncState(queryClient, target, 'pending');
  }

  let consecutiveErrors = 0;

  while (!watcher.cancelled && Date.now() - startedAt < WATCH_TIMEOUT_MS) {
    try {
      const currentSyncInfo = await readAttioIntegration(
        target,
        watcher.controller.signal,
      );
      if (hasIntegrationSyncChanged(previousSyncInfo, currentSyncInfo)) {
        await completeIntegrationSync({
          ...target,
          connectorName: ATTIO_CONNECTOR_NAME,
          queryClient,
        });
        return;
      }
      consecutiveErrors = 0;
    } catch (error) {
      if (watcher.cancelled) {
        return;
      }

      if (getHttpErrorStatus(error) === 404) {
        consecutiveErrors = 0;
      } else {
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          setDelayedCrmSyncState(queryClient, target);
          return;
        }
      }
    }

    const elapsed = Date.now() - startedAt;
    const remaining = WATCH_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      break;
    }

    const interval =
      elapsed < FAST_POLL_DURATION_MS
        ? FAST_POLL_INTERVAL_MS
        : SLOW_POLL_INTERVAL_MS;
    if (!(await waitForNextAttempt(watcher, Math.min(interval, remaining)))) {
      return;
    }
  }

  if (!watcher.cancelled) {
    setDelayedCrmSyncState(queryClient, target);
  }
}

async function readAttioIntegration(
  target: CrmSyncTarget,
  signal: AbortSignal,
) {
  if (target.entityKind === 'customer') {
    const response = await getCustomerIntegration({
      path: {
        customerSlug: target.entitySlug,
        integrationName: ATTIO_CONNECTOR_NAME,
      },
      signal,
      throwOnError: true,
    });
    return getAttioSyncInfo({
      [ATTIO_CONNECTOR_NAME]: response.data,
    });
  }

  const response = await getInstanceIntegration({
    path: {
      instanceSlug: target.entitySlug,
      integrationName: ATTIO_CONNECTOR_NAME,
    },
    signal,
    throwOnError: true,
  });
  return getAttioSyncInfo({
    [ATTIO_CONNECTOR_NAME]: response.data,
  });
}

function hasIntegrationSyncChanged(
  previous: ReturnType<typeof getAttioSyncInfo>,
  current: ReturnType<typeof getAttioSyncInfo>,
) {
  if (!current) {
    return false;
  }
  if (!previous) {
    return true;
  }

  return (
    current.externalId !== previous.externalId ||
    current.syncedAt !== previous.syncedAt ||
    current.lastError !== previous.lastError ||
    current.webUrl !== previous.webUrl
  );
}

async function invalidateTargetQueries(
  queryClient: QueryClient,
  target: CrmSyncTarget,
) {
  if (target.entityKind === 'customer') {
    await invalidateCustomerQueries(queryClient, target.entitySlug);
    return;
  }

  await invalidateInstanceQueries(queryClient, target.entitySlug);
}

function getActiveWatchers(queryClient: QueryClient) {
  let watchers = activeWatchers.get(queryClient);
  if (!watchers) {
    watchers = new Map();
    activeWatchers.set(queryClient, watchers);
  }
  return watchers;
}

function toWatcherKey({ entityKind, entitySlug }: CrmSyncTarget) {
  return `${entityKind}:${entitySlug}`;
}

function cancelActiveWatcher(queryClient: QueryClient, target: CrmSyncTarget) {
  const watcher = activeWatchers.get(queryClient)?.get(toWatcherKey(target));
  if (!watcher) {
    return;
  }

  cancelWatcher(watcher);
}

function cancelWatcher(watcher: ActiveWatcher) {
  watcher.cancelled = true;
  watcher.controller.abort();
  if (watcher.timer) {
    clearTimeout(watcher.timer);
  }
  watcher.resolveWait?.(false);
}

function waitForNextAttempt(
  watcher: ActiveWatcher,
  delay: number,
): Promise<boolean> {
  if (watcher.cancelled) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    watcher.resolveWait = resolve;
    watcher.timer = setTimeout(() => {
      watcher.resolveWait = undefined;
      watcher.timer = undefined;
      resolve(!watcher.cancelled);
    }, delay);
  });
}

function existingWatcherPromise(watcher: ActiveWatcher): Promise<void> {
  return watcher.promise ?? Promise.resolve();
}
