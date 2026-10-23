import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { handleBillingProblem, RetryableProblem } from '@/domains/billing';
import { checkoutSessionQueryOptions } from '../../queries';
import type { CheckoutLabels } from '../../utils/checkout-session';
import { CheckoutSessionDetail } from './checkout-session-detail';

type CheckoutSessionDrawerProps = {
  /** The names a checkout shows in place of ids and slugs. */
  labels: CheckoutLabels;
  /** The e-mail of the checkout as the list holds it, to title the panel while the checkout is read. */
  listedEmail?: string;
  /** Closes the panel: the route drops the checkout it was opened on. */
  onClose: () => void;
  sessionId: string;
};

function DetailSkeleton() {
  const { t } = useTranslation();

  return (
    <div
      aria-busy="true"
      aria-label={t('Pages.Customers.CheckoutSessions.Drawer.loading')}
      className="space-y-3"
      role="status"
    >
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/**
 * Gives the focus back to the link of the row the panel was opened from, once the panel is
 * gone: the URL drives the panel, which is unmounted rather than closed, so there is no
 * trigger for the dialog to remember and the focus would fall to the page. A row the
 * filters have since hidden has no link, and the focus stays where it falls.
 */
function useReturnFocusToOpener(sessionId: string) {
  useEffect(
    () => () => {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            `a[data-session-id="${CSS.escape(sessionId)}"]`,
          )
          ?.focus(),
      );
    },
    [sessionId],
  );
}

/**
 * The panel of one checkout, which the URL opens (`?session=<id>`) so that it can be
 * linked to and the back button closes it. It reads the checkout from the API apart from
 * the list: the list may hold an older picture, and a checkout the API deleted 90 days
 * after it closed is told as gone and not as an error.
 */
export function CheckoutSessionDrawer({
  labels,
  listedEmail,
  onClose,
  sessionId,
}: CheckoutSessionDrawerProps) {
  const { t } = useTranslation();
  const { data, error, isPending, refetch } = useQuery(
    checkoutSessionQueryOptions(sessionId),
  );
  const gone = error !== null && handleBillingProblem(error).status === 404;
  const prefix = 'Pages.Customers.CheckoutSessions.Drawer';
  const popup = useRef<HTMLDivElement>(null);
  useReturnFocusToOpener(sessionId);

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent
        className="w-full gap-0 outline-none sm:max-w-xl"
        // The panel itself takes the focus when it opens: the dialog is announced by its
        // title, and no ring is drawn round a body that nothing was asked of. Where the
        // focus goes back to is the opener's to say (see `useReturnFocusToOpener`).
        finalFocus={false}
        initialFocus={popup}
        ref={popup}
      >
        <SheetHeader className="border-b">
          <SheetTitle>
            {data?.email ?? listedEmail ?? t(`${prefix}.title`)}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs break-all">
            {sessionId}
          </SheetDescription>
        </SheetHeader>
        {/* The body scrolls, so the keyboard must be able to reach it: a checkout that has
            no link in it would leave nothing to focus. */}
        <div
          aria-label={t(`${prefix}.title`)}
          className="flex-1 overflow-y-auto p-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
          role="region"
          tabIndex={0}
        >
          {isPending ? <DetailSkeleton /> : null}
          {gone ? (
            <p className="text-sm" data-testid="checkout-session-gone">
              {t(`${prefix}.gone`)}
            </p>
          ) : null}
          {error && !gone ? (
            <RetryableProblem error={error} onRetry={() => void refetch()} />
          ) : null}
          {data ? (
            <CheckoutSessionDetail labels={labels} session={data} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
