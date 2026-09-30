import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Calendar, Target } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type ColumnDef, TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useFeatureFlagDetailContext } from './context';
import {
  formatNumber,
  getDefaultVariantTypeLabel,
  JsonContextDialog,
  toInlineJson,
} from './shared';
import type { EvaluationSample } from './types';

export function FeatureFlagDetailEvaluationTab() {
  const { t } = useTranslation();
  const FeatureFlagIcon = dataModelIcons.featureFlag;
  const {
    distinctVariantsCount,
    featureFlag,
    locale,
    owner,
    sampleEvaluations,
    targetings,
  } = useFeatureFlagDetailContext();
  const columns = useMemo<ColumnDef<EvaluationSample>[]>(
    () => [
      {
        accessorKey: 'context',
        header: t(
          'Pages.FeatureFlags.Detail.Evaluation.samples.columns.context',
        ),
        meta: {
          cellClassName: 'whitespace-normal',
          headerClassName: 'w-[15%] whitespace-normal',
        },
        cell: ({ row }) => (
          <div className="flex justify-center">
            <JsonContextDialog
              context={row.original.context}
              evaluationId={row.original.id}
            />
          </div>
        ),
      },
      {
        accessorKey: 'variant',
        header: t(
          'Pages.FeatureFlags.Detail.Evaluation.samples.columns.variant',
        ),
        meta: {
          cellClassName: 'whitespace-normal',
          headerClassName: 'w-[25%] whitespace-normal',
        },
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono">
            {row.original.variant}
          </Badge>
        ),
      },
      {
        accessorKey: 'reason',
        header: t(
          'Pages.FeatureFlags.Detail.Evaluation.samples.columns.reason',
        ),
        meta: {
          cellClassName: 'whitespace-normal break-words',
          headerClassName: 'w-[30%] whitespace-normal',
        },
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.reason}</Badge>
        ),
      },
      {
        accessorKey: 'value',
        header: t('Pages.FeatureFlags.Detail.Evaluation.samples.columns.value'),
        meta: {
          cellClassName: 'whitespace-normal break-all text-sm',
          headerClassName: 'w-[30%] whitespace-normal',
        },
        cell: ({ row }) => <code>{toInlineJson(row.original.value)}</code>,
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <TableCard className="lg:col-span-2">
        <TableCard.Header>
          <TableCard.HeaderLeading>
            <TableCard.HeaderIcon>
              <FeatureFlagIcon />
            </TableCard.HeaderIcon>
            <TableCard.HeaderHeading>
              <TableCard.HeaderTitle className="text-lg">
                {t('Pages.FeatureFlags.Detail.Evaluation.samples.title')}
              </TableCard.HeaderTitle>
              <TableCard.HeaderSubtitle>
                {t('Pages.FeatureFlags.Detail.Evaluation.samples.description')}
              </TableCard.HeaderSubtitle>
            </TableCard.HeaderHeading>
          </TableCard.HeaderLeading>
        </TableCard.Header>
        <TableCard.Table
          columns={columns}
          data={sampleEvaluations}
          variant="simple"
          tableClassName="table-fixed"
          emptyMessage={t('Pages.FeatureFlags.Detail.Evaluation.samples.empty')}
        />
      </TableCard>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t('Pages.FeatureFlags.Detail.Evaluation.session.title')}
          </CardTitle>
          <CardDescription>
            {t('Pages.FeatureFlags.Detail.Evaluation.session.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-muted-foreground">
              {t('Pages.FeatureFlags.Detail.Evaluation.session.evaluations')}
            </span>
            <span className="font-semibold">
              {formatNumber(sampleEvaluations.length, locale)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-muted-foreground">
              {t(
                'Pages.FeatureFlags.Detail.Evaluation.session.distinctVariants',
              )}
            </span>
            <span className="font-semibold">
              {formatNumber(distinctVariantsCount, locale)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-muted-foreground">
              {t('Pages.FeatureFlags.Detail.Evaluation.session.targetingRules')}
            </span>
            <span className="font-semibold">
              {formatNumber(targetings.length, locale)}
            </span>
          </div>

          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <div className="mb-2 flex items-center gap-1">
              <Calendar className="size-3.5" />
              {t('Pages.FeatureFlags.Detail.Evaluation.session.owner', {
                owner,
              })}
            </div>
            <div className="flex items-center gap-1">
              <Target className="size-3.5" />
              {t(
                'Pages.FeatureFlags.Detail.Evaluation.session.defaultStrategy',
                {
                  type: getDefaultVariantTypeLabel(
                    featureFlag.default_variant.type,
                    t,
                  ),
                },
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
