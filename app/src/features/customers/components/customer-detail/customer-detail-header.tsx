import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Customer } from '@/api-client';
import { DestructiveActionButton } from '@/components/destructive-action-button';
import { useCanPerform } from '@/domains/billing';
import { EditableTitle, Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { getCustomerDetailTarget } from '../../utils/customer-path';
import { useCustomerFormMutations } from '../customer-form.mutations';
import {
  customerFormValuesToUpdateBody,
  customerToFormValues,
} from '../customer-form.shared';

type CustomerDetailHeaderProps = {
  customer: Customer;
  hasActiveInstances: boolean;
  isDeleting: boolean;
  isInstancesLoading: boolean;
  onDelete: () => void;
};

export const CustomerDetailHeader = ({
  customer,
  hasActiveInstances,
  isDeleting,
  isInstancesLoading,
  onDelete,
}: CustomerDetailHeaderProps) => {
  const { t } = useTranslation();
  const { updateMutation } = useCustomerFormMutations(customer);
  const mayUpdate = useCanPerform('customers.update');
  const mayDelete = useCanPerform('customers.delete');

  const handleRename = async (name: string) => {
    const values = customerToFormValues(customer);
    await updateMutation.mutateAsync({
      customerSlug: customer.slug!,
      edited: customerFormValuesToUpdateBody({ ...values, name }),
      opened: customerFormValuesToUpdateBody(values),
    });
  };

  return (
    <Page.Header>
      <Page.IconHeading
        icon={dataModelIcons.customer}
        title={
          <EditableTitle
            value={customer.name}
            onSave={handleRename}
            label={t('Pages.Customers.Detail.editName', 'Edit name')}
            disabled={!mayUpdate}
          />
        }
        size="xl"
      />

      <Page.Actions>
        <div className="flex items-center gap-2">
          {mayUpdate ? (
            <Button
              variant="outline"
              className="gap-2"
              nativeButton={false}
              role="link"
              render={
                <Link
                  {...getCustomerDetailTarget(customer.slug!)}
                  search={{ mode: 'configure' }}
                >
                  <Pencil className="size-4" />
                  {t('Common.edit')}
                </Link>
              }
            />
          ) : null}
          {mayDelete ? (
            <DestructiveActionButton
              label={t('Common.delete')}
              title={t('Common.confirmDeleteTitle')}
              description={t('Common.confirmDeleteDescription', {
                name: customer.name,
              })}
              cancelLabel={t('Common.cancel')}
              confirmLabel={t('Common.confirm')}
              onConfirm={onDelete}
              disabled={isDeleting || isInstancesLoading || hasActiveInstances}
              // The same explanation as the customers list's delete action.
              disabledReason={
                hasActiveInstances
                  ? t('Pages.Customers.Table.warningDelete')
                  : undefined
              }
            />
          ) : null}
        </div>
      </Page.Actions>
    </Page.Header>
  );
};
