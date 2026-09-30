import {
  type DefaultBodyType,
  HttpResponse,
  type HttpResponseResolver,
  http,
  type PathParams,
} from 'msw';
import type { NotificationAppModel } from '../../../e2e/app/_support/model/notification-app-model';
import {
  messageForError,
  parseRequestJson,
  statusForError,
} from './handler-factory';

type ListNotificationsParams = NonNullable<
  Parameters<NotificationAppModel['listNotifications']>[0]
>;
type MarkNotificationsReadInput = Parameters<
  NotificationAppModel['markRead']
>[0];
type PutNotificationPreferencesInput = Parameters<
  NotificationAppModel['putPreferences']
>[0];

type PersistMswState = () => void;
type SendFrame = (frame: string) => void;

const HEARTBEAT_INTERVAL_MS = 20_000;

const sseFrame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

// This contract uses RFC 7807 problem+json errors (notifications-api.yaml),
// unlike the `{message}` shape of the other slots — the client's Problem
// branch must be exercised the same way it will be against the real backend.
const problemJson = (status: number, detail: string) =>
  HttpResponse.json(
    { type: 'about:blank', title: 'Error', status, detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

const withProblemJson = (
  fallbackDetail: string,
  handler: HttpResponseResolver<PathParams, DefaultBodyType>,
): HttpResponseResolver<PathParams, DefaultBodyType> => {
  return async (info) => {
    try {
      return await handler(info);
    } catch (error) {
      return problemJson(
        statusForError(error),
        messageForError(error, fallbackDetail),
      );
    }
  };
};

/**
 * Handlers for the notifications contract (notifications-api.yaml), including
 * the SSE stream. Handlers run in each page's context, so the `streams` set
 * only covers this tab's EventSources; cross-tab consistency still comes from
 * the contract's refetch-on-connected plus the sessionStorage-persisted model.
 */
export const notificationHandlers = (
  model: NotificationAppModel,
  persist: PersistMswState = () => {},
) => {
  const streams = new Set<SendFrame>();
  let demoTimer: ReturnType<typeof setInterval> | undefined;

  const broadcast = (frame: string) => {
    for (const send of streams) {
      send(frame);
    }
  };

  const emitDemoNotification = () => {
    const notification = model.emitDemoNotification();
    persist();
    broadcast(
      sseFrame('notification', {
        notification,
        unreadCount: model.unreadCount(),
      }),
    );
  };

  const syncDemoTimer = () => {
    const intervalMs = model.streamDemoIntervalMs;
    if (streams.size > 0 && intervalMs && demoTimer === undefined) {
      demoTimer = setInterval(emitDemoNotification, intervalMs);
    }
    if (streams.size === 0 && demoTimer !== undefined) {
      clearInterval(demoTimer);
      demoTimer = undefined;
    }
  };

  const createStreamResponse = () => {
    const encoder = new TextEncoder();
    let send: SendFrame = () => {};
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        send = (frame) => {
          try {
            controller.enqueue(encoder.encode(frame));
          } catch {
            // Stream already closed by the client; drop the frame.
          }
        };
        streams.add(send);
        syncDemoTimer();
        send('retry: 5000\n\n');
        send(sseFrame('connected', { unreadCount: model.unreadCount() }));
        heartbeatTimer = setInterval(() => {
          send(': heartbeat\n\n');
        }, HEARTBEAT_INTERVAL_MS);
      },
      cancel() {
        streams.delete(send);
        syncDemoTimer();
        if (heartbeatTimer !== undefined) {
          clearInterval(heartbeatTimer);
        }
      },
    });

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  };

  return [
    http.get(/\/api\/v1\/notifications$/, ({ request }) => {
      const url = new URL(request.url);
      const limitParam = url.searchParams.get('limit');
      return HttpResponse.json(
        model.listNotifications({
          status:
            url.searchParams.get('status') === 'unread' ? 'unread' : 'all',
          // Repeated keys, as the API reads them.
          objectType: url.searchParams.getAll(
            'objectType',
          ) as ListNotificationsParams['objectType'],
          cursor: url.searchParams.get('cursor') ?? undefined,
          limit: limitParam ? Number(limitParam) : undefined,
        }),
      );
    }),
    http.post(
      /\/api\/v1\/notifications\/mark-read$/,
      withProblemJson(
        'Unexpected notification mock error',
        async ({ request }) => {
          const result = model.markRead(
            await parseRequestJson<MarkNotificationsReadInput>(request),
          );
          persist();
          broadcast(sseFrame('read', { unreadCount: result.unreadCount }));
          return HttpResponse.json(result);
        },
      ),
    ),
    // Authenticated by the session cookie at the gateway, so there is nothing
    // for the mock to check here: a request that reached this handler is one the
    // real deployment would have authenticated already.
    http.get(/\/api\/v1\/notifications\/stream$/, () => createStreamResponse()),
    http.get(/\/api\/v1\/notification-preferences$/, () =>
      HttpResponse.json(model.getPreferences()),
    ),
    http.put(
      /\/api\/v1\/notification-preferences$/,
      withProblemJson(
        'Unexpected notification preferences mock error',
        async ({ request }) => {
          const matrix = model.putPreferences(
            await parseRequestJson<PutNotificationPreferencesInput>(request),
          );
          persist();
          return HttpResponse.json(matrix);
        },
      ),
    ),
  ];
};
