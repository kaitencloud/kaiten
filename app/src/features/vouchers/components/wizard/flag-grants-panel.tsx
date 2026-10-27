import { useStore } from '@tanstack/react-form';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormField from '@/components/form/fields/form-field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RetryableProblem, useGrantedScopes } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { hasScope } from '@/lib/granted-scopes';
import type { VoucherReferences } from '../../hooks/use-voucher-references';
import { newFlagGrant, voucherFormOpts } from '../../schemas';

export const FlagGrantsPanel = withForm({
  ...voucherFormOpts,
  props: {} as { flags: VoucherReferences['flags'] },
  render: function FlagGrantsPanelRender({ flags, form }) {
    const { t } = useTranslation();
    const grants = useStore(form.store, (state) => state.values.flagGrants);
    const items = flags.data?.items ?? [];
    const access = useGrantedScopes();
    if (
      access.isPending ||
      (flags.isPending && hasScope(access.scopes, 'read:feature_flags'))
    )
      return (
        <Skeleton
          className="h-20"
          aria-label={t('Pages.Vouchers.Extensions.flagsLoading')}
        />
      );
    if (!hasScope(access.scopes, 'read:feature_flags'))
      return (
        <p role="status">{t('Pages.Vouchers.Extensions.flagsReadRequired')}</p>
      );
    if (flags.isError)
      return (
        <RetryableProblem
          error={flags.error}
          onRetry={() => void flags.refetch()}
        />
      );

    function renderGrant(grant: (typeof grants)[number], index: number) {
      const variants =
        items.find((flag) => flag.slug === grant.flagSlug)?.variants ?? [];
      return (
        <div
          key={grant.key}
          className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"
          data-testid="voucher-flag-row"
        >
          <form.AppField
            name={`flagGrants[${index}].flagSlug`}
            listeners={{
              onChange: () =>
                form.setFieldValue(`flagGrants[${index}].variant`, ''),
            }}
          >
            {(field) => (
              <field.SelectField
                label={t('Pages.Vouchers.Extensions.flag')}
                options={items.map((flag) => flag.slug ?? '')}
                getOptionLabel={(slug) =>
                  items.find((flag) => flag.slug === slug)?.name ?? String(slug)
                }
                required
              />
            )}
          </form.AppField>
          <form.AppField name={`flagGrants[${index}].variant`}>
            {(field) => (
              <field.SelectField
                label={t('Pages.Vouchers.Extensions.variant')}
                options={variants.map((variant) => variant.name)}
                getOptionLabel={String}
                required
              />
            )}
          </form.AppField>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-6"
            aria-label={t('Pages.Vouchers.Extensions.removeFlag', {
              position: index + 1,
            })}
            onClick={() => form.removeFieldValue('flagGrants', index)}
          >
            <Trash2 />
          </Button>
        </div>
      );
    }

    return (
      <form.AppField name="flagGrants" mode="array">
        {(field) => (
          <FormField
            label={t('Pages.Vouchers.Extensions.flags')}
            description={t('Pages.Vouchers.Extensions.flagDetail')}
            required
          >
            {() => (
              <div className="space-y-3">
                {grants.map(renderGrant)}
                {items.length === 0 && (
                  <p>{t('Pages.Vouchers.Extensions.flagsEmpty')}</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={flags.isPending || items.length === 0}
                  onClick={() => field.pushValue(newFlagGrant())}
                >
                  <Plus />
                  {t('Pages.Vouchers.Extensions.addFlag')}
                </Button>
              </div>
            )}
          </FormField>
        )}
      </form.AppField>
    );
  },
});
