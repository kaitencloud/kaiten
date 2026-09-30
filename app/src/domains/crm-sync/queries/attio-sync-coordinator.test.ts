import { QueryClient } from '@tanstack/react-query';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { ATTIO_CONNECTOR_NAME } from '../constants';
import {
  completeIntegrationSync,
  startAttioSyncWatcher,
} from './attio-sync-coordinator';
import { crmSyncStateQueryKey } from './attio-sync-state';

const {
  getConnectorSettingsMock,
  getCustomerIntegrationMock,
  getInstanceIntegrationMock,
  invalidateCustomerQueriesMock,
  invalidateInstanceQueriesMock,
} = vi.hoisted(() => ({
  getConnectorSettingsMock: vi.fn(),
  getCustomerIntegrationMock: vi.fn(),
  getInstanceIntegrationMock: vi.fn(),
  invalidateCustomerQueriesMock: vi.fn(),
  invalidateInstanceQueriesMock: vi.fn(),
}));

vi.mock('@/api-client', () => ({
  getConnectorSettings: getConnectorSettingsMock,
  getCustomerIntegration: getCustomerIntegrationMock,
  getInstanceIntegration: getInstanceIntegrationMock,
}));

vi.mock('@/api-client/@tanstack/react-query.gen', () => ({
  getConnectorSettingsQueryKey: () => ['connector-settings', 'attio'],
}));

vi.mock('@/domains/customer-management/queries', () => ({
  invalidateCustomerQueries: invalidateCustomerQueriesMock,
  invalidateInstanceQueries: invalidateInstanceQueriesMock,
}));

const connectorSettings = {
  connector_name: ATTIO_CONNECTOR_NAME,
  settings: {},
};

const notFoundError = () =>
  Object.assign(new Error('not found'), { response: { status: 404 } });

const networkError = () =>
  Object.assign(new Error('network error'), { response: { status: 503 } });

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Attio sync coordinator', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    getConnectorSettingsMock.mockReset();
    getCustomerIntegrationMock.mockReset();
    getInstanceIntegrationMock.mockReset();
    invalidateCustomerQueriesMock.mockReset();
    invalidateInstanceQueriesMock.mockReset();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });

    getConnectorSettingsMock.mockResolvedValue({ data: connectorSettings });
    invalidateCustomerQueriesMock.mockResolvedValue(undefined);
    invalidateInstanceQueriesMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
  });

  it('does not start when Attio is not configured', async () => {
    getConnectorSettingsMock.mockRejectedValueOnce(notFoundError());

    await startAttioSyncWatcher({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'acme',
      integrations: {},
    });

    expect(getCustomerIntegrationMock).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData(
        crmSyncStateQueryKey({
          entityKind: 'customer',
          entitySlug: 'acme',
        }),
      ),
    ).toBeUndefined();
  });

  it('polls a missing integration then refreshes the customer caches', async () => {
    getCustomerIntegrationMock
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce({ data: { external_id: 'attio-company-1' } });

    const watcher = startAttioSyncWatcher({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'acme',
      integrations: {},
    });
    await flushMicrotasks();

    expect(
      queryClient.getQueryData(
        crmSyncStateQueryKey({
          entityKind: 'customer',
          entitySlug: 'acme',
        }),
      ),
    ).toEqual({ status: 'pending' });
    expect(getCustomerIntegrationMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    await watcher;

    expect(getCustomerIntegrationMock).toHaveBeenCalledTimes(2);
    expect(invalidateCustomerQueriesMock).toHaveBeenCalledWith(
      queryClient,
      'acme',
    );
    expect(
      queryClient.getQueryData(
        crmSyncStateQueryKey({
          entityKind: 'customer',
          entitySlug: 'acme',
        }),
      ),
    ).toEqual({ status: 'idle' });
  });

  it('polls an existing errored integration until a successful retry is persisted', async () => {
    const previousIntegration = {
      external_id: 'attio-company-1',
      synced_at: '2026-06-12T16:20:55Z',
      last_error: 'domain already exists',
    };
    getCustomerIntegrationMock
      .mockResolvedValueOnce({ data: previousIntegration })
      .mockResolvedValueOnce({
        data: {
          external_id: 'attio-company-1',
          synced_at: '2026-06-12T16:21:05Z',
        },
      });

    const watcher = startAttioSyncWatcher({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'acme',
      integrations: {
        [ATTIO_CONNECTOR_NAME]: previousIntegration,
      },
      watchForChange: true,
    });
    expect(
      queryClient.getQueryData(
        crmSyncStateQueryKey({
          entityKind: 'customer',
          entitySlug: 'acme',
        }),
      ),
    ).toEqual({ status: 'pending' });
    await flushMicrotasks();

    expect(getCustomerIntegrationMock).toHaveBeenCalledTimes(1);
    expect(invalidateCustomerQueriesMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    await watcher;

    expect(getCustomerIntegrationMock).toHaveBeenCalledTimes(2);
    expect(invalidateCustomerQueriesMock).toHaveBeenCalledWith(
      queryClient,
      'acme',
    );
    expect(
      queryClient.getQueryData(
        crmSyncStateQueryKey({
          entityKind: 'customer',
          entitySlug: 'acme',
        }),
      ),
    ).toEqual({ status: 'idle' });
  });

  it('deduplicates concurrent watchers for the same entity', async () => {
    getInstanceIntegrationMock.mockRejectedValue(notFoundError());

    const first = startAttioSyncWatcher({
      queryClient,
      entityKind: 'instance',
      entitySlug: 'acme-prod',
      integrations: {},
    });
    const second = startAttioSyncWatcher({
      queryClient,
      entityKind: 'instance',
      entitySlug: 'acme-prod',
      integrations: {},
    });

    expect(second).toBe(first);
    await flushMicrotasks();
    expect(getInstanceIntegrationMock).toHaveBeenCalledTimes(1);

    await completeIntegrationSync({
      queryClient,
      connectorName: ATTIO_CONNECTOR_NAME,
      entityKind: 'instance',
      entitySlug: 'acme-prod',
    });
    await Promise.all([first, second]);

    expect(invalidateInstanceQueriesMock).toHaveBeenCalledWith(
      queryClient,
      'acme-prod',
    );
  });

  it('replaces an existing watcher when a linked entity is updated again', async () => {
    const previousIntegration = {
      external_id: 'attio-company-1',
      synced_at: '2026-06-12T16:20:55Z',
      last_error: 'domain already exists',
    };
    getCustomerIntegrationMock
      .mockResolvedValueOnce({ data: previousIntegration })
      .mockResolvedValueOnce({
        data: {
          external_id: 'attio-company-1',
          synced_at: '2026-06-12T16:21:05Z',
        },
      });
    const input = {
      queryClient,
      entityKind: 'customer' as const,
      entitySlug: 'acme',
      integrations: {
        [ATTIO_CONNECTOR_NAME]: previousIntegration,
      },
      watchForChange: true,
    };

    const first = startAttioSyncWatcher(input);
    await flushMicrotasks();
    const second = startAttioSyncWatcher(input);
    await flushMicrotasks();

    expect(second).not.toBe(first);
    expect(getCustomerIntegrationMock).toHaveBeenCalledTimes(2);

    await Promise.all([first, second]);

    expect(invalidateCustomerQueriesMock).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryData(
        crmSyncStateQueryKey({
          entityKind: 'customer',
          entitySlug: 'acme',
        }),
      ),
    ).toEqual({ status: 'idle' });
  });

  it('marks the sync as delayed after the bounded polling window', async () => {
    getCustomerIntegrationMock.mockRejectedValue(notFoundError());

    const watcher = startAttioSyncWatcher({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'slow-customer',
      integrations: {},
    });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(45_000);
    await watcher;

    expect(
      queryClient.getQueryData(
        crmSyncStateQueryKey({
          entityKind: 'customer',
          entitySlug: 'slow-customer',
        }),
      ),
    ).toEqual({ status: 'delayed' });
    expect(invalidateCustomerQueriesMock).not.toHaveBeenCalled();
  });

  it('expires a delayed sync state after five minutes', async () => {
    getCustomerIntegrationMock.mockRejectedValue(notFoundError());

    const target = {
      entityKind: 'customer' as const,
      entitySlug: 'slow-customer',
    };
    const watcher = startAttioSyncWatcher({
      queryClient,
      ...target,
      integrations: {},
    });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(45_000);
    await watcher;

    expect(queryClient.getQueryData(crmSyncStateQueryKey(target))).toEqual({
      status: 'delayed',
    });

    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(queryClient.getQueryData(crmSyncStateQueryKey(target))).toEqual({
      status: 'idle',
    });
  });

  it('stops after three consecutive non-404 errors', async () => {
    getInstanceIntegrationMock.mockRejectedValue(networkError());

    const watcher = startAttioSyncWatcher({
      queryClient,
      entityKind: 'instance',
      entitySlug: 'unavailable-instance',
      integrations: {},
    });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(4_000);
    await watcher;

    expect(getInstanceIntegrationMock).toHaveBeenCalledTimes(3);
    expect(
      queryClient.getQueryData(
        crmSyncStateQueryKey({
          entityKind: 'instance',
          entitySlug: 'unavailable-instance',
        }),
      ),
    ).toEqual({ status: 'delayed' });
  });

  it('clears delayed state when fresh linked data arrives', async () => {
    getCustomerIntegrationMock.mockRejectedValue(notFoundError());
    const target = {
      entityKind: 'customer' as const,
      entitySlug: 'linked-customer',
    };
    const watcher = startAttioSyncWatcher({
      queryClient,
      ...target,
      integrations: {},
    });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(45_000);
    await watcher;

    await startAttioSyncWatcher({
      queryClient,
      ...target,
      integrations: {
        [ATTIO_CONNECTOR_NAME]: { external_id: 'attio-company-1' },
      },
    });

    expect(queryClient.getQueryData(crmSyncStateQueryKey(target))).toEqual({
      status: 'idle',
    });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(queryClient.getQueryData(crmSyncStateQueryKey(target))).toEqual({
      status: 'idle',
    });
  });

  it('skips settings lookup when the entity is already linked', async () => {
    await startAttioSyncWatcher({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'linked-customer',
      integrations: {
        [ATTIO_CONNECTOR_NAME]: { external_id: 'attio-company-1' },
      },
    });

    expect(getConnectorSettingsMock).not.toHaveBeenCalled();
    expect(getCustomerIntegrationMock).not.toHaveBeenCalled();
  });

  it('does not let an old delayed expiry clear a newer pending state', async () => {
    getInstanceIntegrationMock.mockRejectedValue(notFoundError());
    const target = {
      entityKind: 'instance' as const,
      entitySlug: 'retrying-instance',
    };
    const firstWatcher = startAttioSyncWatcher({
      queryClient,
      ...target,
      integrations: {},
    });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(45_000);
    await firstWatcher;

    await vi.advanceTimersByTimeAsync(4 * 60_000 + 30_000);

    const secondWatcher = startAttioSyncWatcher({
      queryClient,
      ...target,
      integrations: {},
    });
    await flushMicrotasks();
    expect(queryClient.getQueryData(crmSyncStateQueryKey(target))).toEqual({
      status: 'pending',
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(queryClient.getQueryData(crmSyncStateQueryKey(target))).toEqual({
      status: 'pending',
    });

    await vi.advanceTimersByTimeAsync(15_000);
    await secondWatcher;
    expect(queryClient.getQueryData(crmSyncStateQueryKey(target))).toEqual({
      status: 'delayed',
    });

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(queryClient.getQueryData(crmSyncStateQueryKey(target))).toEqual({
      status: 'idle',
    });
  });
});
