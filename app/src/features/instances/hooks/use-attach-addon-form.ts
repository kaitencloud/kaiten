import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon, Entitlement } from '@/api-client';
import {
  getAddonTitle,
  placeRefusalOnFields,
  useBoundaryRetry,
} from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { attachAddonFormOpts } from '../schemas/attach-addon-form-options';
import {
  ATTACH_ADDON_REFUSAL_FIELDS,
  attachValuesToBody,
  getAttachAddonFormErrors,
} from '../schemas/attach-addon.schema';
import { useAddonChangeReport } from './use-addon-change-report';
import { useInstanceAddonMutations } from './use-instance-addon-mutations';

type UseAttachAddonFormOptions = {
  /** The versions the form offers: it checks a quantity against the one chosen. */
  addons: readonly Addon[];
  /** The catalogue of entitlements, to name what the add-on did to the instance. */
  entitlements: readonly Pick<Entitlement, 'name' | 'slug'>[];
  instanceSlug: string;
  onAttached: () => void;
};

/**
 * The form that attaches an add-on to an instance, and the failure that is about no
 * field. It sends one request however often it is pressed. A period being closed is
 * not a failure: the request is sent again by itself, once, after the minute the API
 * names, and `closing` says so meanwhile. A refusal leaves the form as it is, with
 * what was typed, since nothing was attached and it can be sent again: it goes on its
 * field when it is about one, and is returned as the failure otherwise. Once the
 * add-on is attached, the toast says what it did to the entitlements.
 */
export function useAttachAddonForm({
  addons,
  entitlements,
  instanceSlug,
  onAttached,
}: UseAttachAddonFormOptions) {
  const { t } = useTranslation();
  const { attach } = useInstanceAddonMutations(instanceSlug);
  const report = useAddonChangeReport(instanceSlug, entitlements);
  const { closing, send } = useBoundaryRetry();
  const [failure, setFailure] = useState<unknown>(null);
  const sending = useRef(false);

  const form = useAppForm({
    ...attachAddonFormOpts,
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
        const addon = addons.find(({ slug }) => slug === value.addonSlug);

        await report(
          () =>
            send(() =>
              attach.mutateAsync({
                body: attachValuesToBody(value),
                path: { instanceSlug },
              }),
            ),
          t('Pages.Customers.Instances.Detail.Billing.Addons.Toasts.attached', {
            name: addon ? getAddonTitle(addon) : value.addonSlug,
            quantity: value.quantity,
          }),
        );
        onAttached();
      } catch (error) {
        if (
          !placeRefusalOnFields(formApi, error, ATTACH_ADDON_REFUSAL_FIELDS)
        ) {
          setFailure(error);
        }
      } finally {
        sending.current = false;
      }
    },
    validators: {
      onChange: ({ value }) => {
        const errors = getAttachAddonFormErrors(
          value,
          addons.find(({ slug }) => slug === value.addonSlug),
        );

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

  return { closing, failure, form };
}
