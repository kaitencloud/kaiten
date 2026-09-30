import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Customer } from '@/api-client';
import {
  createCustomerMutation,
  updateCustomerMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { startAttioSyncWatcher } from '@/domains/crm-sync';
import { invalidateCustomerQueries } from '@/domains/customer-management';

export function useCustomerFormMutations(customer?: Customer) {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  const createMutation = useMutation({
    ...createCustomerMutation(),
    onSuccess: async (createdCustomer) => {
      await invalidateCustomerQueries(queryClient);
      void startAttioSyncWatcher({
        queryClient,
        entityKind: 'customer',
        entitySlug: createdCustomer.slug ?? '',
        integrations: createdCustomer.integrations,
      });
      toast.success(t('Pages.Customers.Mutation.Form.createSuccess'));
    },
  });

  const updateMutation = useMutation({
    ...updateCustomerMutation({
      path: { customerSlug: customer?.slug ?? '' },
    }),
    onSuccess: async (_updatedCustomer, variables) => {
      const customerSlug = variables.path.customerSlug;
      const syncWatcher = startAttioSyncWatcher({
        queryClient,
        entityKind: 'customer',
        entitySlug: customerSlug,
        integrations: customer?.integrations,
        watchForChange: true,
      });
      await invalidateCustomerQueries(queryClient, customerSlug);
      void syncWatcher;
      toast.success(t('Pages.Customers.Mutation.Form.updateSuccess'));
    },
  });

  return {
    createMutation,
    updateMutation,
  };
}
