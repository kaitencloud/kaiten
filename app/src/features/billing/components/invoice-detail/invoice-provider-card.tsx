import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice, ProviderRecord } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { formatInstant, ProviderBadge } from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { ProviderLinks } from './provider-links';

type InvoiceProviderCardProps = {
  /** What the page gives the card in its grid: the columns it spans. */
  className?: string;
  invoice: Invoice;
};

const STATUS_TONES = {
  draft: 'outline',
  open: 'secondary',
  paid: 'success',
  uncollectible: 'outline',
  void: 'outline',
} as const satisfies Record<
  NonNullable<ProviderRecord['status']>,
  'outline' | 'secondary' | 'success'
>;

const isKnownStatus = (
  status: string,
): status is NonNullable<ProviderRecord['status']> =>
  Object.hasOwn(STATUS_TONES, status);

/** A value the provider coded, written as it is. */
const Code = ({ children }: { children: string }) => (
  <span className="font-mono break-all">{children}</span>
);

/**
 * Where an invoice stands in Stripe, the payment provider that collects it: its
 * status there, its number and identifiers, when it was pushed and last read back, how
 * the amounts compare, and the pages Stripe hosts for it. Every field is the provider's
 * record as the API mirrors it; nothing is worked out here. An invoice Stripe does not
 * have yet says so, whether the push has not run or has not worked. An invoice nobody
 * collects through a provider has no such card: it is absent, not empty.
 */
export function InvoiceProviderCard({
  className,
  invoice,
}: InvoiceProviderCardProps) {
  const { i18n, t } = useTranslation();
  const { provider } = invoice;
  const language = i18n.language;
  const base = 'Pages.Billing.Invoices.Detail.Provider';

  if (invoice.providerKind !== 'STRIPE') {
    return null;
  }
  // What the record says, field by field: a field the provider has not given is no row.
  const rows: Array<{ key: string; label: string; value: ReactNode }> = [];
  if (provider?.status) {
    rows.push({
      key: 'status',
      label: t(`${base}.status`),
      value: (
        <Badge
          data-provider-status={provider.status}
          variant={
            isKnownStatus(provider.status)
              ? STATUS_TONES[provider.status]
              : 'outline'
          }
        >
          {isKnownStatus(provider.status)
            ? t(`${base}.Status.${provider.status}`)
            : provider.status}
        </Badge>
      ),
    });
  }
  if (provider?.invoiceNumber) {
    rows.push({
      key: 'number',
      label: t(`${base}.number`),
      value: <Code>{provider.invoiceNumber}</Code>,
    });
  }
  if (provider?.externalInvoiceId) {
    rows.push({
      key: 'externalInvoice',
      label: t(`${base}.externalInvoice`),
      value: <Code>{provider.externalInvoiceId}</Code>,
    });
  }
  if (provider?.externalCustomerId) {
    rows.push({
      key: 'externalCustomer',
      label: t(`${base}.externalCustomer`),
      value: <Code>{provider.externalCustomerId}</Code>,
    });
  }
  if (provider?.pushedAt) {
    rows.push({
      key: 'pushedAt',
      label: t(`${base}.pushedAt`),
      value: formatInstant(provider.pushedAt, language),
    });
  }
  if (provider?.syncedAt) {
    rows.push({
      key: 'syncedAt',
      label: t(`${base}.syncedAt`),
      value: formatInstant(provider.syncedAt, language),
    });
  }
  if (provider?.reconciliationStatus) {
    rows.push({
      key: 'amounts',
      label: t(`${base}.amounts`),
      value: (
        <Badge
          data-reconciliation={provider.reconciliationStatus}
          variant={
            provider.reconciliationStatus === 'MATCHED'
              ? 'success'
              : 'destructive'
          }
        >
          {t(`${base}.Reconciliation.${provider.reconciliationStatus}`)}
        </Badge>
      ),
    });
  }

  return (
    <section className={className} data-testid="invoice-provider">
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title className="flex items-center gap-2 text-base">
            {t(`${base}.title`)}
            <ProviderBadge kind="STRIPE" />
          </DetailCard.Title>
          <DetailCard.Description>
            {t(`${base}.Collection.${invoice.collectionMethod}`)}
          </DetailCard.Description>
        </DetailCard.Header>
        <DetailCard.Content>
          {rows.length > 0 ? (
            <DetailCard.Rows>
              {rows.map(({ key, label, value }) => (
                <DetailCard.Row key={key} label={label} value={value} />
              ))}
            </DetailCard.Rows>
          ) : null}
          {/* A record with no invoice in it is a push that has not run, or has not worked. */}
          {provider?.externalInvoiceId ? null : (
            <p className="text-sm text-muted-foreground">
              {t(`${base}.notPushed`)}
            </p>
          )}
          {provider ? <ProviderLinks provider={provider} /> : null}
        </DetailCard.Content>
      </DetailCard>
    </section>
  );
}
