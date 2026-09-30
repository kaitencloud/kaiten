import { useTranslation } from 'react-i18next';

export const ChartEmptyState = ({ message }: { message?: string }) => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-55 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {message ?? t('Common.charts.emptyState')}
    </div>
  );
};
