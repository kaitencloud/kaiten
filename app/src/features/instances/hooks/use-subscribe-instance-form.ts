import { useRef, useState } from 'react';
import type { Price, StartedSubscription } from '@/api-client';
import { placeRefusalOnFields } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import {
  getSubscribeFormErrors,
  initialSubscribeFormValues,
  SUBSCRIBE_REFUSAL_FIELDS,
  subscribeValuesToBody,
} from '../schemas/subscribe-instance.schema';
import { getDefaultBasePrice } from '../utils/subscribe-instance.utils';
import { useSubscribeInstance } from './use-subscribe-instance';

type UseSubscribeInstanceFormOptions = {
  instanceSlug: string;
  onSubscribed: (started: StartedSubscription) => void;
  /** The prices the instance can be subscribed on, default first. */
  prices: Price[];
};

/**
 * The form that subscribes an instance, and the failure that is about no field.
 * It sends one request however often it is pressed: the first press takes the
 * request, and the ones that come before the answer are ignored, whatever the
 * button shows by then. A refusal leaves the form as it is, with what was typed,
 * since nothing was started and it can be sent again: it goes on its field when it
 * is about one, and is returned as the failure otherwise.
 */
export function useSubscribeInstanceForm({
  instanceSlug,
  onSubscribed,
  prices,
}: UseSubscribeInstanceFormOptions) {
  const subscribe = useSubscribeInstance(instanceSlug);
  const [failure, setFailure] = useState<unknown>(null);
  const sending = useRef(false);

  const form = useAppForm({
    defaultValues: {
      ...initialSubscribeFormValues,
      basePriceId: getDefaultBasePrice(prices)?.id ?? '',
    },
    listeners: {
      onChange: () => setFailure(null),
    },
    onSubmit: async ({ formApi, value }) => {
      if (sending.current) {
        return;
      }
      sending.current = true;
      setFailure(null);
      try {
        onSubscribed(
          await subscribe.mutateAsync({
            body: subscribeValuesToBody(value),
            path: { instanceSlug },
          }),
        );
      } catch (error) {
        if (!placeRefusalOnFields(formApi, error, SUBSCRIBE_REFUSAL_FIELDS)) {
          setFailure(error);
        }
      } finally {
        sending.current = false;
      }
    },
    validators: {
      onChange: ({ value }) => {
        const errors = getSubscribeFormErrors(value, {
          period: prices.find((price) => price.id === value.basePriceId)
            ?.billingPeriod,
        });

        // A field reads the message of its first error, as the schema validators
        // give it: an object with a message, and not the text alone.
        return errors
          ? {
              fields: Object.fromEntries(
                Object.entries(errors).map(([field, message]) => [
                  field,
                  { message },
                ]),
              ),
            }
          : undefined;
      },
    },
  });

  return { failure, form };
}
