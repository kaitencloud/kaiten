import { useRef, useState } from 'react';
import type { Instance, InstanceAddon, InstanceBilling } from '@/api-client';
import { placeRefusalOnFields, useBoundaryRetry } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { dateTimeInputToInstant } from '@/lib/date-time-input';
import {
  cancelFormOpts,
  initialCancelFormValues,
} from '../schemas/cancel-form-options';
import {
  CANCEL_REFUSAL_FIELDS,
  cancelFormSchema,
  cancelValuesToBody,
} from '../schemas/cancel-subscription.schema';
import {
  type CancelOutcome,
  getCancellationKind,
  getProposedEndDate,
} from '../utils/cancellation.utils';
import { useCancelFollowUps } from './use-cancel-follow-ups';
import { useSubscriptionLifecycle } from './use-subscription-lifecycle';

type UseCancelSubscriptionFormOptions = {
  /** The add-ons the instance holds: what "remove the add-ons" takes off. */
  addons: readonly InstanceAddon[];
  instance: Instance;
  onCanceled: (outcome: CancelOutcome) => void;
  subscription: InstanceBilling;
};

/**
 * The form that cancels a subscription, and the failure that is about no field.
 * It sends one request however often it is pressed. A period being closed is not
 * a failure: the request is sent again by itself, once, after the minute the API
 * names, and `closing` says so meanwhile. A refusal leaves the form as it is, with
 * what was typed, since nothing was canceled and it can be sent again. Once the
 * cancellation is accepted, the two follow-ups the person asked for are carried
 * out, and the outcome of all of it is handed on.
 */
export function useCancelSubscriptionForm({
  addons,
  instance,
  onCanceled,
  subscription,
}: UseCancelSubscriptionFormOptions) {
  const instanceSlug = instance.slug ?? instance.id;
  const { cancel } = useSubscriptionLifecycle(instanceSlug);
  const followUps = useCancelFollowUps(instance);
  const { closing, send } = useBoundaryRetry();
  const [failure, setFailure] = useState<unknown>(null);
  const sending = useRef(false);

  const form = useAppForm({
    ...cancelFormOpts,
    defaultValues: {
      ...initialCancelFormValues,
      endDate: getProposedEndDate(subscription, 'AT_PERIOD_END'),
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
        const body = cancelValuesToBody(value, subscription.status);
        const canceled = await send(() =>
          cancel.mutateAsync({ body, path: { instanceSlug } }),
        );
        const outcome = await followUps.run({
          addonSlugs: value.removeAddons
            ? addons.map((addon) => addon.addonSlug)
            : [],
          endLicenseDate: value.setEndDate
            ? dateTimeInputToInstant(value.endDate)
            : null,
        });
        onCanceled({
          canceled,
          followUps: outcome,
          kind: getCancellationKind(subscription, value.mode),
        });
      } catch (error) {
        if (!placeRefusalOnFields(formApi, error, CANCEL_REFUSAL_FIELDS)) {
          setFailure(error);
        }
      } finally {
        sending.current = false;
      }
    },
    validators: { onChange: cancelFormSchema },
  });

  return { closing, failure, form };
}
