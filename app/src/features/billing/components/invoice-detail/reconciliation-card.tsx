import { useTranslation } from 'react-i18next';
import type { Invoice, Reconciliation } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatInstant, Money } from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';

type ReconciliationCardProps = {
  invoice: Invoice;
};

type DifferencesProps = {
  currency: string;
  detail: Reconciliation;
};

const base = 'Pages.Billing.Invoices.Detail.Reconciliation';

/**
 * The totals Kaiten and Stripe disagree on, as each states them. Where tax is included
 * in the amounts, Stripe's total excluding tax is not what was compared: its subtotal
 * less its discounts was, so those two figures are the ones shown.
 */
function Totals({ currency, detail }: DifferencesProps) {
  const { t } = useTranslation();
  const { providerSubtotal, providerTotalDiscount, providerTotalExcludingTax } =
    detail.totals;
  const comparedOnSubtotal = detail.inclusiveTax && providerSubtotal != null;

  return (
    <DetailCard.Rows>
      <DetailCard.Row
        label={t(`${base}.kaitenTotal`)}
        value={<Money amount={detail.totals.kaitenTotal} currency={currency} />}
      />
      {comparedOnSubtotal ? (
        <>
          <DetailCard.Row
            label={t(`${base}.providerSubtotal`)}
            value={<Money amount={providerSubtotal} currency={currency} />}
          />
          <DetailCard.Row
            label={t(`${base}.providerDiscounts`)}
            value={
              <Money amount={providerTotalDiscount ?? 0} currency={currency} />
            }
          />
        </>
      ) : (
        <DetailCard.Row
          label={t(`${base}.providerTotal`)}
          value={
            <Money amount={providerTotalExcludingTax} currency={currency} />
          }
        />
      )}
    </DetailCard.Rows>
  );
}

/** A table of what differs line by line: the amount Kaiten composed against the one Stripe holds. */
function AmountTable({
  caption,
  currency,
  rows,
}: {
  caption: string;
  currency: string;
  rows: Array<{ id: string; kaiten: number; label: string; provider: number }>;
}) {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{caption}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t(`${base}.line`)}</TableHead>
            <TableHead className="text-right">{t(`${base}.kaiten`)}</TableHead>
            <TableHead className="text-right">
              {t(`${base}.provider`)}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.label}</TableCell>
              <TableCell className="text-right">
                <Money amount={row.kaiten} currency={currency} />
              </TableCell>
              <TableCell className="text-right">
                <Money amount={row.provider} currency={currency} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/** A list of lines one side has and the other does not, by their identifiers. */
function Unmatched({ caption, ids }: { caption: string; ids: string[] }) {
  if (ids.length === 0) {
    return null;
  }

  return (
    <section className="space-y-1">
      <h3 className="text-sm font-medium">{caption}</h3>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        {ids.map((id) => (
          <li className="font-mono break-all" key={id}>
            {id}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * How what Kaiten composed compares with what Stripe holds, once the invoice is
 * there. A match says so in a line. A mismatch says what differs, in the API's own
 * terms and none of the console's: the two totals, the lines whose amount differs, the
 * lines either side has alone, the discounts Kaiten composed that Stripe applied with
 * another amount or not at all, and the discounts Stripe applied that Kaiten never
 * created, such as a coupon added in its dashboard. Nothing is added up or subtracted
 * here, and nothing is offered to fix it: the invoice in Stripe is the one customers
 * pay, and the difference is for a person to settle there.
 */
export function ReconciliationCard({ invoice }: ReconciliationCardProps) {
  const { i18n, t } = useTranslation();
  const record = invoice.provider;
  const detail = record?.reconciliationDetail;

  if (invoice.providerKind !== 'STRIPE' || !record?.reconciliationStatus) {
    return null;
  }
  const mismatched = record.reconciliationStatus === 'MISMATCH';

  return (
    <section data-testid="reconciliation">
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title className="flex items-center gap-2 text-base">
            {t(`${base}.title`)}
            <Badge
              data-reconciliation={record.reconciliationStatus}
              variant={mismatched ? 'destructive' : 'success'}
            >
              {t(
                `Pages.Billing.Invoices.Detail.Provider.Reconciliation.${record.reconciliationStatus}`,
              )}
            </Badge>
          </DetailCard.Title>
          <DetailCard.Description>
            {mismatched ? t(`${base}.mismatch`) : t(`${base}.matched`)}
            {record.reconciledAt
              ? ` ${t(`${base}.checked`, {
                  date: formatInstant(record.reconciledAt, i18n.language),
                })}`
              : ''}
          </DetailCard.Description>
        </DetailCard.Header>
        {mismatched && detail ? (
          <DetailCard.Content className="gap-5">
            <Totals currency={invoice.currency} detail={detail} />
            <AmountTable
              caption={t(`${base}.differingLines`)}
              currency={invoice.currency}
              rows={detail.lines.map((line) => ({
                id: line.lineId,
                kaiten: line.kaitenAmount,
                label: t(`${base}.lineNumber`, { seq: line.seq }),
                provider: line.providerAmount,
              }))}
            />
            <AmountTable
              caption={t(`${base}.differingDiscounts`)}
              currency={invoice.currency}
              rows={detail.discounts.map((discount) => ({
                id: `${discount.lineId}:${discount.targetSeq}:${discount.couponId}`,
                kaiten: discount.kaitenAmount,
                label: t(`${base}.discountOnLine`, {
                  seq: discount.seq,
                  target: discount.targetSeq,
                }),
                provider: discount.providerAmount,
              }))}
            />
            <Unmatched
              caption={t(`${base}.missingInProvider`)}
              ids={detail.missingInProvider}
            />
            <Unmatched
              caption={t(`${base}.extraInProvider`)}
              ids={detail.extraInProvider}
            />
            {detail.extraDiscounts.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">
                  {t(`${base}.extraDiscounts`)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(`${base}.extraDiscountsHint`)}
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t(`${base}.discount`)}</TableHead>
                      <TableHead>{t(`${base}.providerLine`)}</TableHead>
                      <TableHead className="text-right">
                        {t(`${base}.provider`)}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.extraDiscounts.map((discount) => (
                      <TableRow
                        key={`${discount.externalLineId}:${discount.discountId}`}
                      >
                        <TableCell className="font-mono break-all">
                          {discount.discountId}
                        </TableCell>
                        <TableCell className="font-mono break-all">
                          {discount.externalLineId}
                        </TableCell>
                        <TableCell className="text-right">
                          <Money
                            amount={discount.amount}
                            currency={invoice.currency}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            ) : null}
            {detail.inclusiveTax ? (
              <p className="text-sm text-muted-foreground">
                {t(`${base}.inclusiveTax`)}
              </p>
            ) : null}
          </DetailCard.Content>
        ) : null}
      </DetailCard>
    </section>
  );
}
