import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { getAddonTitle } from '@/domains/billing';
import { QuantityStepper } from '../addons/quantity-stepper';

type SubscribeAddonsFieldProps = {
  /** The versions the subscription can start with: on sale, fitting the instance. */
  addons: readonly Addon[];
  form: any;
};

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  decrease: 'Pages.Customers.Instances.Detail.Billing.Addons.Quantity.decrease',
  description:
    'Pages.Customers.Instances.Detail.Billing.Subscribe.Addons.description',
  group: 'Pages.Customers.Instances.Detail.Billing.Addons.Quantity.group',
  increase: 'Pages.Customers.Instances.Detail.Billing.Addons.Quantity.increase',
  maxQuantity:
    'Pages.Customers.Instances.Detail.Billing.Subscribe.Addons.maxQuantity',
  title: 'Pages.Customers.Instances.Detail.Billing.Subscribe.Addons.title',
} as const;

type ChoiceProps = {
  addon: Addon;
  /** The units chosen, or `undefined` when the add-on is left out. */
  units: number | undefined;
  onChange: (units: number | undefined) => void;
};

function AddonChoice({ addon, onChange, units }: ChoiceProps) {
  const { t } = useTranslation();
  const checkboxId = useId();
  const label = getAddonTitle(addon);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex min-w-0 items-start gap-2">
        <Checkbox
          checked={units !== undefined}
          id={checkboxId}
          onCheckedChange={(checked) =>
            onChange(checked === true ? 1 : undefined)
          }
        />
        <div className="min-w-0 space-y-0.5">
          <Label className="whitespace-normal" htmlFor={checkboxId}>
            {label}
          </Label>
          {addon.maxQuantity === undefined ? null : (
            <p className="text-xs text-muted-foreground">
              {t(KEYS.maxQuantity, { count: addon.maxQuantity })}
            </p>
          )}
        </div>
      </div>
      {units === undefined ? null : (
        <QuantityStepper
          labels={{
            decrease: t(KEYS.decrease, { name: label }),
            group: t(KEYS.group, { name: label }),
            increase: t(KEYS.increase, { name: label }),
          }}
          max={addon.maxQuantity}
          onChange={onChange}
          value={units}
        />
      )}
    </li>
  );
}

/**
 * The add-ons a subscription can start with, each to include or leave out, with its
 * units. They are optional, and all of them are attached with the subscription
 * or none is: an add-on the API refuses refuses the subscription, and its words are
 * shown here. The units are bounded by the most each version allows.
 */
export function SubscribeAddonsField({
  addons,
  form,
}: SubscribeAddonsFieldProps) {
  const { t } = useTranslation();

  return (
    <form.AppField name="addOns">
      {(field: any) => {
        const chosen: Record<string, number> = field.state.value;
        const message = field.state.meta.isTouched
          ? field.state.meta.errors?.[0]?.message
          : undefined;

        return (
          <fieldset className="space-y-2" data-testid="subscribe-addons">
            <legend className="text-sm font-medium">{t(KEYS.title)}</legend>
            <p className="text-sm text-muted-foreground">
              {t(KEYS.description)}
            </p>
            <ul className="space-y-2">
              {addons.map((addon) => (
                <AddonChoice
                  addon={addon}
                  key={addon.slug}
                  onChange={(units) => {
                    const { [addon.slug]: _left, ...rest } = chosen;

                    field.handleChange(
                      units === undefined
                        ? rest
                        : { ...rest, [addon.slug]: units },
                    );
                  }}
                  units={chosen[addon.slug]}
                />
              ))}
            </ul>
            {message ? (
              <p
                className="text-[0.8rem] font-medium text-destructive-subtle-foreground"
                role="alert"
              >
                {t(message)}
              </p>
            ) : null}
          </fieldset>
        );
      }}
    </form.AppField>
  );
}
