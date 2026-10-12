import { useTranslation } from 'react-i18next';
import type { Addon, InstanceBilling } from '@/api-client';
import { getAddonTitle } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { attachAddonFormOpts } from '../../../../../schemas/attach-addon-form-options';
import { AttachAddonDetails } from './attach-addon-details';

type AttachAddonFieldsProps = {
  /** The versions that can be chosen: on sale, fitting the instance, of a family it holds none of. */
  addons: readonly Addon[];
  /** The billing period of the subscription, which decides what a unit costs. */
  period: InstanceBilling['billingPeriod'];
};

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  addon: 'Pages.Customers.Instances.Detail.Billing.Addons.Attach.addon',
  addonHint: 'Pages.Customers.Instances.Detail.Billing.Addons.Attach.addonHint',
  addonPlaceholder:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.addonPlaceholder',
  quantity: 'Pages.Customers.Instances.Detail.Billing.Addons.Attach.quantity',
  quantityHint:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.quantityHint',
  quantityHintMax:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.quantityHintMax',
} as const;

/**
 * What the dialog that attaches an add-on asks: which version, among the ones the
 * instance can take, and how many units, from one to the most the version allows.
 * Once a version is chosen it is described, with what the subscription bills for a
 * unit.
 */
export const AttachAddonFields = withForm({
  ...attachAddonFormOpts,
  props: {} as AttachAddonFieldsProps,
  render: function AttachAddonFieldsRender({ addons, form, period }) {
    const { t } = useTranslation();

    return (
      <div className="space-y-5">
        <form.AppField name="addonSlug">
          {(field) => (
            <field.SelectField
              description={t(KEYS.addonHint)}
              getOptionLabel={(addon) => getAddonTitle(addon as Addon)}
              getOptionValue={(addon) => (addon as Addon).slug}
              label={t(KEYS.addon)}
              options={[...addons]}
              placeholder={t(KEYS.addonPlaceholder)}
              required
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.addonSlug}>
          {(addonSlug) => {
            const selected = addons.find(({ slug }) => slug === addonSlug);
            const max = selected?.maxQuantity;

            return (
              <>
                {selected ? (
                  <AttachAddonDetails addon={selected} period={period} />
                ) : null}
                <form.AppField name="quantity">
                  {(field) => (
                    <field.NumberField
                      // A quantity above the most is refused in words, and not
                      // changed to the most behind the person's back.
                      allowOutOfRange
                      description={
                        max === undefined
                          ? t(KEYS.quantityHint)
                          : t(KEYS.quantityHintMax, { max })
                      }
                      label={t(KEYS.quantity)}
                      max={max}
                      min={1}
                      required
                      step={1}
                    />
                  )}
                </form.AppField>
              </>
            );
          }}
        </form.Subscribe>
      </div>
    );
  },
});
