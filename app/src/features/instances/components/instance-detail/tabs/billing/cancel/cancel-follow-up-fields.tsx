import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstanceAddon } from '@/api-client';
import { formatBoundary } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { cancelFormOpts } from '../../../../../schemas/cancel-form-options';

export type CancelAddonsState = {
  /** The add-ons the instance holds. Empty while they are read, or when the read failed. */
  items: readonly InstanceAddon[];
  isError: boolean;
  isPending: boolean;
};

type CancelFollowUpFieldsProps = {
  addons: CancelAddonsState;
  /** When the license of the instance ends now. */
  endLicenseDate: string | undefined;
  /** Whether the session may take add-ons off the instance. */
  mayRemoveAddons: boolean;
  /** Whether the session may change the instance. */
  maySetEndDate: boolean;
};

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  description:
    'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.description',
  endDate: 'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.endDate',
  removeAddons:
    'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.removeAddons',
  removeAddonsDescription:
    'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.removeAddonsDescription',
  removeAddonsLoading:
    'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.removeAddonsLoading',
  removeAddonsNone:
    'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.removeAddonsNone',
  removeAddonsUnknown:
    'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.removeAddonsUnknown',
  setEndDate:
    'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.setEndDate',
  setEndDateDescription:
    'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.setEndDateDescription',
  title: 'Pages.Customers.Instances.Detail.Billing.Cancel.FollowUps.title',
} as const;

/**
 * The two things a cancellation leaves alone, offered beside it and unchecked:
 * cancelling changes billing only, so the add-ons stay on the instance and its
 * license keeps its dates unless the person says otherwise. Each is a request
 * of its own, sent once the cancellation is accepted. An option the session may
 * not carry out is not offered, and one with nothing to do says so.
 */
export const CancelFollowUpFields = withForm({
  ...cancelFormOpts,
  props: {} as CancelFollowUpFieldsProps,
  render: function CancelFollowUpFieldsRender({
    addons,
    endLicenseDate,
    form,
    mayRemoveAddons,
    maySetEndDate,
  }) {
    const { i18n, t } = useTranslation();

    if (!mayRemoveAddons && !maySetEndDate) {
      return null;
    }
    const nothingToRemove =
      !addons.isPending && !addons.isError && addons.items.length === 0;
    const addonsDescription = addons.isPending
      ? t(KEYS.removeAddonsLoading)
      : addons.isError
        ? t(KEYS.removeAddonsUnknown)
        : nothingToRemove
          ? t(KEYS.removeAddonsNone)
          : t(KEYS.removeAddonsDescription, {
              addons: addons.items
                .map((addon) => `${addon.addonSlug} × ${addon.quantity}`)
                .join(', '),
            });

    return (
      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{t(KEYS.title)}</legend>
        <p className="text-xs text-muted-foreground">{t(KEYS.description)}</p>
        {mayRemoveAddons ? (
          <form.AppField name="removeAddons">
            {(field) => (
              <field.CheckboxField
                description={addonsDescription}
                disabled={addons.isPending || addons.isError || nothingToRemove}
                label={t(KEYS.removeAddons)}
              />
            )}
          </form.AppField>
        ) : null}
        {maySetEndDate ? (
          <>
            <form.AppField name="setEndDate">
              {(field) => (
                <field.CheckboxField
                  description={t(KEYS.setEndDateDescription, {
                    date: formatBoundary(endLicenseDate, i18n.language),
                  })}
                  label={t(KEYS.setEndDate)}
                />
              )}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.setEndDate}>
              {(setEndDate) =>
                setEndDate ? (
                  // The field is loaded when it is first drawn: without a boundary
                  // of its own the whole dialog would flash its skeleton meanwhile.
                  <Suspense fallback={null}>
                    <form.AppField name="endDate">
                      {(field) => (
                        <field.DateTimeField label={t(KEYS.endDate)} required />
                      )}
                    </form.AppField>
                  </Suspense>
                ) : null
              }
            </form.Subscribe>
          </>
        ) : null}
      </fieldset>
    );
  },
});
