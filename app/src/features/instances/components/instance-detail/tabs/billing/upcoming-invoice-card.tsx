import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvoicePreview } from '@/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatBoundary,
  formatInstant,
  getInvoiceKindLabelKey,
  InvoicePreviewDialog,
  InvoicePreviewResult,
  Money,
  RetryableProblem,
  ServicePeriod,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { dataModelIcons } from '@/lib/data-model-icons';
import { upcomingInvoiceQueryOptions } from '../../../../queries';
import { WouldHoldBanner } from './would-hold-banner';

const InvoiceIcon = dataModelIcons.invoice;

/** What the next invoice is: its kind, when it is issued, the period it bills, how many lines it has and what it comes to. */
function UpcomingInvoiceRows({ preview }: { preview: InvoicePreview }) {
  const { i18n, t } = useTranslation();

  return (
    <DetailCard.Rows>
      <DetailCard.Row
        label={t('Pages.Customers.Instances.Detail.Billing.Upcoming.kind')}
        value={t(getInvoiceKindLabelKey(preview.kind))}
      />
      <DetailCard.Row
        label={t('Pages.Customers.Instances.Detail.Billing.Upcoming.issuedAt')}
        value={formatBoundary(preview.boundaryAt, i18n.language)}
      />
      {preview.serviceFrom && preview.serviceTo ? (
        <DetailCard.Row
          label={t('Pages.Customers.Instances.Detail.Billing.Upcoming.period')}
          value={
            <ServicePeriod from={preview.serviceFrom} to={preview.serviceTo} />
          }
        />
      ) : null}
      <DetailCard.Row
        label={t('Pages.Customers.Instances.Detail.Billing.Upcoming.lines')}
        value={t(
          'Pages.Customers.Instances.Detail.Billing.Upcoming.lineCount',
          { count: preview.lines.length },
        )}
      />
      <DetailCard.Row
        label={t('Pages.Customers.Instances.Detail.Billing.Upcoming.total')}
        value={<Money amount={preview.total} currency={preview.currency} />}
      />
    </DetailCard.Rows>
  );
}

function UpcomingInvoiceBody({
  instanceSlug,
  preview,
}: {
  instanceSlug: string;
  preview: InvoicePreview;
}) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title>
            {t('Pages.Customers.Instances.Detail.Billing.Upcoming.title')}
          </DetailCard.Title>
          <DetailCard.Description>
            {t('Pages.Customers.Instances.Detail.Billing.Upcoming.description')}
          </DetailCard.Description>
          <DetailCard.Action>
            <Button
              onClick={() => setOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <InvoiceIcon className="size-4" />
              {t('Pages.Customers.Instances.Detail.Billing.Upcoming.view')}
            </Button>
          </DetailCard.Action>
        </DetailCard.Header>
        <DetailCard.Content>
          <WouldHoldBanner
            instanceSlug={instanceSlug}
            wouldHold={preview.wouldHold}
          />
          <UpcomingInvoiceRows preview={preview} />
          <p className="text-xs text-muted-foreground">
            {t('Pages.Customers.Instances.Detail.Billing.Upcoming.asOf', {
              date: formatInstant(preview.asOf, i18n.language),
            })}
          </p>
        </DetailCard.Content>
      </DetailCard>
      {open ? (
        <InvoicePreviewDialog
          description={t(
            'Pages.Customers.Instances.Detail.Billing.Upcoming.dialogDescription',
          )}
          onOpenChange={setOpen}
          open
          title={t(
            'Pages.Customers.Instances.Detail.Billing.Upcoming.dialogTitle',
          )}
        >
          <InvoicePreviewResult preview={preview} />
        </InvoicePreviewDialog>
      ) : null}
    </>
  );
}

type UpcomingInvoiceCardProps = {
  instanceSlug: string;
};

/**
 * The invoice the next boundary of the subscription will issue, composed by the
 * API from the usage so far: when it is issued, what it comes to, and, if the
 * usage journal of a meter fails a check, that it would be held. The lines are
 * one click away in the preview dialog; nothing here is saved or billed. Usage
 * that is no longer kept, or any other refusal, is shown in the API's words with
 * a way to ask again, and the rest of the tab stays.
 */
export function UpcomingInvoiceCard({
  instanceSlug,
}: UpcomingInvoiceCardProps) {
  const { t } = useTranslation();
  const query = useQuery(upcomingInvoiceQueryOptions(instanceSlug));

  if (query.isPending) {
    return (
      <div
        aria-busy="true"
        aria-label={t(
          'Pages.Customers.Instances.Detail.Billing.Upcoming.loading',
        )}
        role="status"
      >
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <RetryableProblem
        data-testid="upcoming-invoice-error"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  // A subscription that ended, or one the API does not know, has no next invoice.
  if (!query.data) {
    return null;
  }

  return (
    <UpcomingInvoiceBody instanceSlug={instanceSlug} preview={query.data} />
  );
}
