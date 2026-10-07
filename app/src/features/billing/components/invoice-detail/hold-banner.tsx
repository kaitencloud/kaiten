import { LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DataTable } from '@/functionals/table';
import { getCheckLabel, useHeldPairColumns } from './hold-banner-columns';

type HoldBannerProps = {
  invoice: Invoice;
};

/**
 * Why a draft is held, and what each way out does. After the period closes, the
 * usage journal of every metered meter is checked, and a draft whose journal fails
 * is composed but not issued, pushed or handed off: billing will not bill an amount
 * it cannot vouch for. The banner says the check in words, lists every meter that
 * failed with what was expected and found, and names the provider each action
 * works under, which differ once the subscription was switched: a release issues
 * the invoice under its own provider, a recompose under the subscription's
 * current one.
 */
export function HoldBanner({ invoice }: HoldBannerProps) {
  const { t } = useTranslation();
  const columns = useHeldPairColumns(invoice);
  const pairs = invoice.holdDetail?.pairs ?? [];
  const reason = invoice.holdReason ?? '';

  return (
    <Card
      className="border-destructive/40"
      data-hold-reason={reason}
      data-testid="hold-banner"
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <LockKeyhole
            aria-hidden
            className="size-5 text-destructive-subtle-foreground"
          />
          <CardTitle className="text-lg">
            {t('Pages.Billing.Invoices.Detail.Hold.title', {
              reason: getCheckLabel(reason, t),
            })}
          </CardTitle>
        </div>
        <CardDescription>
          {t('Pages.Billing.Invoices.Detail.Hold.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pairs.length > 0 ? (
          <DataTable
            columns={columns}
            data={pairs}
            getRowId={(pair) =>
              `${pair.instanceId}-${pair.entitlementId}-${pair.invariant}`
            }
            pagination={false}
            variant="simple"
          />
        ) : null}
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>
            {t('Pages.Billing.Invoices.Detail.Hold.release', {
              context: invoice.providerKind,
            })}
          </li>
          <li>{t('Pages.Billing.Invoices.Detail.Hold.recompose')}</li>
        </ul>
      </CardContent>
    </Card>
  );
}
