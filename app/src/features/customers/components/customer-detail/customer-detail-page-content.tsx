import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteCustomerMutation } from '@/api-client/@tanstack/react-query.gen';
import { AttioSyncCard, useAttioSyncCardVisible } from '@/domains/crm-sync';
import {
  forgetDeletedCustomerQueries,
  useInstancesWithRelations,
} from '@/domains/customer-management';
import { Page } from '@/functionals/page';
import { useCustomerBilling } from '../../hooks/use-customer-billing';
import { customerQueryOptions } from '../../queries/customer-query-options';
import { CustomerDetailHeader } from './customer-detail-header';
import { CustomerDetailsCard } from './customer-details-card';
import { CustomerInstancesCard } from './customer-instances-card';
import { CustomerInvoicesCard } from './customer-invoices-card';

type CustomerDetailPageContentProps = {
  children?: ReactNode;
  customerSlug: string;
};

export function CustomerDetailPageContent({
  children,
  customerSlug,
}: CustomerDetailPageContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { queryClient } = useRouteContext({ from: '__root__' });
  const { data: customer } = useSuspenseQuery(
    customerQueryOptions(customerSlug),
  );
  const isAttioSyncCardVisible = useAttioSyncCardVisible(
    {
      entityKind: 'customer',
      entitySlug: customerSlug,
    },
    customer.integrations,
  );
  const instancesQuery = useInstancesWithRelations();
  const { mayReadInvoices } = useCustomerBilling();

  const activeInstances = (instancesQuery.data?.instances?.items ?? []).filter(
    (instance) => instance.customer.slug === customerSlug,
  );

  const deleteMutation = useMutation({
    ...deleteCustomerMutation(),
    onSuccess: async () => {
      toast.success(t('Pages.Customers.Mutation.deleteSuccess'));
      // Leave before reconciling the cache. This route observes the customer
      // through useSuspenseQuery, so revalidating its detail query while still
      // mounted refetches a row DELETE has just removed, and navigate waits
      // behind three retries with backoff before it ever runs.
      await navigate({ to: '/customers' });
      await forgetDeletedCustomerQueries(queryClient, customerSlug);
    },
    onError: () => {
      toast.error(t('Common.deleteError'));
    },
  });

  return (
    <>
      <Page className="space-y-5">
        <CustomerDetailHeader
          customer={customer}
          hasActiveInstances={activeInstances.length > 0}
          isDeleting={deleteMutation.isPending}
          isInstancesLoading={
            instancesQuery.isPending || instancesQuery.isFetching
          }
          onDelete={() => {
            deleteMutation.mutate({ path: { customerSlug } });
          }}
        />

        <div
          className={
            isAttioSyncCardVisible
              ? 'grid items-start gap-5 lg:grid-cols-2'
              : undefined
          }
        >
          <CustomerDetailsCard customer={customer} />

          <AttioSyncCard
            entityKind="customer"
            entitySlug={customerSlug}
            integrations={customer.integrations}
            domain={customer.domain}
          />
        </div>

        <CustomerInstancesCard
          customerSlug={customerSlug}
          instances={activeInstances}
        />

        {mayReadInvoices ? (
          <CustomerInvoicesCard customerSlug={customerSlug} />
        ) : null}
      </Page>

      {children}
    </>
  );
}
