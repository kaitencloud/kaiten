import { useStore } from '@tanstack/react-form';
import { TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { withForm } from '@/hooks/form';
import type { VoucherReferences } from '../../hooks/use-voucher-references';
import { voucherFormOpts } from '../../schemas';
import { isWeakUnboundedCode } from '../../utils/voucher-code';
import { toCustomerNames } from '../../utils/voucher-references';
import { ScopeFields } from './scope-fields';
import { WizardSection } from './wizard-section';

type EligibilityStepProps = {
  references: VoucherReferences;
};

/**
 * The third step: the code, who may redeem it, how many times and when, and the
 * conditions an instance must meet. Everything here narrows the offer; left as it is,
 * the voucher can be redeemed by any instance, once each, with no end.
 */
export const EligibilityStep = withForm({
  ...voucherFormOpts,
  props: {} as EligibilityStepProps,
  render: function EligibilityStepRender({ form, references }) {
    const { t } = useTranslation();
    const code = useStore(form.store, (state) => state.values.code);
    const expiresAt = useStore(form.store, (state) => state.values.expiresAt);
    const maxRedemptions = useStore(
      form.store,
      (state) => state.values.maxRedemptions,
    );
    const customerNames = useMemo(
      () => toCustomerNames(references.customers.data?.items ?? []),
      [references.customers.data],
    );
    const customerSlugs = useMemo(
      () =>
        Object.keys(customerNames).sort((a, b) =>
          customerNames[a].localeCompare(customerNames[b]),
        ),
      [customerNames],
    );
    const weak = isWeakUnboundedCode({ code, expiresAt, maxRedemptions });

    return (
      <div className="space-y-6">
        <WizardSection title={t('Pages.Vouchers.Wizard.Sections.code')}>
          <form.AppField name="code">
            {(field) => (
              <field.TextField
                autoComplete="off"
                description={t('Pages.Vouchers.Wizard.Descriptions.code')}
                label={t('Pages.Vouchers.Wizard.Labels.code')}
                placeholder={t('Pages.Vouchers.Wizard.Placeholders.code')}
              />
            )}
          </form.AppField>
          {weak ? (
            <Alert data-testid="weak-code-warning">
              <TriangleAlert />
              <AlertTitle>
                {t('Pages.Vouchers.Wizard.WeakCode.title')}
              </AlertTitle>
              <AlertDescription>
                <p>{t('Pages.Vouchers.Wizard.WeakCode.description')}</p>
              </AlertDescription>
            </Alert>
          ) : null}
        </WizardSection>
        <WizardSection
          description={t('Pages.Vouchers.Wizard.Sections.customerDescription')}
          title={t('Pages.Vouchers.Wizard.Sections.customer')}
        >
          <form.AppField name="restrictedCustomerSlug">
            {(field) =>
              references.customers.data ? (
                <field.ComboboxField
                  clearable
                  clearLabel={t('Pages.Vouchers.Wizard.anyCustomer')}
                  description={t(
                    'Pages.Vouchers.Wizard.Descriptions.restrictedCustomer',
                  )}
                  getOptionLabel={(slug: unknown) =>
                    customerNames[String(slug)] ?? String(slug)
                  }
                  getOptionValue={(slug: unknown) => String(slug)}
                  label={t('Pages.Vouchers.Wizard.Labels.restrictedCustomer')}
                  options={customerSlugs}
                  placeholder={t('Pages.Vouchers.Wizard.anyCustomer')}
                  searchPlaceholder={t(
                    'Pages.Vouchers.Wizard.Placeholders.customerSearch',
                  )}
                />
              ) : (
                <field.TextField
                  autoComplete="off"
                  description={t(
                    'Pages.Vouchers.Wizard.Descriptions.restrictedCustomerSlug',
                  )}
                  label={t('Pages.Vouchers.Wizard.Labels.restrictedCustomer')}
                />
              )
            }
          </form.AppField>
        </WizardSection>
        <WizardSection
          description={t('Pages.Vouchers.Wizard.Sections.limitsDescription')}
          title={t('Pages.Vouchers.Wizard.Sections.limits')}
        >
          <form.AppField name="maxRedemptions">
            {(field) => (
              <field.NumberField
                className="sm:max-w-xs"
                description={t(
                  'Pages.Vouchers.Wizard.Descriptions.maxRedemptions',
                )}
                label={t('Pages.Vouchers.Wizard.Labels.maxRedemptions')}
                min={1}
                step={1}
              />
            )}
          </form.AppField>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="startsAt">
              {(field) => (
                <field.DateTimeField
                  description={t('Pages.Vouchers.Wizard.Descriptions.startsAt')}
                  label={t('Pages.Vouchers.Wizard.Labels.startsAt')}
                />
              )}
            </form.AppField>
            <form.AppField name="expiresAt">
              {(field) => (
                <field.DateTimeField
                  description={t(
                    'Pages.Vouchers.Wizard.Descriptions.expiresAt',
                  )}
                  label={t('Pages.Vouchers.Wizard.Labels.expiresAt')}
                />
              )}
            </form.AppField>
          </div>
        </WizardSection>
        <ScopeFields form={form} references={references} />
      </div>
    );
  },
});
