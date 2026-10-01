import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { DatabaseZap, Server } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { RouteTabs } from '@/functionals/route-tabs';
import { useInstancesWithRelations } from '@/domains/customer-management';
import { InstancesTable } from './instance-table';

export function InstancesPageContent({ children }: { children?: ReactNode }) {
  const { data } = useInstancesWithRelations();
  const instances = data?.instances?.items ?? [];
  const { t } = useTranslation();
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
              <Server className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{t('Pages.Customers.Instances.title')}</Page.Title>
              <Page.Subtitle>
                {t('Pages.Customers.Instances.subtitle')}
              </Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
          <Page.Actions>
            <Button
              variant="outline"
              nativeButton={false}
              role="link"
              render={
                <Link
                  to="/settings/metadata"
                  search={{ resourceType: 'INSTANCE' }}
                >
                  <DatabaseZap className="size-4" />
                  {t(
                    'Pages.Settings.Metadata.configureFieldsButton',
                    'Configure metadata fields',
                  )}
                </Link>
              }
            />
          </Page.Actions>
        </Page.Header>
        <RouteTabs tabs={tabs} />
        <div className="flex-1 min-h-0">
          <InstancesTable instances={instances} />
        </div>
      </Page>

      {/* Dialog overlay */}
      {children}
    </>
  );
}
