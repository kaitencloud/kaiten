import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DASHBOARD_RANGES, type DashboardRange } from '../search';

type RangeControlProps = {
  value: DashboardRange;
  onChange: (range: DashboardRange) => void;
};

/** The period of the figures: three buttons, one pressed. */
export function RangeControl({ value, onChange }: RangeControlProps) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t('Pages.Dashboard.range.label')}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1"
    >
      {DASHBOARD_RANGES.map((range) => (
        <Button
          key={range}
          type="button"
          size="sm"
          variant={range === value ? 'secondary' : 'ghost'}
          aria-pressed={range === value}
          className={
            range === value ? 'bg-background shadow-xs hover:bg-background' : ''
          }
          onClick={() => onChange(range)}
        >
          {t(`Pages.Dashboard.range.${range}`)}
        </Button>
      ))}
    </div>
  );
}
