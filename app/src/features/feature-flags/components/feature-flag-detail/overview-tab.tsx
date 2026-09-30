import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { DetailCard } from '@/functionals/detail-card';
import { formatDetailDateTime } from '@/lib/detail';
import { useFeatureFlagDetailContext } from './context';
import {
  DistributionBars,
  getDefaultVariantTypeLabel,
  InfoRow,
  toPrettyJson,
} from './shared';

export function FeatureFlagDetailOverviewTab() {
  const { t } = useTranslation();
  const {
    createdAt,
    createdByName,
    defaultDistributionTotal,
    eventName,
    featureFlag,
    locale,
    owner,
    updatedAt,
    updatedByName,
  } = useFeatureFlagDetailContext();

  return (
    <div className="space-y-4">
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title>
            {t('Pages.FeatureFlags.Detail.Overview.general.title')}
          </DetailCard.Title>
          <DetailCard.Description>
            {t('Pages.FeatureFlags.Detail.Overview.general.description')}
          </DetailCard.Description>
        </DetailCard.Header>
        <DetailCard.Content>
          <DetailCard.Rows>
            <DetailCard.Row
              label={t(
                'Pages.FeatureFlags.Detail.Overview.general.fields.type',
              )}
              value={
                <span className="capitalize">
                  {t(`Pages.FeatureFlags.Types.${featureFlag.type}`)}
                </span>
              }
            />
            <DetailCard.Row
              label={t(
                'Pages.FeatureFlags.Detail.Overview.general.fields.eventName',
              )}
              value={
                <code className="inline-flex w-fit rounded bg-muted px-2 py-1 font-mono text-xs">
                  {eventName}
                </code>
              }
            />
            <DetailCard.Row
              label={t(
                'Pages.FeatureFlags.Detail.Overview.general.fields.slug',
              )}
              value={
                <code className="inline-flex w-fit rounded bg-muted px-2 py-1 font-mono text-xs">
                  {featureFlag.slug}
                </code>
              }
            />
            <DetailCard.Row
              label={t(
                'Pages.FeatureFlags.Detail.Overview.general.fields.enabled',
              )}
              value={
                <Badge variant={featureFlag.enabled ? 'success' : 'secondary'}>
                  {featureFlag.enabled
                    ? t('Pages.FeatureFlags.Detail.enabled')
                    : t('Pages.FeatureFlags.Detail.disabled')}
                </Badge>
              }
            />
            <DetailCard.Row
              label={t(
                'Pages.FeatureFlags.Detail.Overview.general.fields.owner',
              )}
              value={owner}
            />
          </DetailCard.Rows>

          {/* The flags API carries no audit stamps yet: rather than two
              "n/a · by Unknown user" columns, the block waits for the data. */}
          {createdAt || updatedAt ? (
            <>
              <DetailCard.Divider />

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'Pages.FeatureFlags.Detail.Overview.general.audit.createdAt',
                    )}
                  </p>
                  <p className="text-sm">
                    {createdAt
                      ? formatDetailDateTime(createdAt, locale)
                      : t('Pages.FeatureFlags.Detail.fallback.notAvailable')}
                  </p>
                  {createdByName ? (
                    <p className="text-xs text-muted-foreground">
                      {t('Pages.FeatureFlags.Detail.Overview.general.audit.by')}{' '}
                      {createdByName}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'Pages.FeatureFlags.Detail.Overview.general.audit.updatedAt',
                    )}
                  </p>
                  <p className="text-sm">
                    {updatedAt
                      ? formatDetailDateTime(updatedAt, locale)
                      : t('Pages.FeatureFlags.Detail.fallback.notAvailable')}
                  </p>
                  {updatedByName ? (
                    <p className="text-xs text-muted-foreground">
                      {t('Pages.FeatureFlags.Detail.Overview.general.audit.by')}{' '}
                      {updatedByName}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </DetailCard.Content>
      </DetailCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t('Pages.FeatureFlags.Detail.Overview.defaultVariant.title')}
            </CardTitle>
            <CardDescription>
              {t(
                'Pages.FeatureFlags.Detail.Overview.defaultVariant.description',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {getDefaultVariantTypeLabel(
                  featureFlag.default_variant.type,
                  t,
                )}
              </Badge>
              {defaultDistributionTotal !== null ? (
                <Badge
                  variant={
                    defaultDistributionTotal === 100 ? 'success' : 'destructive'
                  }
                >
                  {t(
                    'Pages.FeatureFlags.Detail.Overview.defaultVariant.total',
                    {
                      count: defaultDistributionTotal,
                    },
                  )}
                </Badge>
              ) : null}
            </div>

            {featureFlag.default_variant.type === 'basic' ? (
              <div className="rounded-md border p-3 text-sm">
                {t(
                  'Pages.FeatureFlags.Detail.Overview.defaultVariant.basicValue',
                  {
                    variant: featureFlag.default_variant.value,
                  },
                )}
              </div>
            ) : null}

            {featureFlag.default_variant.type === 'rollout_date' ? (
              <div className="grid gap-3 md:grid-cols-2">
                <InfoRow
                  label={t(
                    'Pages.FeatureFlags.Detail.Overview.defaultVariant.start',
                  )}
                  value={`${formatDetailDateTime(featureFlag.default_variant.start.date, locale)} (${featureFlag.default_variant.start.percentage}%)`}
                />
                <InfoRow
                  label={t(
                    'Pages.FeatureFlags.Detail.Overview.defaultVariant.end',
                  )}
                  value={`${formatDetailDateTime(featureFlag.default_variant.end.date, locale)} (${featureFlag.default_variant.end.percentage}%)`}
                />
              </div>
            ) : null}

            {featureFlag.default_variant.type === 'rollout_percentage' ? (
              <DistributionBars
                distribution={featureFlag.default_variant.distribution}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {t('Pages.FeatureFlags.Detail.Overview.metadata.title')}
            </CardTitle>
            <CardDescription>
              {t('Pages.FeatureFlags.Detail.Overview.metadata.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(featureFlag.metadata).length > 0 ? (
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {toPrettyJson(featureFlag.metadata)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('Pages.FeatureFlags.Detail.Overview.metadata.empty')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
