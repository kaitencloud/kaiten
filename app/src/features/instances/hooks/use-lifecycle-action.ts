import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useBoundaryRetry } from '@/domains/billing';
import { getApiErrorMessage } from '@/lib/errors';
import { isOutOfDate } from './use-subscription-lifecycle';

/**
 * A change to a subscription made by pressing one button, with nothing to fill in
 * first (taking a cancellation back, dropping a plan change): it sends one request
 * however often it is pressed, waits out a period that is being closed (`closing`)
 * and keeps the failure of any other refusal, for the screen to show beside the
 * button with a way to press it again. A refusal that says the subscription is no
 * longer as the screen showed it is told in a toast instead: the screen is refreshed
 * by it, and the notice the button stood in is gone before the words could be read.
 * Nothing is optimistic: what the screen shows is what the API answered.
 *
 * `refusalAction` gives the toast of such a refusal a button of its own, for the
 * refusals that have an obvious next step.
 */
export function useLifecycleAction<T>(
  run: () => Promise<T>,
  onDone?: (result: T) => void,
  options: {
    refusalAction?: (
      error: unknown,
    ) => { label: string; onClick: () => void } | undefined;
  } = {},
) {
  const { closing, send } = useBoundaryRetry();
  const [failure, setFailure] = useState<unknown>(null);
  const [isSending, setIsSending] = useState(false);
  const sending = useRef(false);

  async function perform() {
    if (sending.current) {
      return;
    }
    sending.current = true;
    setIsSending(true);
    setFailure(null);
    try {
      onDone?.(await send(run));
    } catch (error) {
      if (isOutOfDate(error)) {
        const action = options.refusalAction?.(error);

        if (action) {
          toast.error(getApiErrorMessage(error), { action });
        } else {
          toast.error(getApiErrorMessage(error));
        }
      } else {
        setFailure(error);
      }
    } finally {
      sending.current = false;
      setIsSending(false);
    }
  }

  return { closing, failure, isSending, perform };
}
