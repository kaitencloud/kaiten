import { useStore } from '@tanstack/react-form';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import FormField from '@/components/form/fields/form-field';
import { Button } from '@/components/ui/button';
import { RetryableProblem } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import type { VoucherReferences } from '../../hooks/use-voucher-references';
import {
  type GrantFormValues,
  MODIFIER_TYPES,
  newGrant,
  voucherFormOpts,
} from '../../schemas';
import { MODIFIER_LABEL_KEYS } from '../../utils/voucher-labels';
import { isBoostable } from '../../utils/voucher-references';

type BoostPanelProps = {
  entitlements: VoucherReferences['entitlements'];
};

/**
 * The offer of a boost: which numeric entitlements it changes, and how. A boost sets an
 * entitlement to a value, adds to it, multiplies it or lifts its limit; each is a
 * line, and an entitlement is changed once. Only the entitlements that carry a number
 * are offered, since the others have no value to change.
 */
export const BoostPanel = withForm({
  ...voucherFormOpts,
  props: {} as BoostPanelProps,
  render: function BoostPanelRender({ entitlements, form }) {
    const { t } = useTranslation();
    const grants = useStore(form.store, (state) => state.values.grants);
    const names = useMemo(
      () =>
        Object.fromEntries(
          (entitlements.data?.items ?? []).flatMap((entitlement) =>
            entitlement.slug && isBoostable(entitlement)
              ? [[entitlement.slug, entitlement.name]]
              : [],
          ),
        ) as Record<string, string>,
      [entitlements.data],
    );
    const slugs = useMemo(() => Object.keys(names), [names]);

    if (entitlements.isError) {
      return (
        <RetryableProblem
          error={entitlements.error}
          onRetry={() => void entitlements.refetch()}
        />
      );
    }

    return (
      <form.AppField mode="array" name="grants">
        {(list) => (
          <FormField<GrantFormValues[]>
            description={t('Pages.Vouchers.Wizard.Descriptions.grants')}
            label={t('Pages.Vouchers.Wizard.Labels.grants')}
            required
          >
            {() => (
              <div className="space-y-3">
                {grants.map((grant, index) => (
                  <div
                    className="grid items-start gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                    data-testid="voucher-grant-row"
                    key={grant.key}
                  >
                    <form.AppField name={`grants[${index}].entitlementSlug`}>
                      {(field) => (
                        <field.ComboboxField
                          getOptionLabel={(slug: unknown) =>
                            names[String(slug)] ?? String(slug)
                          }
                          getOptionValue={(slug: unknown) => String(slug)}
                          label={t('Pages.Vouchers.Wizard.Labels.entitlement')}
                          options={slugs}
                          placeholder={t(
                            'Pages.Vouchers.Wizard.Placeholders.entitlement',
                          )}
                          searchPlaceholder={t(
                            'Pages.Vouchers.Wizard.Placeholders.entitlementSearch',
                          )}
                        />
                      )}
                    </form.AppField>
                    <form.AppField name={`grants[${index}].modifierType`}>
                      {(field) => (
                        <field.SelectField
                          getOptionLabel={(option) =>
                            t(
                              MODIFIER_LABEL_KEYS[
                                option as GrantFormValues['modifierType']
                              ],
                            )
                          }
                          label={t('Pages.Vouchers.Wizard.Labels.modifier')}
                          options={[...MODIFIER_TYPES]}
                        />
                      )}
                    </form.AppField>
                    {grant.modifierType === 'UNLIMITED' ? (
                      <p className="self-center pt-6 text-sm text-muted-foreground">
                        {t('Pages.Vouchers.Wizard.unlimitedNote')}
                      </p>
                    ) : (
                      <form.AppField name={`grants[${index}].modifierValue`}>
                        {(field) => (
                          <field.TextField
                            autoComplete="off"
                            inputMode="decimal"
                            label={t('Pages.Vouchers.Wizard.Labels.value')}
                            placeholder={t(
                              'Pages.Vouchers.Wizard.Placeholders.value',
                            )}
                          />
                        )}
                      </form.AppField>
                    )}
                    <Button
                      aria-label={t('Pages.Vouchers.Wizard.removeChange', {
                        position: index + 1,
                      })}
                      className="mt-6 justify-self-end"
                      onClick={() => list.removeValue(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  onClick={() => list.pushValue(newGrant())}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="size-3" />
                  {t('Pages.Vouchers.Wizard.addChange')}
                </Button>
              </div>
            )}
          </FormField>
        )}
      </form.AppField>
    );
  },
});
