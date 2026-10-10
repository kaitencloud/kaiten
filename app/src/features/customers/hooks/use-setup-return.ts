import { useEffect, useRef } from 'react';

/** The request that checks a session with Stripe, as the mutation of the payment method gives it. */
type CompleteSession = {
  mutate: (
    variables: { path: { customerSlug: string; sessionId: string } },
    options: { onSettled: () => void },
  ) => void;
};

type UseSetupReturnOptions = {
  complete: CompleteSession;
  customerSlug: string;
  /** Called once the session is dealt with, whichever way: the address then drops it. */
  onHandled: () => void;
  /** Whether the session may complete it, once its scopes are known; none says it is not known yet. */
  mayComplete: boolean | undefined;
  /** The `kaiten_setup_session` the customer came back with, when there is one. */
  sessionId: string | undefined;
};

/**
 * What the page does when the customer comes back from the page Stripe hosts to save a
 * payment method: the address carries the session, and the console asks the API to check it
 * with Stripe and keep the labels of the method (never trusting the redirect for it). It does
 * so once for a session, and drops the session from the address however it ended, so that a
 * reload does not ask again; a failure is kept by the mutation, for the card to say and to
 * try again with the same session. A session that may not complete it is only dropped.
 */
export function useSetupReturn({
  complete,
  customerSlug,
  mayComplete,
  onHandled,
  sessionId,
}: UseSetupReturnOptions) {
  const started = useRef<string | null>(null);
  const { mutate } = complete;

  useEffect(() => {
    if (
      !sessionId ||
      mayComplete === undefined ||
      started.current === sessionId
    ) {
      return;
    }
    started.current = sessionId;
    if (mayComplete) {
      mutate({ path: { customerSlug, sessionId } }, { onSettled: onHandled });
    } else {
      onHandled();
    }
  }, [customerSlug, mayComplete, mutate, onHandled, sessionId]);
}
