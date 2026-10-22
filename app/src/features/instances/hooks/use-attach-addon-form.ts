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
 * field when it is about one, and is returned as the failure otherwise. `offered` is the
 * versions to list: those given, and the one sent when a refusal made them out of date. Once the
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
  // The version that was sent. A refusal that says the screen is out of date (the family was
  // attached in another tab) reads the instance again, and the version is then no longer
  // offered: it stays on the field with the words of the API under it, instead of the field
  // being emptied and asked for again, which would take the refusal away unread. It stays
  // listed after another version is chosen, until the next press of the button sends that one
  // instead: the select reads the version it showed leaving its options in the update that
  // commits the new choice as the field being emptied, and the first pick would not stick.
  const [sent, setSent] = useState<Addon | null>(null);
  const offered =
    sent && !addons.some(({ slug }) => slug === sent.slug)
      ? [sent, ...addons]
      : addons;

  const form = useAppForm({
    ...attachAddonFormOpts,
    listeners: {
      onChange: () => {
        setFailure(null);
      },
    },
    onSubmit: async ({ formApi, value }) => {
      if (sending.current) {
        return;
      }
      sending.current = true;
      setFailure(null);
      try {
        const addon = offered.find(({ slug }) => slug === value.addonSlug);
        setSent(addon ?? null);

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
          offered.find(({ slug }) => slug === value.addonSlug),
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

  return { closing, failure, form, offered };
}
