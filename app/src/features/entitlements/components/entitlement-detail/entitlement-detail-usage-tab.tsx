import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { UsageMeter, UsageStatusBadge } from '@/domains/entitlement-usage';
import { RiskRankingListCard } from '@/functionals/risk-ranking-list-card';
import { formatUsageWindowBound } from '@/lib/detail';
import { type ColumnDef, TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { cn } from '@/lib/utils';
import { EntitlementDetailCoverageCard } from './entitlement-detail-coverage-card';
import { UsageThresholdCell } from './entitlement-detail-usage-threshold-cell';
import {
  entitlementSaturationBuckets,
  formatUsageRatio,
  useEntitlementDetailContext,
} from './entitlement-detail-context';

type AtRiskInstanceRow = ReturnType<
  typeof useEntitlementDetailContext
>['atRiskInstances'][number];

const useAtRiskColumns = (locale: string) => {
  const { t } = useTranslation();

  return useMemo<ColumnDef<AtRiskInstanceRow>[]>(
    () => [
      {
        accessorKey: 'instanceName',
        header: t(
          'Pages.Entitlements.Detail.Usage.atRiskInstances.columns.instance',
          'Instance',
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.instanceName}</span>
        ),
      },
      {
        accessorKey: 'customerName',
        header: t(
          'Pages.Entitlements.Detail.Usage.atRiskInstances.columns.customer',
          'Customer',
        ),
      },
      {
        accessorKey: 'licenseName',
        header: t(
          'Pages.Entitlements.Detail.Usage.atRiskInstances.columns.license',
          'License',
        ),
      },
      {
        accessorKey: 'value',
        header: t(
          'Pages.Entitlements.Detail.Usage.atRiskInstances.columns.usage',
          'Usage',
        ),
        cell: ({ row }) => row.original.value.toLocaleString(locale),
      },
      {
        accessorKey: 'threshold',
        header: t(
          'Pages.Entitlements.Detail.Usage.atRiskInstances.columns.threshold',
          'Threshold',
        ),
        cell: ({ row }) => (
          <UsageThresholdCell locale={locale} t={t} usage={row.original} />
        ),
      },
      {
        accessorKey: 'currentPeriodStart',
        header: t(
          'Pages.Entitlements.Detail.Usage.atRiskInstances.columns.currentPeriod',
          'Current window',
        ),
        // Each instance gets its own window when the entitlement anchors on
        // LICENSE_START, which is why this is a per-row value and not a
        // caption on the card.
        cell: ({ row }) => {
          const { currentPeriodStart, currentPeriodEnd } = row.original;

          if (!currentPeriodStart || !currentPeriodEnd) {
            return (
              <span className="text-muted-foreground">
                {t(
                  'Pages.Entitlements.Detail.Usage.atRiskInstances.lifetime',
                  'Lifetime',
                )}
              </span>
            );
          }

          return (
            <span className="whitespace-nowrap text-muted-foreground text-xs">
              {`${formatUsageWindowBound(currentPeriodStart, locale)} → ${formatUsageWindowBound(currentPeriodEnd, locale)}`}
            </span>
          );
        },
      },
      {
        accessorKey: 'ratio',
        header: t(
          'Pages.Entitlements.Detail.Usage.atRiskInstances.columns.saturation',
          'Saturation',
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <UsageMeter
              className="w-16"
              limitCapExceededOveragePercent={
                row.original.limitCapExceededOveragePercent
              }
              size="sm"
              threshold={row.original.threshold}
              value={row.original.value}
            />
            <span>{formatUsageRatio(row.original.ratio, locale)}</span>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: t(
          'Pages.Entitlements.Detail.Usage.atRiskInstances.columns.status',
          'Status',
        ),
        cell: ({ row }) => <UsageStatusBadge status={row.original.status} />,
      },
    ],
    [locale, t],
  );
};

function SaturationBucketsCard({
  isUsageLoading,
  locale,
  saturationBuckets,
}: Pick<
  ReturnType<typeof useEntitlementDetailContext>,
  'isUsageLoading' | 'saturationBuckets'
> & {
  locale: string;
}) {
  const { t } = useTranslation();
  const maxBucketValue = Math.max(...Object.values(saturationBuckets), 1);

  const renderBucketRow = (
    bucket: (typeof entitlementSaturationBuckets)[number],
  ) => {
    const value = saturationBuckets[bucket.key];
    const width = (value / maxBucketValue) * 100;

    return (
      <div key={bucket.key} className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span>{bucket.label}</span>
          <span className="font-medium">{value.toLocaleString(locale)}</span>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div
            className={cn('h-2 rounded-full', bucket.colorClassName)}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t(
            'Pages.Entitlements.Detail.Usage.saturationBuckets.title',
            'Saturation Buckets',
          )}
        </CardTitle>
        <CardDescription>
          {t(
            'Pages.Entitlements.Detail.Usage.saturationBuckets.description',
            'Global distribution of instance saturation for this entitlement.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isUsageLoading ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Entitlements.Detail.loading', 'Loading...')}
          </p>
        ) : (
          entitlementSaturationBuckets.map(renderBucketRow)
        )}
      </CardContent>
    </Card>
  );
}

function TopRiskLicensesCard({
  isUsageLoading,
  locale,
  topRiskLicenses,
}: Pick<
  ReturnType<typeof useEntitlementDetailContext>,
  'isUsageLoading' | 'topRiskLicenses'
> & {
  locale: string;
}) {
  const { t } = useTranslation();

  return (
    <RiskRankingListCard
      title={t(
        'Pages.Entitlements.Detail.Usage.topRiskLicenses.title',
        'Top At-risk Licenses',
      )}
      description={t(
        'Pages.Entitlements.Detail.Usage.topRiskLicenses.description',
        'Licenses ranked by highest observed usage ratio.',
      )}
      isLoading={isUsageLoading}
      loadingLabel={t('Pages.Entitlements.Detail.loading', 'Loading...')}
      emptyLabel={t(
        'Pages.Entitlements.Detail.Usage.topRiskLicenses.empty',
        'No at-risk licenses detected.',
      )}
      items={topRiskLicenses}
      getKey={(license) => license.licenseSlug}
      getLabel={(license) => license.licenseName}
      getRatio={(license) => license.maxRatio}
      formatRatio={(ratio) => formatUsageRatio(ratio, locale)}
      renderMeta={(license) => (
        <>
          {license.instances.toLocaleString(locale)}{' '}
          {t('Pages.Entitlements.Detail.Usage.topRiskLicenses.instances', {
            count: license.instances,
          })}
        </>
      )}
    />
  );
}

export function EntitlementDetailUsageTab() {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const InstanceIcon = dataModelIcons.instance;
  const {
    atRiskInstances,
    isLoading,
    isUsageLoading,
    metrics,
    saturationBuckets,
    topRiskLicenses,
  } = useEntitlementDetailContext();
  const atRiskColumns = useAtRiskColumns(locale);
  // Saturation is measured against a cap. Until a linked license sets one,
  // the gauges could only show zeros, so a sentence takes their place.
  const showSaturation = isLoading || metrics.limitedMappings > 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      {showSaturation ? (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <SaturationBucketsCard
            isUsageLoading={isUsageLoading}
            locale={locale}
            saturationBuckets={saturationBuckets}
          />
          <TopRiskLicensesCard
            isUsageLoading={isUsageLoading}
            locale={locale}
            topRiskLicenses={topRiskLicenses}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(
            'Pages.Entitlements.Detail.Usage.noCaps',
            'No linked license caps this entitlement, so there is no saturation to measure yet.',
          )}
        </p>
      )}

      <TableCard>
        <TableCard.Header>
          <TableCard.HeaderLeading>
            <TableCard.HeaderIcon>
              <InstanceIcon />
            </TableCard.HeaderIcon>
            <TableCard.HeaderHeading>
              <TableCard.HeaderTitle className="text-lg">
                {t(
                  'Pages.Entitlements.Detail.Usage.atRiskInstances.title',
                  'At-risk Instances',
                )}
              </TableCard.HeaderTitle>
              <TableCard.HeaderSubtitle>
                {t(
                  'Pages.Entitlements.Detail.Usage.atRiskInstances.description',
                  'Instances currently near or over threshold for this entitlement.',
                )}
              </TableCard.HeaderSubtitle>
            </TableCard.HeaderHeading>
          </TableCard.HeaderLeading>
        </TableCard.Header>
        <TableCard.Table
          columns={atRiskColumns}
          data={atRiskInstances}
          variant="simple"
          emptyMessage={t(
            'Pages.Entitlements.Detail.Usage.atRiskInstances.empty',
            'No instances are currently near or over limit.',
          )}
        />
      </TableCard>

      <EntitlementDetailCoverageCard />
    </div>
  );
}
