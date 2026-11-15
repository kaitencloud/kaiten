import { useAiAccess, isAiEntitlement } from '@/domains/ai-credits';
import { useStore } from '@tanstack/react-form';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import FormField from '@/components/form/fields/form-field';
import { Button } from '@/components/ui/button';
import { RetryableProblem } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { useBoostLicenseGrants } from '../../hooks/use-boost-license-grants';
import type { VoucherReferences } from '../../hooks/use-voucher-references';
import {
  type GrantFormValues,
  MODIFIER_TYPES,
  newGrant,
  voucherFormOpts,
} from '../../schemas';
import { MODIFIER_LABEL_KEYS } from '../../utils/voucher-labels';
import { isBoostable } from '../../utils/voucher-references';
import { BoostLicenseWarning } from './boost-license-warning';

type BoostPanelProps = {
  entitlements: VoucherReferences['entitlements'];
  /** The license versions the session can name: what a voucher limited to some is measured against. */
  licenses: VoucherReferences['licenses'];
};

/**
 * A boost changes each entitlement once. Numeric grants offer every modifier;
 * BOOLEAN and CONFIG accept SET with a typed value. A lowering SET warns on its
 * line and remains permitted.
 */
export const BoostPanel = withForm({
  ...voucherFormOpts,
  props: {} as BoostPanelProps,
  render: function BoostPanelRender({ entitlements, form, licenses }) {
    const { t } = useTranslation();
    const access = useAiAccess();
    const grants = useStore(form.store, (state) => state.values.grants);
    const applicableLicenseIds = useStore(
      form.store,
      (state) => state.values.applicableLicenseIds,
    );
    const visibleGrants = grants
      .map((grant, index) => ({ grant, index }))
      .filter(
        ({ grant }) =>
          !grant.entitlementSlug ||
          access.available ||
          entitlements.data?.items.some(
            (item) =>
              item.slug === grant.entitlementSlug &&
              !isAiEntitlement(item.type),
          ),
      );
    const licenseGrants = useBoostLicenseGrants({
      applicableLicenseIds,
      enabled: visibleGrants.some(({ grant }) => grant.modifierType === 'SET'),
      licenses,
    });
    const names = useMemo(
      () =>
        Object.fromEntries(
          (entitlements.data?.items ?? []).flatMap((entitlement) =>
            entitlement.slug &&
            isBoostable(entitlement) &&
            (access.available || !isAiEntitlement(entitlement.type))
              ? [[entitlement.slug, entitlement.name]]
              : [],
          ),
        ) as Record<string, string>,
      [entitlements.data, access.available],
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
                {visibleGrants.map(({ grant, index }) => (
                  <div
                    className="space-y-3 rounded-md border p-3"
                    data-testid="voucher-grant-row"
                    key={grant.key}
                  >
                    <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                      <form.AppField
                        name={`grants[${index}].entitlementSlug`}
                        listeners={{
                          onChange: ({ value }) => {
                            const type = entitlements.data?.items.find(
                              (item) => item.slug === value,
                            )?.type;
                            form.setFieldValue(
                              `grants[${index}].entitlementType`,
                              type,
                            );
                            if (type === 'BOOLEAN' || type === 'CONFIG')
                              form.setFieldValue(
                                `grants[${index}].modifierType`,
                                'SET',
                              );
                          },
                        }}
                      >
                        {(field) => (
                          <field.ComboboxField
                            getOptionLabel={(slug: unknown) =>
                              names[String(slug)] ?? String(slug)
                            }
                            getOptionValue={(slug: unknown) => String(slug)}
                            label={t(
                              'Pages.Vouchers.Wizard.Labels.entitlement',
                            )}
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
                            options={
                              grant.entitlementType === 'BOOLEAN' ||
                              grant.entitlementType === 'CONFIG'
                                ? ['SET']
                                : [...MODIFIER_TYPES]
                            }
                          />
                        )}
                      </form.AppField>
                      {grant.entitlementType === 'BOOLEAN' ? (
                        <form.AppField name={`grants[${index}].booleanValue`}>
                          {(field) => (
                            <field.SwitchField
                              label={t('Pages.Vouchers.Wizard.Labels.value')}
                            />
                          )}
                        </form.AppField>
                      ) : grant.entitlementType === 'CONFIG' ? (
                        <form.AppField name={`grants[${index}].jsonValue`}>
                          {(field) => (
                            <field.JsonField
                              label={t('Pages.Vouchers.Wizard.Labels.value')}
                              description={t(
                                'Pages.Vouchers.Extensions.jsonObject',
                              )}
                            />
                          )}
                        </form.AppField>
                      ) : grant.modifierType === 'UNLIMITED' ? (
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
                    <BoostLicenseWarning
                      entitlementName={
                        names[grant.entitlementSlug] ?? grant.entitlementSlug
                      }
                      grant={grant}
                      licenses={licenseGrants.get(grant.entitlementSlug) ?? []}
                    />
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
