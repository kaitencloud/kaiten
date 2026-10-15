import { useTranslation } from 'react-i18next';
import type { DueDateDifference, Reconciliation } from '@/api-client';
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
 * The due date Stripe gave an invoice that is sent for payment, when it is not the one
 * Kaiten issued it with. Kaiten counts a late payment from its own date, so the card
 * says so rather than leaving the two to be read as one.
 */
function DueDate({ difference }: { difference: DueDateDifference }) {
  const { i18n, t } = useTranslation();

  return (
    <section className="space-y-2" data-testid="reconciliation-due-date">
      <h3 className="text-sm font-medium">{t(`${base}.differingDueDate`)}</h3>
      <p className="text-sm text-muted-foreground">
        {t(`${base}.dueDateHint`)}
      </p>
      <DetailCard.Rows>
        <DetailCard.Row
          label={t(`${base}.kaitenDueAt`)}
          value={formatInstant(difference.kaitenDueAt, i18n.language)}
        />
        <DetailCard.Row
          label={t(`${base}.providerDueAt`)}
          value={formatInstant(difference.providerDueAt, i18n.language)}
        />
      </DetailCard.Rows>
    </section>
  );
}

/** The discounts Stripe applied that Kaiten did not create, by their identifiers and what they took off. */
function ExtraDiscounts({
  currency,
  discounts,
}: {
  currency: string;
  discounts: Reconciliation['extraDiscounts'];
}) {
  const { t } = useTranslation();

  if (discounts.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{t(`${base}.extraDiscounts`)}</h3>
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
          {discounts.map((discount) => (
            <TableRow key={`${discount.externalLineId}:${discount.discountId}`}>
              <TableCell className="font-mono break-all">
                {discount.discountId}
              </TableCell>
              <TableCell className="font-mono break-all">
                {discount.externalLineId}
              </TableCell>
              <TableCell className="text-right">
                <Money amount={discount.amount} currency={currency} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/**
 * Everything that differs between what Kaiten composed and what Stripe holds, in the
 * API's own terms: the totals, the lines and discounts whose amount differs, the lines
 * either side has alone, the discounts Stripe applied that Kaiten never created, and the
 * due date. Only what differs is listed.
 */
export function Differences({ currency, detail }: DifferencesProps) {
  const { t } = useTranslation();

  return (
    <>
      <Totals currency={currency} detail={detail} />
      <AmountTable
        caption={t(`${base}.differingLines`)}
        currency={currency}
        rows={detail.lines.map((line) => ({
          id: line.lineId,
          kaiten: line.kaitenAmount,
          label: t(`${base}.lineNumber`, { seq: line.seq }),
          provider: line.providerAmount,
        }))}
      />
      <AmountTable
        caption={t(`${base}.differingDiscounts`)}
        currency={currency}
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
      <ExtraDiscounts currency={currency} discounts={detail.extraDiscounts} />
      {detail.dueDate ? <DueDate difference={detail.dueDate} /> : null}
      {detail.inclusiveTax ? (
        <p className="text-sm text-muted-foreground">
          {t(`${base}.inclusiveTax`)}
        </p>
      ) : null}
    </>
  );
}
