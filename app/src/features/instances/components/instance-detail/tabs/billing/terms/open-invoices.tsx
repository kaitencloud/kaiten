import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { InvoiceSummary } from '@/api-client';
import { getInvoiceOptions } from '@/api-client/@tanstack/react-query.gen';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatUtcDate,
  getInvoiceKindLabelKey,
  type InvoiceProviderKind,
  InvoiceStatusBadge,
  isAwaitingFinalization,
  ProviderBadge,
  RetryableProblem,
} from '@/domains/billing';
import { instanceInvoicesQueryOptions } from '../../../../../queries';
import {
  getOpenInvoiceFate,
  getOpenInvoiceMove,
  isOpenInvoice,
  needsProviderRecord,
} from '../../../../../utils/provider-switch';

const base = 'Pages.Customers.Instances.Detail.Billing.Terms.Switch';

type OpenInvoiceRowProps = {
  invoice: InvoiceSummary;
  target: InvoiceProviderKind;
};

/**
 * One open invoice and what becomes of it. Most of it is told by the summary the
 * list gives; a draft Stripe collects that is not held is either in the push queue or in
 * Stripe waiting for a person, and only the record of the provider on the invoice says
 * which, so that one is read in full.
 */
function OpenInvoiceRow({ invoice, target }: OpenInvoiceRowProps) {
  const { i18n, t } = useTranslation();
  const needsRecord = needsProviderRecord(invoice);
  const full = useQuery({
    ...getInvoiceOptions({ path: { invoiceId: invoice.id } }),
    enabled: needsRecord,
    retry: false,
  });
  const awaiting = Boolean(full.data && isAwaitingFinalization(full.data));
  const fate = getOpenInvoiceFate(invoice, awaiting);
  const move = getOpenInvoiceMove(fate, invoice.providerKind, target);

  return (
    <li
      className="space-y-1 rounded-md border p-3"
      data-fate={fate}
      data-testid="open-invoice"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          className="font-medium underline underline-offset-4"
          params={{ invoiceId: invoice.id }}
          to="/billing/invoices/$invoiceId"
        >
          {t(getInvoiceKindLabelKey(invoice.kind))} ·{' '}
          {formatUtcDate(invoice.boundaryAt, i18n.language)}
        </Link>
        <InvoiceStatusBadge invoice={invoice} />
        <ProviderBadge kind={invoice.providerKind} />
      </div>
      {needsRecord && full.isPending ? (
        <Skeleton className="h-4 w-2/3" />
      ) : (
        <>
          <p className="text-sm">{t(`${base}.Fate.${fate}`)}</p>
          {move === 'none' ? null : (
            <p className="text-sm text-muted-foreground">
              {t(`${base}.Move.${move}`)}
            </p>
          )}
        </>
      )}
    </li>
  );
}

type OpenInvoicesProps = {
  instanceSlug: string;
  /** The provider the contract is going to: where an invoice would have to move to. */
  target: InvoiceProviderKind;
};

/**
 * The invoices of the contract that are not settled, with what becomes of each when
 * the contract moves to another provider. The change applies from the next invoice
 * composed: every invoice keeps its own provider, collection method, terms and
 * identifiers, and retrying, voiding, reading back and reconciling it go to the provider
 * that issued it. The consequence is told from the status, the provider and the hold of
 * each (`getOpenInvoiceFate`), and so is the way to move one if that is wanted.
 */
export function OpenInvoices({ instanceSlug, target }: OpenInvoicesProps) {
  const { t } = useTranslation();
  const query = useQuery(instanceInvoicesQueryOptions(instanceSlug));

  if (query.isError) {
    return (
      <RetryableProblem
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const open = query.data?.items.filter(isOpenInvoice) ?? [];

  return (
    <section className="space-y-2" data-testid="open-invoices">
      <h3 className="text-sm font-medium">{t(`${base}.title`)}</h3>
      <p className="text-sm text-muted-foreground">
        {t(`${base}.description`)}
      </p>
      {query.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : open.length === 0 ? (
        <p className="text-sm" data-testid="open-invoices-empty">
          {t(`${base}.empty`)}
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((invoice) => (
            <OpenInvoiceRow
              invoice={invoice}
              key={invoice.id}
              target={target}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
