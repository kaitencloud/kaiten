import { Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { clearProblemFieldError } from '@/domains/billing';
import {
  hasImmutableResetPeriod,
  isBillingPeriodCadence,
  RESET_ANCHOR_VALUES,
  RESET_PERIOD_NONE,
  RESET_PERIOD_VALUES,
} from './entitlement-reset-period.shared';

type ResetSelectOption = {
  label: string;
  value: string;
};

const getOptionValue = (option: unknown) =>
  String((option as ResetSelectOption).value);
const getOptionLabel = (option: unknown) =>
  String((option as ResetSelectOption).label);

const BILLING_PERIOD = 'BILLING_PERIOD';

/**
 * What the billing date does to the windows, for whoever chooses it or reads it
 * on an entitlement that has it. It moves with the subscription, and a move
 * closes the window early: said before the choice is sent.
 */
function BillingPeriodHint() {
  const { t } = useTranslation();

  return (
    <Alert data-testid="reset-anchor-billing-period-hint" role="status">
      <Info />
      <AlertDescription>
        <p>
          {t('Pages.Entitlements.Mutation.Form.Hints.resetAnchorBillingPeriod')}
        </p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Says that the alignment the person had chosen was changed for them: the billing
 * date follows a month or a year, and the cadence just moved off both. Without it
 * the form would be sent believing the billing date is kept.
 */
function BackToCalendarNotice() {
  const { t } = useTranslation();

  return (
    <Alert data-testid="reset-anchor-back-to-calendar" role="status">
      <Info />
      <AlertDescription>
        <p>
          {t(
            'Pages.Entitlements.Mutation.Form.Notices.resetAnchorBackToCalendar',
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}

type EntitlementResetPeriodFieldsProps = {
  entitlement?: Entitlement;
  form: any;
};

/**
 * Periodic usage window of a NUMBER entitlement.
 *
 * Two rules shape this UI. The window is a one-way door: once the API stored a
 * period it can never be changed nor removed, so both selects go read-only for
 * an entitlement that already has one. And a window cannot be combined with
 * the LATEST aggregation, so the fields disappear behind an explanatory note
 * instead of offering a combination the API would refuse.
 */
export function EntitlementResetPeriodFields({
  entitlement,
  form,
}: EntitlementResetPeriodFieldsProps) {
  const { t } = useTranslation();
  const locked = hasImmutableResetPeriod(entitlement);
  // Whether the last move of the cadence took the alignment back to the calendar.
  const [anchorWasReset, setAnchorWasReset] = useState(false);

  const periodOptions: ResetSelectOption[] = RESET_PERIOD_VALUES.map(
    (value) => ({
      label:
        value === RESET_PERIOD_NONE
          ? t('Pages.Entitlements.ResetPeriods.NONE')
          : t(`Pages.Entitlements.ResetPeriods.${value}`),
      value,
    }),
  );

  // The billing date is listed whatever the cadence, with the reason it cannot be
  // chosen on a cadence that cannot follow it: the label of the option says it.
  const anchorOptionsFor = (resetPeriod: string): ResetSelectOption[] =>
    RESET_ANCHOR_VALUES.map((value) => ({
      label:
        value === BILLING_PERIOD && !isBillingPeriodCadence(resetPeriod)
          ? t('Pages.Entitlements.ResetAnchors.billingPeriodUnavailable')
          : t(`Pages.Entitlements.ResetAnchors.${value}`),
      value,
    }));

  if (locked && entitlement?.type === 'NUMBER_AI_CREDIT')
    return (
      <div className="space-y-2 text-sm">
        <p>
          {t(`Pages.Entitlements.ResetPeriods.${entitlement.resetPeriod}`)} ·{' '}
          {t(
            `Pages.Entitlements.ResetAnchors.${entitlement.resetAnchor ?? 'CALENDAR'}`,
          )}{' '}
          · {t('AI.Minimal.fixed')}
        </p>
        {entitlement.resetAnchor === BILLING_PERIOD ? (
          <BillingPeriodHint />
        ) : null}
      </div>
    );

  return (
    <form.Subscribe
      selector={(state: any) => state.values.aggregationMethod as string}
    >
      {(aggregationMethod: string) =>
        aggregationMethod === 'LATEST' ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'Pages.Entitlements.Mutation.Form.Descriptions.resetPeriodLatest',
            )}
          </p>
        ) : (
          <>
            <form.AppField
              name="resetPeriod"
              listeners={{
                onChange: ({ fieldApi, value }: any) => {
                  // The refusal of the anchor is about the two fields together: the
                  // cadence just moved, so it is no longer what the API judged.
                  clearProblemFieldError(fieldApi.form, 'resetAnchor');
                  // The billing date follows a month or a year and nothing shorter:
                  // a cadence it cannot follow takes the default alignment back,
                  // instead of leaving a refusal on a field that may be out of sight,
                  // and the person is told.
                  const mustReset =
                    fieldApi.form.getFieldValue('resetAnchor') ===
                      BILLING_PERIOD && !isBillingPeriodCadence(value);
                  if (mustReset) {
                    fieldApi.form.setFieldValue('resetAnchor', 'CALENDAR');
                  }
                  setAnchorWasReset(mustReset);
                },
              }}
            >
              {(field: any) => (
                <field.SelectField
                  label={t(
                    'Pages.Entitlements.Mutation.Form.Labels.resetPeriod',
                  )}
                  placeholder={t(
                    'Pages.Entitlements.Mutation.Form.Placeholders.resetPeriod',
                  )}
                  description={t(
                    locked
                      ? 'Pages.Entitlements.Mutation.Form.Descriptions.resetPeriodLocked'
                      : 'Pages.Entitlements.Mutation.Form.Descriptions.resetPeriod',
                  )}
                  options={periodOptions}
                  getOptionValue={getOptionValue}
                  getOptionLabel={getOptionLabel}
                  disabled={locked}
                />
              )}
            </form.AppField>
            <form.Subscribe
              selector={(state: any) => state.values.resetPeriod as string}
            >
              {(resetPeriod: string) =>
                !resetPeriod || resetPeriod === RESET_PERIOD_NONE ? null : (
                  <>
                    <form.AppField
                      name="resetAnchor"
                      listeners={{
                        // The person chose an alignment: what was said of the one
                        // taken from them is over.
                        onChange: () => setAnchorWasReset(false),
                      }}
                    >
                      {(field: any) => (
                        <field.SelectField
                          label={t(
                            'Pages.Entitlements.Mutation.Form.Labels.resetAnchor',
                          )}
                          placeholder={t(
                            'Pages.Entitlements.Mutation.Form.Placeholders.resetAnchor',
                          )}
                          description={t(
                            locked
                              ? 'Pages.Entitlements.Mutation.Form.Descriptions.resetAnchorLocked'
                              : 'Pages.Entitlements.Mutation.Form.Descriptions.resetAnchor',
                          )}
                          options={anchorOptionsFor(resetPeriod)}
                          getOptionValue={getOptionValue}
                          getOptionLabel={getOptionLabel}
                          isOptionDisabled={(option: unknown) =>
                            getOptionValue(option) === BILLING_PERIOD &&
                            !isBillingPeriodCadence(resetPeriod)
                          }
                          disabled={locked}
                        />
                      )}
                    </form.AppField>
                    {anchorWasReset ? <BackToCalendarNotice /> : null}
                    <form.Subscribe
                      selector={(state: any) =>
                        state.values.resetAnchor as string
                      }
                    >
                      {(resetAnchor: string) =>
                        resetAnchor === BILLING_PERIOD ? (
                          <BillingPeriodHint />
                        ) : null
                      }
                    </form.Subscribe>
                  </>
                )
              }
            </form.Subscribe>
          </>
        )
      }
    </form.Subscribe>
  );
}
