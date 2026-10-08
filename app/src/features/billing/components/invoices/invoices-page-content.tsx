import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  invoicesQueryOptions,
  useBillingCapabilities,
  useCanPerform,
} from '@/domains/billing';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { InvoiceScope } from '../../schemas/invoice-scope.schema';
import { InvoicesList } from './invoices-list';

type InvoicesPageContentProps = {
  /** Writes the scope to the URL, which the page follows. */
  onScopeChange: (scope: InvoiceScope) => void;
  /** The customer or the instance the URL scopes the list to. */
  scope: InvoiceScope;
};

/**
 * The invoices of the organization, across its customers and instances: what was
 * composed at each boundary, in what status, and where it stands in the handoff
 * queue. It is the view finance works from, and what makes a deployment with no
 * payment provider auditable. The route loads every invoice of the scope, like the
 * other list pages load theirs, and the list filters, sorts and pages them.
 */
export function InvoicesPageContent({
  onScopeChange,
  scope,
}: InvoicesPageContentProps) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(invoicesQueryOptions(scope));
  const { capabilities } = useBillingCapabilities();
  const canExport = useCanPerform('invoices.export');
  const InvoiceIcon = dataModelIcons.invoice;
  // With NoOp alone, who collects an invoice is never a question.
  const showProvider =
    capabilities?.providers.some(({ kind }) => kind === 'STRIPE') ?? false;

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <InvoiceIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Billing.Invoices.title')}</Page.Title>
            <Page.Subtitle>
              {t('Pages.Billing.Invoices.subtitle')}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div className="flex-1 min-h-0">
        <InvoicesList
          canExport={canExport}
          invoices={data.items}
          onScopeChange={onScopeChange}
          scope={scope}
          showProvider={showProvider}
        />
      </div>
    </Page>
  );
}
