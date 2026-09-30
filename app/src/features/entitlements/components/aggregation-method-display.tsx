import { useTranslation } from 'react-i18next';

export type AggregationMethod =
  | 'COUNT'
  | 'SUM'
  | 'AVERAGE'
  | 'MIN'
  | 'MAX'
  | 'LATEST';

interface AggregationMethodDisplayProps {
  aggregationMethod: AggregationMethod | null | undefined;
  className?: string;
}

export function AggregationMethodDisplay({
  aggregationMethod,
  className = 'text-sm font-medium',
}: AggregationMethodDisplayProps) {
  const { t } = useTranslation();

  if (!aggregationMethod) {
    return (
      <span className={`${className} text-muted-foreground`}>
        {t('Pages.Entitlements.Detail.fallback.notAvailable', 'n/a')}
      </span>
    );
  }

  return (
    <span className={className}>
      {t(`Pages.Entitlements.AggregationMethods.${aggregationMethod}`)}
    </span>
  );
}
