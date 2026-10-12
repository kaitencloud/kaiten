import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaymentMethodLabels } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { getPaymentMethodStanding } from '@/domains/billing';

type PaymentMethodSummaryProps = {
  method: PaymentMethodLabels | null;
};

const base = 'Pages.Customers.Detail.paymentMethod';

/** The brand written as a name: Stripe codes it in lower case (`visa`, `mastercard`). */
const brandName = (brand: string) =>
  brand.charAt(0).toUpperCase() + brand.slice(1);

/**
 * What Stripe holds as the payment method of the customer, as labels: the brand and
 * the last four digits, when it expires, and where it stands (charged by Stripe, soon to
 * expire, expired, or one a charge said can no longer be used). Kaiten keeps nothing more
 * of a card, and shows nothing more.
 */
export function PaymentMethodSummary({ method }: PaymentMethodSummaryProps) {
  const { t } = useTranslation();
  const standing = getPaymentMethodStanding(method);

  if (!method || standing.kind === 'none') {
    return (
      <div
        className="space-y-1"
        data-standing="none"
        data-testid="payment-method"
      >
        <p className="text-sm font-medium">{t(`${base}.None.title`)}</p>
        <p className="text-sm text-muted-foreground">
          {t(`${base}.None.description`)}
        </p>
      </div>
    );
  }
  const unusable = standing.kind === 'expired' || standing.kind === 'failed';

  return (
    <div
      className="space-y-2"
      data-standing={standing.kind}
      data-testid="payment-method"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {method.brand
            ? t(`${base}.Card.brandAndLast4`, {
                brand: brandName(method.brand),
                last4: method.last4 ?? '••••',
              })
            : t(`${base}.Card.last4Only`, { last4: method.last4 ?? '••••' })}
        </span>
        {unusable ? (
          <Badge variant="destructive">
            {t(`${base}.Status.${standing.kind}`)}
          </Badge>
        ) : (
          <Badge variant="success">{t(`${base}.Status.active`)}</Badge>
        )}
        {standing.kind === 'active' && standing.expiresSoon ? (
          <Badge variant="outline">{t(`${base}.Status.expiresSoon`)}</Badge>
        ) : null}
      </div>
      {method.expMonth !== undefined && method.expYear !== undefined ? (
        <p className="text-sm text-muted-foreground">
          {t(`${base}.Card.expires`, {
            month: String(method.expMonth).padStart(2, '0'),
            year: method.expYear,
          })}
        </p>
      ) : null}
      {unusable ? (
        <p className="flex items-start gap-2 text-sm text-destructive-subtle-foreground">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{t(`${base}.Unusable.${standing.kind}`)}</span>
        </p>
      ) : null}
    </div>
  );
}
