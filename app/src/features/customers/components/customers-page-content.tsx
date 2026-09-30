import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { RouteTabs } from '@/functionals/route-tabs';
import { dataModelIcons } from '@/lib/data-model-icons';
import { customersWithInstancesQueryOptions } from '@/domains/customer-management';
import { CustomersTable } from './customer-table';

export function CustomersPageContent({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { data: customers } = useSuspenseQuery(
    customersWithInstancesQueryOptions,
  );
  const CustomerIcon = dataModelIcons.customer;
  const tabs = [
    {
      id: 'customers',
      to: '/customers',
      label: t('Pages.Customers.Tabs.customers'),
    },
    {
      id: 'instances',
      to: '/customers/instances',
      label: t('Pages.Customers.Tabs.instances'),
    },
  ];

  return (
    <>
      <Page className="h-full min-h-0 overflow-hidden">
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <CustomerIcon className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{t('Pages.Customers.title')}</Page.Title>
              <Page.Subtitle>{t('Pages.Customers.subtitle')}</Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
        </Page.Header>
        <RouteTabs tabs={tabs} />
        <div className="flex-1 min-h-0">
          <CustomersTable customers={customers} />
        </div>
      </Page>

      {/* Dialog overlay */}
      {children}
    </>
  );
}
