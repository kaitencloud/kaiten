import { QueryClient } from '@tanstack/react-query';
import { HttpResponse } from 'msw/http';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { ConnectorSettings, CustomerIntegration } from '@/api-client';
import {
  handleGetConnectorSettings,
  handleGetCustomerIntegration,
  handleGetInstanceIntegration,
} from '@/api-client/msw.gen';
import { ATTIO_CONNECTOR_NAME } from '../constants';
import {
  completeIntegrationSync,
  startAttioSyncWatcher,
} from './attio-sync-coordinator';
import { crmSyncStateQueryKey } from './attio-sync-state';

const { invalidateCustomerQueriesMock, invalidateInstanceQueriesMock } =
  vi.hoisted(() => ({
    invalidateCustomerQueriesMock: vi.fn(),
    invalidateInstanceQueriesMock: vi.fn(),
  }));

vi.mock('@/domains/customer-management/queries', () => ({
  invalidateCustomerQueries: invalidateCustomerQueriesMock,
  invalidateInstanceQueries: invalidateInstanceQueriesMock,
}));

const connectorSettings: ConnectorSettings = {
  connector_name: ATTIO_CONNECTOR_NAME,
  settings: {},
};

// What the API answers for a connector nobody configured, or an entity Attio
// has not linked yet.
const notFound = () =>
  HttpResponse.json(
    { title: 'Not Found', status: 404, detail: 'not found' },
    { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
  );

// A failure other than a 404: the API cannot serve the read for now.
const unavailable = () =>
  HttpResponse.json(
    { title: 'Service Unavailable', status: 503, detail: 'network error' },
    { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
  );

const linked = (integration: CustomerIntegration) => () =>
  HttpResponse.json(integration);

/**
 * Answers the reads of the Attio connector settings with `respond`, and returns
 * the connectors read.
 */
function serveConnectorSettings(respond: () => Response) {
  const reads: string[] = [];
  server.use(
    handleGetConnectorSettings(({ params }) => {
      reads.push(params.connectorName);
      return respond();
    }),
  );
  return reads;
}

/**
 * Answers the polls of a customer's or an instance's integration: the n-th
 * poll with the n-th answer, the last answer for every poll after it. Returns
 * the path of each poll, below the API's base URL.
 */
function serveIntegrationPolls(...answers: Array<() => Response>) {
  const polls: string[] = [];
  const answer = () => answers[Math.min(polls.length, answers.length) - 1]();
  server.use(
    handleGetCustomerIntegration(({ params }) => {
      polls.push(
        `customers/${params.customerSlug}/integrations/${params.integrationName}`,
      );
      return answer();
    }),
    handleGetInstanceIntegration(({ params }) => {
      polls.push(
        `instances/${params.instanceSlug}/integrations/${params.integrationName}`,
      );
      return answer();
    }),
  );
  return polls;
}

// MSW answers through jsdom's fetch, undici, and the fake clock holds undici's
// timers too: before a kept-alive connection carries the next request, undici
// checks it on a zero-delay timer, which the fake clock defers by a millisecond
// when it is set while a timer fires (the coordinator's next poll). A request
// is thus answered over a few turns of the event loop and a few fake
// milliseconds, where the mocked SDK resolved within microtasks: give the
// requests in flight both.
async function answerRequestsInFlight() {
  for (let turn = 0; turn < 5; turn += 1) {
    await vi.advanceTimersByTimeAsync(1);
  }
}

describe('Attio sync coordinator', () => {
  let queryClient: QueryClient;
  let settingsReads: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    invalidateCustomerQueriesMock.mockReset();
    invalidateInstanceQueriesMock.mockReset();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });

    settingsReads = serveConnectorSettings(() =>
      HttpResponse.json(connectorSettings),
    );
    invalidateCustomerQueriesMock.mockResolvedValue(undefined);
    invalidateInstanceQueriesMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
  });

  it('does not start when Attio is not configured', async () => {
    const unconfiguredReads = serveConnectorSettings(notFound);
    const polls = serveIntegrationPolls(notFound);

    const watcher = startAttioSyncWatcher({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'acme',
      integrations: {},
    });
    await answerRequestsInFlight();
    await watcher;

    expect(unconfiguredReads).toEqual([ATTIO_CONNECTOR_NAME]);
    expect(polls).toEqual([]);
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
    const acmeIntegration = `customers/acme/integrations/${ATTIO_CONNECTOR_NAME}`;
    const polls = serveIntegrationPolls(
      notFound,
      linked({
        external_id: 'attio-company-1',
        synced_at: '2026-06-12T16:21:05Z',
      }),
    );

    const watcher = startAttioSyncWatcher({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'acme',
      integrations: {},
    });
    await answerRequestsInFlight();

    expect(
      queryClient.getQueryData(
        crmSyncStateQueryKey({
          entityKind: 'customer',
          entitySlug: 'acme',
        }),
      ),
    ).toEqual({ status: 'pending' });
    expect(polls).toEqual([acmeIntegration]);

    await vi.advanceTimersByTimeAsync(2_000);
    await answerRequestsInFlight();
    await watcher;

    expect(polls).toEqual([acmeIntegration, acmeIntegration]);
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
    const polls = serveIntegrationPolls(
      linked(previousIntegration),
      linked({
        external_id: 'attio-company-1',
        synced_at: '2026-06-12T16:21:05Z',
      }),
    );

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
    await answerRequestsInFlight();

    expect(polls).toHaveLength(1);
    expect(invalidateCustomerQueriesMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    await answerRequestsInFlight();
    await watcher;

    expect(polls).toHaveLength(2);
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
    const polls = serveIntegrationPolls(notFound);

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
    await answerRequestsInFlight();
    expect(settingsReads).toHaveLength(1);
    expect(polls).toEqual([
      `instances/acme-prod/integrations/${ATTIO_CONNECTOR_NAME}`,
    ]);

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
    const polls = serveIntegrationPolls(
      linked(previousIntegration),
      linked({
        external_id: 'attio-company-1',
        synced_at: '2026-06-12T16:21:05Z',
      }),
    );
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
    await answerRequestsInFlight();
    const second = startAttioSyncWatcher(input);
    await answerRequestsInFlight();

    expect(second).not.toBe(first);
    expect(polls).toHaveLength(2);

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
    serveIntegrationPolls(notFound);

    const watcher = startAttioSyncWatcher({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'slow-customer',
      integrations: {},
    });
    await answerRequestsInFlight();
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
    serveIntegrationPolls(notFound);

    const target = {
      entityKind: 'customer' as const,
      entitySlug: 'slow-customer',
    };
    const watcher = startAttioSyncWatcher({
      queryClient,
      ...target,
      integrations: {},
    });
    await answerRequestsInFlight();
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
    const polls = serveIntegrationPolls(unavailable);

    const watcher = startAttioSyncWatcher({
      queryClient,
      entityKind: 'instance',
      entitySlug: 'unavailable-instance',
      integrations: {},
    });
    await answerRequestsInFlight();
    await vi.advanceTimersByTimeAsync(4_000);
    await answerRequestsInFlight();
    await watcher;

    expect(polls).toHaveLength(3);
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
    serveIntegrationPolls(notFound);
    const target = {
      entityKind: 'customer' as const,
      entitySlug: 'linked-customer',
    };
    const watcher = startAttioSyncWatcher({
      queryClient,
      ...target,
      integrations: {},
    });
    await answerRequestsInFlight();
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
    const polls = serveIntegrationPolls(notFound);

    await startAttioSyncWatcher({
      queryClient,
      entityKind: 'customer',
      entitySlug: 'linked-customer',
      integrations: {
        [ATTIO_CONNECTOR_NAME]: { external_id: 'attio-company-1' },
      },
    });

    expect(settingsReads).toEqual([]);
    expect(polls).toEqual([]);
  });

  it('does not let an old delayed expiry clear a newer pending state', async () => {
    serveIntegrationPolls(notFound);
    const target = {
      entityKind: 'instance' as const,
      entitySlug: 'retrying-instance',
    };
    const firstWatcher = startAttioSyncWatcher({
      queryClient,
      ...target,
      integrations: {},
    });
    await answerRequestsInFlight();
    await vi.advanceTimersByTimeAsync(45_000);
    await firstWatcher;

    await vi.advanceTimersByTimeAsync(4 * 60_000 + 30_000);

    const secondWatcher = startAttioSyncWatcher({
      queryClient,
      ...target,
      integrations: {},
    });
    await answerRequestsInFlight();
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
