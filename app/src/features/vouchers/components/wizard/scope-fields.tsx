import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import type { VoucherReferences } from '../../hooks/use-voucher-references';
import { voucherFormOpts } from '../../schemas';
import { getAddonLabel, getLicenseLabel } from '../../utils/voucher-references';
import { ChecklistFormField } from './checklist-form-field';
import { WizardSection } from './wizard-section';

const CURRENCIES = [...CURRENCY_EXPONENTS.keys()].sort();

type ScopeFieldsProps = {
  references: VoucherReferences;
};

/**
 * What an instance must be to redeem the voucher: on which license versions and which
 * add-on versions it is limited to (nothing checked is no limit), and the conditions of
 * the subscription it asks. An instance meets the voucher when it holds one of the
 * versions listed, for the license and for the add-ons alike.
 */
export const ScopeFields = withForm({
  ...voucherFormOpts,
  props: {} as ScopeFieldsProps,
  render: function ScopeFieldsRender({ form, references }) {
    const { t } = useTranslation();
    const licenseOptions = useMemo(
      () =>
        (references.licenses.data?.items ?? []).map((license) => ({
          id: license.id,
          label: getLicenseLabel(license, t),
          muted: license.lifecycleState !== 'PUBLISHED',
        })),
      [references.licenses.data, t],
    );
    const addonOptions = useMemo(
      () =>
        (references.addons.data?.items ?? []).map((addon) => ({
          id: addon.id,
          label: getAddonLabel(addon, t),
          muted: addon.lifecycleState !== 'PUBLISHED',
        })),
      [references.addons.data, t],
    );

    return (
      <>
        <WizardSection
          description={t('Pages.Vouchers.Wizard.Sections.versionsDescription')}
          title={t('Pages.Vouchers.Wizard.Sections.versions')}
        >
          <form.AppField name="applicableLicenseIds">
            {() => (
              <ChecklistFormField
                description={t(
                  'Pages.Vouchers.Wizard.Descriptions.licenseVersions',
                )}
                label={t('Pages.Vouchers.Wizard.Labels.licenseVersions')}
                options={licenseOptions}
                query={references.licenses}
              />
            )}
          </form.AppField>
          <form.AppField name="applicableAddonIds">
            {() => (
              <ChecklistFormField
                description={t(
                  'Pages.Vouchers.Wizard.Descriptions.addonVersions',
                )}
                label={t('Pages.Vouchers.Wizard.Labels.addonVersions')}
                options={addonOptions}
                query={references.addons}
              />
            )}
          </form.AppField>
        </WizardSection>
        <WizardSection
          description={t(
            'Pages.Vouchers.Wizard.Sections.conditionsDescription',
          )}
          title={t('Pages.Vouchers.Wizard.Sections.conditions')}
        >
          <form.AppField name="firstTimeOnly">
            {(field) => (
              <field.CheckboxField
                description={t(
                  'Pages.Vouchers.Wizard.Descriptions.firstTimeOnly',
                )}
                label={t('Pages.Vouchers.Wizard.Labels.firstTimeOnly')}
              />
            )}
          </form.AppField>
          <form.AppField name="annualOnly">
            {(field) => (
              <field.CheckboxField
                description={t('Pages.Vouchers.Wizard.Descriptions.annualOnly')}
                label={t('Pages.Vouchers.Wizard.Labels.annualOnly')}
              />
            )}
          </form.AppField>
          <MinimumAmountFields form={form} />
        </WizardSection>
      </>
    );
  },
});

/** The least the base price of the subscription may be, in one currency. */
const MinimumAmountFields = withForm({
  ...voucherFormOpts,
  render: function MinimumAmountFieldsRender({ form }) {
    const { t } = useTranslation();

    return (
      <form.Subscribe selector={(state) => state.values.minimumCurrency}>
        {(currency) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="minimumCurrency">
              {(field) => (
                <field.ComboboxField
                  clearable
                  description={t(
                    'Pages.Vouchers.Wizard.Descriptions.minimumCurrency',
                  )}
                  getOptionLabel={(code: unknown) => String(code)}
                  getOptionValue={(code: unknown) => String(code)}
                  label={t('Pages.Vouchers.Wizard.Labels.minimumCurrency')}
                  options={CURRENCIES}
                  placeholder={t('Pages.Vouchers.Wizard.Placeholders.currency')}
                  searchPlaceholder={t(
                    'Pages.Vouchers.Wizard.Placeholders.currencySearch',
                  )}
                />
              )}
            </form.AppField>
            <form.AppField name="minimumAmount">
              {(field) => (
                <field.MoneyField
                  currency={currency}
                  description={t(
                    'Pages.Vouchers.Wizard.Descriptions.minimumAmount',
                  )}
                  label={t('Pages.Vouchers.Wizard.Labels.minimumAmount')}
                  placeholder={t('Pages.Vouchers.Wizard.Placeholders.amount')}
                />
              )}
            </form.AppField>
          </div>
        )}
      </form.Subscribe>
    );
  },
});
