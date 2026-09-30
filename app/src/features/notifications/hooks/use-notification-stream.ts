import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { z } from 'zod';
import { notificationStreamUrl } from '../notifications.api';
import { invalidateNotificationFeedQueries, setUnreadCount } from '../queries';
import {
  zStreamConnectedFrame,
  zStreamNotificationFrame,
  zStreamReadFrame,
} from '../schemas';

const RECONNECT_DELAY_MS = 5_000;
const MAX_CONSECUTIVE_FAILURES = 3;

function parseFrame<Schema extends z.ZodType>(
  schema: Schema,
  raw: string,
): z.infer<Schema> | null {
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Live-updates the unread badge and feed from the SSE stream.
 *
 * Per the contract the stream is a hint, not the source of truth: every
 * `connected` frame (first open and each reconnect) triggers a feed refetch.
 *
 * The connection authenticates with the Clerk session cookie, which is why it is
 * opened `withCredentials` — see notifications.api.ts. `EventSource`'s own
 * reconnect is left off so that a backend that is simply not there (the module
 * not deployed yet) stops being retried after a few attempts instead of forever.
 */
export function useNotificationStream() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;
    let consecutiveFailures = 0;

    const handleConnected = (event: MessageEvent<string>) => {
      const frame = parseFrame(zStreamConnectedFrame, event.data);
      if (!frame) {
        return;
      }
      setUnreadCount(queryClient, frame.unreadCount);
      void invalidateNotificationFeedQueries(queryClient);
    };

    const handleNotification = (event: MessageEvent<string>) => {
      const frame = parseFrame(zStreamNotificationFrame, event.data);
      if (!frame) {
        return;
      }
      setUnreadCount(queryClient, frame.unreadCount);
      void invalidateNotificationFeedQueries(queryClient);
    };

    const handleRead = (event: MessageEvent<string>) => {
      const frame = parseFrame(zStreamReadFrame, event.data);
      if (!frame) {
        return;
      }
      setUnreadCount(queryClient, frame.unreadCount);
      void invalidateNotificationFeedQueries(queryClient);
    };

    const scheduleReconnect = () => {
      source?.close();
      source = null;
      consecutiveFailures += 1;
      // Backend unreachable (e.g. module not deployed yet, or this replica at
      // its stream ceiling): stop trying instead of reconnecting forever. A
      // reload starts over.
      if (
        disposed ||
        reconnectTimer !== undefined ||
        consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
      ) {
        return;
      }
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    function connect() {
      try {
        if (disposed) {
          return;
        }
        source = new EventSource(notificationStreamUrl(), {
          withCredentials: true,
        });
        source.onopen = () => {
          consecutiveFailures = 0;
        };
        source.addEventListener('connected', handleConnected);
        source.addEventListener('notification', handleNotification);
        source.addEventListener('read', handleRead);
        source.onerror = scheduleReconnect;
      } catch {
        scheduleReconnect();
      }
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      source?.close();
    };
  }, [queryClient]);
}
