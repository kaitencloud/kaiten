import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import {
  hasImmutableResetPeriod,
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

  const periodOptions: ResetSelectOption[] = RESET_PERIOD_VALUES.map(
    (value) => ({
      label:
        value === RESET_PERIOD_NONE
          ? t('Pages.Entitlements.ResetPeriods.NONE')
          : t(`Pages.Entitlements.ResetPeriods.${value}`),
      value,
    }),
  );

  const anchorOptions: ResetSelectOption[] = RESET_ANCHOR_VALUES.map(
    (value) => ({
      label: t(`Pages.Entitlements.ResetAnchors.${value}`),
      value,
    }),
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
            <form.AppField name="resetPeriod">
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
                  <form.AppField name="resetAnchor">
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
                            ? 'Pages.Entitlements.Mutation.Form.Descriptions.resetPeriodLocked'
                            : 'Pages.Entitlements.Mutation.Form.Descriptions.resetAnchor',
                        )}
                        options={anchorOptions}
                        getOptionValue={getOptionValue}
                        getOptionLabel={getOptionLabel}
                        disabled={locked}
                      />
                    )}
                  </form.AppField>
                )
              }
            </form.Subscribe>
          </>
        )
      }
    </form.Subscribe>
  );
}
