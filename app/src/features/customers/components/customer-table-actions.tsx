import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteCustomerMutation } from '@/api-client/@tanstack/react-query.gen';
import { useDeletionRefusal } from '@/domains/billing';
import {
  TableActions,
  TableDeleteDialog,
  TableForbiddenDeleteButton,
} from '@/functionals/table';
import { forgetDeletedCustomerQueries } from '@/domains/customer-management';
import type { Customer } from '../types';

type CustomerTableActionsProps = {
  customer: Customer;
};

export const CustomerTableActions = ({
  customer,
}: CustomerTableActionsProps) => {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });
  // A customer that bills cannot be deleted: the dialog says what to settle first.
  const deletion = useDeletionRefusal(customer.slug);

  const deleteMutation = useMutation({
    ...deleteCustomerMutation(),
    onSuccess: async () => {
      toast.success(t('Pages.Customers.Mutation.deleteSuccess'));
      await forgetDeletedCustomerQueries(queryClient, customer.slug!);
    },
    onError: (error) => {
      if (!deletion.showRefusal(error)) {
        toast.error(t('Common.deleteError', 'Error deleting customer'));
      }
    },
  });

  const handleConfirm = async () => {
    deleteMutation.mutate({
      path: { customerSlug: customer.slug! },
    });
  };

  return (
    <TableActions>
      {customer.nbInstances > 0 ? (
        <TableForbiddenDeleteButton
          message={t('Pages.Customers.Table.warningDelete')}
        />
      ) : (
        <TableDeleteDialog name={customer.name} onConfirm={handleConfirm} />
      )}
      {deletion.dialog}
    </TableActions>
  );
};
