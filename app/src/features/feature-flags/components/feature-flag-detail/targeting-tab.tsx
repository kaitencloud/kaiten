import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CheckCircle, Hash, Percent } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDetailDateTime } from '@/lib/detail';
import { useFeatureFlagDetailContext } from './context';
import {
  DistributionBars,
  getDefaultVariantTypeLabel,
  InfoRow,
  toInlineJson,
} from './shared';

export function FeatureFlagDetailTargetingTab() {
  const { t } = useTranslation();
  const { featureFlag, locale, targetings, variantMap } =
    useFeatureFlagDetailContext();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t('Pages.FeatureFlags.Detail.Targeting.rules.title')}
          </CardTitle>
          <CardDescription>
            {t('Pages.FeatureFlags.Detail.Targeting.rules.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {targetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('Pages.FeatureFlags.Detail.Targeting.rules.empty')}
            </p>
          ) : (
            targetings.map((targeting, index) => (
              <div key={targeting.name} className="rounded-lg border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {t('Pages.FeatureFlags.Detail.Targeting.rules.index', {
                        index: index + 1,
                      })}
                    </Badge>
                    <p className="font-medium">{targeting.name}</p>
                    <Badge variant="outline">
                      {t(`Pages.FeatureFlags.TargetingTypes.${targeting.type}`)}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-md bg-muted p-2 text-xs font-mono">
                  {targeting.rule}
                </div>

                <div className="mt-3">
                  {targeting.type === 'basic' ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <CheckCircle className="size-4 text-success-subtle-foreground" />
                      {t(
                        'Pages.FeatureFlags.Detail.Targeting.rules.returnVariant',
                      )}
                      <Badge variant="outline" className="font-mono">
                        {targeting.variant}
                      </Badge>
                      <code className="rounded bg-muted px-2 py-1 text-xs">
                        {toInlineJson(
                          variantMap.get(targeting.variant)?.value ??
                            t(
                              'Pages.FeatureFlags.Detail.fallback.unknownVariant',
                            ),
                        )}
                      </code>
                    </div>
                  ) : null}

                  {targeting.type === 'rollout_percentage' ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Percent className="size-4" />
                        {t(
                          'Pages.FeatureFlags.Detail.Targeting.rules.distribution',
                        )}
                      </div>
                      <DistributionBars distribution={targeting.distribution} />
                      <p className="text-xs text-muted-foreground">
                        {t('Pages.FeatureFlags.Detail.Targeting.rules.total', {
                          total: Object.values(targeting.distribution).reduce(
                            (acc, curr) => acc + curr,
                            0,
                          ),
                        })}
                      </p>
                    </div>
                  ) : null}

                  {targeting.type === 'rollout_date' ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoRow
                        label={t(
                          'Pages.FeatureFlags.Detail.Targeting.rules.start',
                        )}
                        value={
                          <span className="space-y-1 text-xs">
                            <span className="block">
                              {formatDetailDateTime(
                                targeting.start.date,
                                locale,
                              )}
                            </span>
                            <span className="block text-muted-foreground">
                              {targeting.start.percentage}% -{' '}
                              {targeting.start.variant}
                            </span>
                          </span>
                        }
                      />
                      <InfoRow
                        label={t(
                          'Pages.FeatureFlags.Detail.Targeting.rules.end',
                        )}
                        value={
                          <span className="space-y-1 text-xs">
                            <span className="block">
                              {formatDetailDateTime(targeting.end.date, locale)}
                            </span>
                            <span className="block text-muted-foreground">
                              {targeting.end.percentage}% -{' '}
                              {targeting.end.variant}
                            </span>
                          </span>
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}

          <div className="rounded-lg border border-dashed p-4">
            <div className="flex items-center gap-2">
              <Hash className="size-4 text-muted-foreground" />
              <p className="font-medium">
                {t('Pages.FeatureFlags.Detail.Targeting.fallback.title')}
              </p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('Pages.FeatureFlags.Detail.Targeting.fallback.description', {
                type: getDefaultVariantTypeLabel(
                  featureFlag.default_variant.type,
                  t,
                ),
              })}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
