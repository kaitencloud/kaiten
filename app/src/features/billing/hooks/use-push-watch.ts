import { useSuspenseQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Invoice } from '@/api-client';
import { isAwaitingFinalization } from '@/domains/billing';
import { invoiceQueryOptions } from '../queries';
import {
  getPushPollDelay,
  hasPushSettled,
  type PushWatch,
  PUSH_POLL_WINDOW_MS,
  startPushWatch,
} from '../utils/push-watch';

/** Where the push a person asked for stands: nothing asked or it has had its turn, running, or out of time. */
export type PushPhase = 'expired' | 'idle' | 'waiting';

/**
 * The invoice of the page, and the watch over a push the person asked for.
 *
 * Pushing again only puts the invoice back in the queue, so the result comes later:
 * while the push has not had its turn, the invoice is read again every five seconds,
 * for two minutes. The page says it is waiting for as long as that lasts, and that
 * the push is still queued if the time runs out, when the queue keeps trying by itself.
 * When the push has had its turn, a toast says how it went; the panels of the page show
 * the rest, as they do for any invoice.
 *
 * The invoice is read here, with the interval, so that the page and what it asks
 * share one read of it.
 */
export function usePushWatch(invoiceId: string) {
  const { t } = useTranslation();
  // The watch belongs to the invoice it was started on: the page can stay mounted
  // while a link leads it to another invoice, which has no push to wait for.
  const [started, setStarted] = useState<{
    invoiceId: string;
    watch: PushWatch;
  } | null>(null);
  const watch = started?.invoiceId === invoiceId ? started.watch : null;
  const [expired, setExpired] = useState(false);
  // Whether the result was said: a ref, since saying it changes nothing on the screen.
  const announced = useRef(false);
  const { data: invoice } = useSuspenseQuery({
    ...invoiceQueryOptions(invoiceId),
    refetchInterval: ({ state }) =>
      getPushPollDelay(state.data, watch, Date.now()),
  });
  const settled = watch ? hasPushSettled(invoice, watch) : true;

  // The window runs out whether or not the invoice changes, so a timer says so.
  useEffect(() => {
    if (!watch) {
      return;
    }
    const remaining = watch.startedAt + PUSH_POLL_WINDOW_MS - Date.now();
    const timer = setTimeout(() => setExpired(true), Math.max(remaining, 0));

    return () => clearTimeout(timer);
  }, [watch]);

  // How the push went, said once: the status of the page changes with it, but a
  // person who looked away should be told.
  useEffect(() => {
    if (!watch || !settled || announced.current) {
      return;
    }
    announced.current = true;
    announceResult(invoice, t);
  }, [invoice, settled, t, watch]);

  const phase: PushPhase =
    !watch || settled ? 'idle' : expired ? 'expired' : 'waiting';

  return {
    invoice,
    phase,
    /** Starts watching a push just asked for, unless the answer shows it already had its turn. */
    start: (answer: Invoice) => {
      const next = startPushWatch(answer);
      setExpired(false);
      announced.current = hasPushSettled(answer, next);
      setStarted({ invoiceId, watch: next });
    },
  };
}

function announceResult(invoice: Invoice, t: TFunction) {
  if (invoice.status === 'PUSH_FAILED') {
    toast.error(t('Pages.Billing.Invoices.Toasts.pushFailedAgain'), {
      description: invoice.provider?.lastPushError,
    });
  } else if (isAwaitingFinalization(invoice)) {
    toast.info(t('Pages.Billing.Invoices.Toasts.awaitingFinalization'));
  } else {
    toast.success(t('Pages.Billing.Invoices.Toasts.pushed'));
  }
}
