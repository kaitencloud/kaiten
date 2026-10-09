import { ExternalLink, FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProviderRecord } from '@/api-client';
import { Button } from '@/components/ui/button';
import { getSafeProviderUrl } from '../../utils/provider-url';

type ProviderLinksProps = {
  provider: Pick<ProviderRecord, 'hostedInvoiceUrl' | 'invoicePdfUrl'>;
};

/**
 * The two pages Stripe hosts for an invoice, as links that leave the console: the
 * invoice a customer pays on, and its PDF. They open in a tab of their own with no
 * access to the console (`noopener noreferrer`), only when the address is https, and
 * are read from the API each time and kept nowhere. An invoice that has neither (a
 * draft Stripe has not finalized) shows no row at all.
 */
export function ProviderLinks({ provider }: ProviderLinksProps) {
  const { t } = useTranslation();
  const hosted = getSafeProviderUrl(provider.hostedInvoiceUrl);
  const pdf = getSafeProviderUrl(provider.invoicePdfUrl);

  if (!hosted && !pdf) {
    return null;
  }

  function renderLink(href: string, label: string, icon: 'hosted' | 'pdf') {
    const Icon = icon === 'hosted' ? ExternalLink : FileDown;

    return (
      <Button
        nativeButton={false}
        render={
          <a
            data-link={icon}
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon />
            {label}
          </a>
        }
        role="link"
        size="sm"
        variant="outline"
      />
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="invoice-provider-links"
    >
      {hosted
        ? renderLink(
            hosted,
            t('Pages.Billing.Invoices.Detail.Provider.hostedInvoice'),
            'hosted',
          )
        : null}
      {pdf
        ? renderLink(
            pdf,
            t('Pages.Billing.Invoices.Detail.Provider.pdf'),
            'pdf',
          )
        : null}
    </div>
  );
}
