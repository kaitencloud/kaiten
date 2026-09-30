import { Badge } from '@/components/ui/badge';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type ColumnDef, TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useFeatureFlagDetailContext } from './context';
import { toInlineJson } from './shared';
import type { FeatureFlagVariant } from './types';

export function FeatureFlagDetailVariantsTab() {
  const { t } = useTranslation();
  const FeatureFlagIcon = dataModelIcons.featureFlag;
  const { featureFlag, variants } = useFeatureFlagDetailContext();
  const columns = useMemo<ColumnDef<FeatureFlagVariant>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t(
          'Pages.FeatureFlags.Detail.Variants.definition.columns.variant',
        ),
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono">
            {row.original.name}
          </Badge>
        ),
      },
      {
        accessorKey: 'description',
        header: t(
          'Pages.FeatureFlags.Detail.Variants.definition.columns.description',
        ),
        meta: { cellClassName: 'text-sm text-muted-foreground' },
      },
      {
        accessorKey: 'value',
        header: t(
          'Pages.FeatureFlags.Detail.Variants.definition.columns.payloadPreview',
        ),
        meta: { cellClassName: 'whitespace-normal' },
        cell: ({ row }) => (
          <code className="block max-w-xl break-all rounded bg-muted px-2 py-1 text-xs">
            {toInlineJson(row.original.value)}
          </code>
        ),
      },
      {
        id: 'usedInDefault',
        header: t(
          'Pages.FeatureFlags.Detail.Variants.definition.columns.usedInDefault',
        ),
        cell: ({ row }) => {
          const strategy = featureFlag.default_variant;

          // A simple strategy has one default, not a 100 % / 0 % split: name
          // it, and leave the others blank. Percentages only mean something
          // for a rollout.
          if (strategy.type === 'basic') {
            return strategy.value === row.original.name ? (
              <Badge variant="secondary">
                {t('Pages.FeatureFlags.Detail.Variants.defaultUsage.default')}
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          }

          if (strategy.type === 'rollout_percentage') {
            return (
              <Badge variant="secondary">
                {`${strategy.distribution[row.original.name] ?? 0}%`}
              </Badge>
            );
          }

          const isDateBased =
            strategy.start.variant === row.original.name ||
            strategy.end.variant === row.original.name;

          return isDateBased ? (
            <Badge variant="secondary">
              {t('Pages.FeatureFlags.Detail.Variants.defaultUsage.dateBased')}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
    ],
    [featureFlag.default_variant, t],
  );

  return (
    <div className="space-y-4">
      <TableCard>
        <TableCard.Header>
          <TableCard.HeaderLeading>
            <TableCard.HeaderIcon>
              <FeatureFlagIcon />
            </TableCard.HeaderIcon>
            <TableCard.HeaderHeading>
              <TableCard.HeaderTitle className="text-lg">
                {t('Pages.FeatureFlags.Detail.Variants.definition.title')}
              </TableCard.HeaderTitle>
              <TableCard.HeaderSubtitle>
                {t('Pages.FeatureFlags.Detail.Variants.definition.description')}
              </TableCard.HeaderSubtitle>
            </TableCard.HeaderHeading>
          </TableCard.HeaderLeading>
        </TableCard.Header>
        <TableCard.Table
          columns={columns}
          data={variants}
          variant="simple"
          emptyMessage={t(
            'Pages.FeatureFlags.Detail.Variants.definition.empty',
          )}
        />
      </TableCard>
    </div>
  );
}
