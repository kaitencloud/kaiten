import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { generateSlug } from '@/functionals/slug';

type CustomerFormFieldsProps = {
  form: any;
  isEditing?: boolean;
  /** Offered where billing exists: the address the invoices of the customer carry. */
  showBillingEmail?: boolean;
};

export const CustomerFormFields = ({
  form,
  isEditing = false,
  showBillingEmail = false,
}: CustomerFormFieldsProps) => {
  const { t } = useTranslation();

  return (
    <Suspense fallback={null}>
      <form.AppField name="name">
        {(field: any) => (
          <field.TextField
            label={t('Pages.Customers.Mutation.Form.Labels.name')}
            required
            placeholder={t('Pages.Customers.Mutation.Form.Placeholders.name')}
            description={t('Pages.Customers.Mutation.Form.Descriptions.name')}
            onChange={
              isEditing
                ? undefined
                : (value: string) =>
                    form.setFieldValue('slug', generateSlug(value))
            }
          />
        )}
      </form.AppField>

      <form.AppField name="slug">
        {(field: any) => (
          <field.TextField
            label={t('Pages.Customers.Mutation.Form.Labels.slug')}
            placeholder={t('Pages.Customers.Mutation.Form.Placeholders.slug')}
            description={t(
              isEditing
                ? 'Pages.Customers.Mutation.Form.Descriptions.slugLocked'
                : 'Pages.Customers.Mutation.Form.Descriptions.slug',
            )}
            disabled={isEditing}
          />
        )}
      </form.AppField>

      <form.AppField name="externalCustomerId">
        {(field: any) => (
          <field.TextField
            label={t('Pages.Customers.Mutation.Form.Labels.customId')}
            placeholder={t(
              'Pages.Customers.Mutation.Form.Placeholders.customId',
            )}
            description={t(
              'Pages.Customers.Mutation.Form.Descriptions.customId',
            )}
          />
        )}
      </form.AppField>

      <form.AppField name="domain">
        {(field: any) => (
          <field.TextField
            label={t('Pages.Customers.Mutation.Form.Labels.domain')}
            placeholder={t('Pages.Customers.Mutation.Form.Placeholders.domain')}
            description={t('Pages.Customers.Mutation.Form.Descriptions.domain')}
          />
        )}
      </form.AppField>

      {showBillingEmail ? (
        <form.AppField name="billingEmail">
          {(field: any) => (
            <field.TextField
              label={t('Pages.Customers.Mutation.Form.Labels.billingEmail')}
              placeholder={t(
                'Pages.Customers.Mutation.Form.Placeholders.billingEmail',
              )}
              description={t(
                'Pages.Customers.Mutation.Form.Descriptions.billingEmail',
              )}
            />
          )}
        </form.AppField>
      ) : null}
    </Suspense>
  );
};
