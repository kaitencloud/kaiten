import { useTranslation } from 'react-i18next';
import type { DueToday } from '@/api-client';
import { InvoiceLineTypeBadge, Money, ServicePeriod } from '@/domains/billing';

type CheckoutSessionLinesProps = { dueToday: DueToday };

/**
 * What the checkout asks for today: the lines the API composed, with the period each
 * covers, then the subtotal, the discount and the total, all of them fields of the API.
 */
export function CheckoutSessionLines({ dueToday }: CheckoutSessionLinesProps) {
  const { t } = useTranslation();
  const { currency } = dueToday;
  const prefix = 'Pages.Customers.CheckoutSessions.Drawer.DueToday';

  return (
    <div className="space-y-3" data-testid="checkout-session-due-today">
      {dueToday.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(`${prefix}.noLines`)}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {dueToday.lines.map((line) => (
            <li
              className="flex items-start justify-between gap-3 px-3 py-2"
              key={line.seq}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{line.label}</span>
                  <InvoiceLineTypeBadge type={line.type} />
                </div>
                {line.description ? (
                  <p className="text-xs text-muted-foreground">
                    {line.description}
                  </p>
                ) : null}
                <ServicePeriod
                  className="block text-xs text-muted-foreground"
                  from={line.serviceFrom}
                  to={line.serviceTo}
                />
              </div>
              <Money
                amount={line.amount}
                className="text-sm"
                currency={currency}
              />
            </li>
          ))}
        </ul>
      )}
      <dl className="space-y-1 text-sm">
        <TotalRow
          amount={dueToday.subtotal}
          currency={currency}
          label={t(`${prefix}.subtotal`)}
        />
        <TotalRow
          amount={dueToday.discountTotal}
          currency={currency}
          label={t(`${prefix}.discount`)}
        />
        <TotalRow
          amount={dueToday.total}
          bold
          currency={currency}
          label={t(`${prefix}.total`)}
        />
      </dl>
    </div>
  );
}

function TotalRow({
  amount,
  bold = false,
  currency,
  label,
}: {
  amount: number;
  bold?: boolean;
  currency: string;
  label: string;
}) {
  return (
    <div
      className={
        bold
          ? 'flex justify-between gap-3 border-t pt-1 font-medium'
          : 'flex justify-between gap-3 text-muted-foreground'
      }
    >
      <dt>{label}</dt>
      <dd>
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  );
}
