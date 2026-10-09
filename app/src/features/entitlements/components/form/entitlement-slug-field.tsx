import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { Input } from '@/components/ui/input';
import type { EntitlementFormValues } from './entitlement-form.shared';
import { getEntitlementSlugPreview } from './entitlement-slug.shared';

type EntitlementSlugFieldProps = {
  entitlement?: Entitlement;
  form: any;
};

/**
 * The slug of a new entitlement is optional. Left blank, the API generates it
 * from the name, so the placeholder and the description show what the name
 * typed so far would give. A slug typed here is sent as it is. The slug cannot
 * be renamed afterwards, so an existing entitlement only shows its own.
 */
export function EntitlementSlugField({
  entitlement,
  form,
}: EntitlementSlugFieldProps) {
  const { t } = useTranslation();

  if (entitlement) {
    return (
      <form.AppField name="slug">
        {() => (
          <FormField<string>
            label={t('Pages.Entitlements.Mutation.Form.Labels.slug')}
            description={t(
              'Pages.Entitlements.Mutation.Form.Descriptions.slugLocked',
            )}
            disabled
          >
            {() => (
              <FormControl>
                <Input value={entitlement.slug ?? ''} disabled readOnly />
              </FormControl>
            )}
          </FormField>
        )}
      </form.AppField>
    );
  }

  return (
    <form.Subscribe
      selector={(state: { values: EntitlementFormValues }) => ({
        name: state.values.name,
        slug: state.values.slug,
      })}
    >
      {({ name, slug }: Pick<EntitlementFormValues, 'name' | 'slug'>) => {
        const preview = getEntitlementSlugPreview(
          name,
          t('Pages.Entitlements.Mutation.Form.Placeholders.slug'),
        );

        return (
          <form.AppField name="slug">
            {(field: any) => (
              <field.TextField
                label={t('Pages.Entitlements.Mutation.Form.Labels.slug')}
                placeholder={preview.placeholder}
                description={
                  slug
                    ? t('Pages.Entitlements.Mutation.Form.Descriptions.slugSet')
                    : t(
                        'Pages.Entitlements.Mutation.Form.Descriptions.slugGenerated',
                        { example: preview.example },
                      )
                }
              />
            )}
          </form.AppField>
        );
      }}
    </form.Subscribe>
  );
}
