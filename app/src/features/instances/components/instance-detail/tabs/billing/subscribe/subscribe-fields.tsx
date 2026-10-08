import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import {
  BILLING_TIMING_LABEL_KEYS,
  canStartWithTrial,
  getPriceAmountParts,
  getPriceLabel,
  joinPriceAmount,
  MAX_DAYS_UNTIL_DUE,
  MAX_TRIAL_DAYS,
  ProviderBadge,
} from '@/domains/billing';

type SubscribeFieldsProps = {
  /** The organization's payment terms, once read: what an empty field comes to. */
  defaultDaysUntilDue: number | undefined;
  form: any;
  prices: Price[];
  /** Whether the release has trials: where it has none the field is not there. */
  trials: boolean;
};

/** A price as an option reads: its label, what it charges, over what period, and when. */
function usePriceLabel() {
  const { i18n, t } = useTranslation();

  return (price: Price) =>
    t('Pages.Customers.Instances.Detail.Billing.Subscribe.priceOption', {
      label: getPriceLabel(price, undefined, t),
      price: joinPriceAmount(
        getPriceAmountParts(price, undefined, t, i18n.language),
      ),
      timing: t(BILLING_TIMING_LABEL_KEYS[price.billingTiming]),
    });
}

/**
 * The fields that subscribe an instance. The provider is told and not asked: this
 * release collects through the handoff queue only, so there is nothing to choose.
 * The trial starts at the days the license carries and is there only where the
 * release has trials, and not for a price that bills in arrears, whose trial the
 * API cannot close yet: that says so instead. The payment terms and the start are
 * optional, and say what an empty field means.
 */
export function SubscribeFields({
  defaultDaysUntilDue,
  form,
  prices,
  trials,
}: SubscribeFieldsProps) {
  const { t } = useTranslation();
  const priceLabel = usePriceLabel();

  return (
    <Suspense fallback={null}>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">
          {t('Pages.Customers.Instances.Detail.Billing.Subscribe.provider')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ProviderBadge kind="NOOP" />
          <span className="text-sm text-muted-foreground">
            {t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.providerHint',
            )}
          </span>
        </div>
      </div>
      <form.AppField name="basePriceId">
        {(field: any) => (
          <field.SelectField
            description={t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.basePriceHint',
            )}
            getOptionLabel={priceLabel}
            getOptionValue={(price: Price) => price.id}
            label={t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.basePrice',
            )}
            options={prices}
            required
          />
        )}
      </form.AppField>
      {trials ? (
        <form.Subscribe selector={(state: any) => state.values.basePriceId}>
          {(basePriceId: string) => {
            const price = prices.find(
              (candidate) => candidate.id === basePriceId,
            );

            return price && !canStartWithTrial(price.billingTiming) ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="trial-unavailable"
              >
                {t(
                  'Pages.Customers.Instances.Detail.Billing.Subscribe.trialDaysArrears',
                )}
              </p>
            ) : (
              <form.AppField name="trialDays">
                {(field: any) => (
                  <field.NumberField
                    // A longer trial is refused in words, and not changed to the longest.
                    allowOutOfRange
                    description={t(
                      'Pages.Customers.Instances.Detail.Billing.Subscribe.trialDaysHint',
                    )}
                    label={t(
                      'Pages.Customers.Instances.Detail.Billing.Subscribe.trialDays',
                    )}
                    max={MAX_TRIAL_DAYS}
                    min={0}
                    step={1}
                  />
                )}
              </form.AppField>
            );
          }}
        </form.Subscribe>
      ) : null}
      <form.AppField name="daysUntilDue">
        {(field: any) => (
          <field.NumberField
            // More than a year is refused in words, and not changed to a year.
            allowOutOfRange
            description={t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.daysUntilDueHint',
            )}
            label={t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.daysUntilDue',
            )}
            max={MAX_DAYS_UNTIL_DUE}
            min={0}
            placeholder={
              defaultDaysUntilDue === undefined
                ? t(
                    'Pages.Customers.Instances.Detail.Billing.Subscribe.daysUntilDuePlaceholderUnknown',
                  )
                : t(
                    'Pages.Customers.Instances.Detail.Billing.Subscribe.daysUntilDuePlaceholder',
                    { days: defaultDaysUntilDue },
                  )
            }
            step={1}
          />
        )}
      </form.AppField>
      <form.AppField name="startAt">
        {(field: any) => (
          <field.DateTimeField
            description={t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.startAtHint',
            )}
            label={t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.startAt',
            )}
          />
        )}
      </form.AppField>
    </Suspense>
  );
}
