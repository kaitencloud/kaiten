import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { Validity } from '@/api-client';
import { validateVoucherMutation } from '@/api-client/@tanstack/react-query.gen';

/**
 * What a check of a code came to: the verdict of the API, or the failure of the check
 * itself (a limit on the checks, a price that does not exist, a refusal). It answers for
 * the pair it was asked about, the code and the flat-fee price the subscription would start
 * on, and the dialog shows it only while the form still holds that pair.
 */
export type SubscribeCodeAnswer = {
  code: string;
  licensePriceId: string;
} & (
  | { failure: unknown; kind: 'failure' }
  | { kind: 'verdict'; validity: Validity }
);

/**
 * Checks the voucher code typed in the dialog that subscribes an instance, before the
 * subscription is sent: `POST /vouchers/validate` with the code, the instance and the
 * price the subscription would start on, so that the license, period, amount and
 * currency rules read that subscription and not the one the instance has. It writes
 * nothing, and says nothing the subscription will not say again: the subscription
 * still carries the code and stays the authority, so a verdict, a refusal or a limit
 * here never keeps it from being sent.
 *
 * Each check is the person's own request: the API limits them to sixty a minute, and a
 * 429 comes back as a failure, to be shown as temporary. The code lives in the state of
 * this hook and the body of the request, nowhere else: not in a key, not in the address,
 * not in a storage. One request goes out at a time.
 */
export function useSubscribeVoucherCheck(instanceSlug: string) {
  const validate = useMutation(validateVoucherMutation());
  const [answer, setAnswer] = useState<SubscribeCodeAnswer | null>(null);
  const busy = useRef(false);

  async function check(code: string, licensePriceId: string) {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setAnswer(null);
    try {
      const validity = await validate.mutateAsync({
        body: { code, instanceSlug, licensePriceId },
      });

      setAnswer({ code, kind: 'verdict', licensePriceId, validity });
    } catch (failure) {
      setAnswer({ code, failure, kind: 'failure', licensePriceId });
    } finally {
      busy.current = false;
    }
  }

  return { answer, check, pending: validate.isPending };
}

export type SubscribeVoucherChecker = ReturnType<
  typeof useSubscribeVoucherCheck
>;
