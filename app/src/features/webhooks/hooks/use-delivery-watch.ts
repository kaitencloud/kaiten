import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  type DeliveryWatch,
  type DeliveryWatchTarget,
  getSharedDeliveryWatch,
  refreshDeliveryLists,
} from './delivery-watch';

export {
  type DeliveryWatch,
  type DeliveryWatchTarget,
  WATCH_CAP_MS,
  WATCH_INTERVAL_MS,
  WATCH_READ_TIMEOUT_MS,
} from './delivery-watch';

function createDeliveryWatchOwner(queryClient: QueryClient) {
  const watch = getSharedDeliveryWatch(queryClient);
  // The webhooks resent to since the owner opened, whose lists and history
  // are read once more when it closes.
  const resentWebhookIds = new Set<string>();

  return {
    arm(target: DeliveryWatchTarget) {
      resentWebhookIds.add(target.webhookId);
      watch.arm(target);
    },
    /**
     * When the owner closes. After a resend, the webhooks' message lists (the
     * row's strip among them) and the history are read at once, so that what
     * stays on screen catches up with what the dialog showed; the lists read
     * with attempts, the closing dialog's own, are only marked stale. A
     * message still waiting for its attempt goes on being watched until its
     * end: on a slow endpoint the attempt often settles after the dialog is
     * closed, and the row's strip would otherwise stay on the failure, since
     * nothing else reads it again.
     */
    close() {
      void refreshDeliveryLists(queryClient, [...resentWebhookIds], {
        withAttempts: 'mark-stale',
      });
      resentWebhookIds.clear();
    },
  };
}

/**
 * A watch over the attempts resends queue. Every dialog under one query client
 * shares it: a message resent from several dialogs, or from one opened again,
 * is followed once. It follows every message resent, each until its own end.
 * Once armed, every 3 s, each tick's reads settled or given up before the next
 * starts, it invalidates the history once, the message lists of each watched
 * message's webhook once (the dialog's list and the row's strip behind it),
 * and each watched message: those on screen are read again, the others only
 * marked stale. A message whose attempts no query on screen shows is read
 * outside the cache, once per tick, keeping only its attempts' id, time,
 * status and trigger, so its watch can end while only the row's strip, which
 * carries no attempts, is on screen. Such a message is one whose own query is
 * not on screen (its dialog closed, or another delivery selected) and which no
 * list read with attempts shows with its last attempt; a message resent more
 * than once needs its own query, since a list shows its last attempt only. A
 * tick waits `WATCH_READ_TIMEOUT_MS` at most for its reads.
 *
 * A message's watch ends once the message, a list read with attempts or the
 * History shows settled attempts not scheduled by the provider, newer than the
 * newest known when it was resent, one per resend of it (its webhook's lists
 * are then read once more); when its read outside the cache is refused with a
 * 403, or a 404 other than a message not delivered yet; or at the first tick
 * `WATCH_CAP_MS` or more after its last resend. A watch ended at its cap is
 * taken up again by the message's next resend. Every watch ends at the first
 * tick that finds no query of the client observed: nothing renders from it any
 * more. A tick that fails is logged, and the next one runs.
 *
 * When `open` turns false or the owner unmounts, it reads the lists of the
 * webhooks this owner resent to, except those read with attempts, which are
 * only marked stale, and the history once more; the messages still waiting go
 * on being watched until their end. Nothing renders from it.
 */
export function useDeliveryWatch({
  open = true,
}: { open?: boolean } = {}): DeliveryWatch {
  const queryClient = useQueryClient();
  const [owner] = useState(() => createDeliveryWatchOwner(queryClient));

  useEffect(() => {
    if (!open) {
      return;
    }
    return () => {
      owner.close();
    };
  }, [open, owner]);

  return owner;
}
