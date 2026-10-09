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
 * record as the API mirrors it; nothing is worked out here. An invoice nobody collects
 * through a provider has no such card: it is absent, not empty.
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
          {provider ? (
            <DetailCard.Rows>
              {provider.status ? (
                <DetailCard.Row
                  label={t(`${base}.status`)}
                  value={
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
                  }
                />
              ) : null}
              {provider.invoiceNumber ? (
                <DetailCard.Row
                  label={t(`${base}.number`)}
                  value={<Code>{provider.invoiceNumber}</Code>}
                />
              ) : null}
              {provider.externalInvoiceId ? (
                <DetailCard.Row
                  label={t(`${base}.externalInvoice`)}
                  value={<Code>{provider.externalInvoiceId}</Code>}
                />
              ) : null}
              {provider.externalCustomerId ? (
                <DetailCard.Row
                  label={t(`${base}.externalCustomer`)}
                  value={<Code>{provider.externalCustomerId}</Code>}
                />
              ) : null}
              {provider.pushedAt ? (
                <DetailCard.Row
                  label={t(`${base}.pushedAt`)}
                  value={formatInstant(provider.pushedAt, language)}
                />
              ) : null}
              {provider.syncedAt ? (
                <DetailCard.Row
                  label={t(`${base}.syncedAt`)}
                  value={formatInstant(provider.syncedAt, language)}
                />
              ) : null}
              {provider.reconciliationStatus ? (
                <DetailCard.Row
                  label={t(`${base}.amounts`)}
                  value={
                    <Badge
                      data-reconciliation={provider.reconciliationStatus}
                      variant={
                        provider.reconciliationStatus === 'MATCHED'
                          ? 'success'
                          : 'destructive'
                      }
                    >
                      {t(
                        `${base}.Reconciliation.${provider.reconciliationStatus}`,
                      )}
                    </Badge>
                  }
                />
              ) : null}
            </DetailCard.Rows>
          ) : (
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
